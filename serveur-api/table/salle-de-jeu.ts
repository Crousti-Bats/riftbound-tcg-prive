/**
 * Durable Object « SalleDeJeu » : une instance par partie (nommée d'après le code). Elle garde l'état de la table
 * et relaie les gestes des deux joueurs en temps réel par WebSocket (API « hibernation » : la salle peut dormir
 * entre deux actions sans couper les connexions, ce qui ne coûte rien).
 *
 * Elle n'est joignable que par le Worker (binding SALLES), jamais directement par un navigateur : le Worker
 * vérifie la session et la participation, puis transmet l'identifiant du joueur dans l'en-tête X-Table-Joueur.
 * Classe simple (sans `extends DurableObject`) : toute la logique est dans moteur-table.ts, testé sans Cloudflare.
 */
import { z } from "zod";
import { type DeckDeTable, type EtatTable, type IndexJoueur, aleatoireCrypto, appliquerAction, creerPartie, vuePour } from "./moteur-table";
import { schemaAction } from "./schema-action";

const TAILLE_MAX_MESSAGE = 4096;
/** Anti-abus : 40 messages par tranche de 10 secondes et par connexion. */
const MESSAGES_MAX = 40;
const FENETRE_MS = 10_000;

const schemaDeck = z.strictObject({
  legende: z.string().max(40),
  champion: z.string().max(40),
  principal: z.array(z.string().max(40)).max(200),
  runes: z.array(z.string().max(40)).max(40),
  terrains: z.array(z.string().max(40)).max(5),
});
const schemaInitialisation = z.strictObject({
  code: z.string().regex(/^[A-Z0-9]{8}$/),
  joueurs: z.tuple([
    z.strictObject({ id: z.number().int(), pseudo: z.string().max(20), deck: schemaDeck }),
    z.strictObject({ id: z.number().int(), pseudo: z.string().max(20), deck: schemaDeck }),
  ]),
  tokens: z.array(z.string().regex(/^[a-z0-9-]{3,40}$/)).max(100).default([]),
});
const schemaMessage = z.strictObject({ type: z.literal("action"), action: schemaAction });

interface Piece {
  j: IndexJoueur;
}

export class SalleDeJeu {
  private etat: EtatTable | null = null;
  private readonly debits = new Map<WebSocket, number[]>();

  /** Le second argument (env) n'est pas utilisé : la salle ne parle qu'au Worker. */
  constructor(private readonly ctx: DurableObjectState) {}

  private async charger(): Promise<EtatTable | null> {
    if (!this.etat) this.etat = (await this.ctx.storage.get<EtatTable>("etat")) ?? null;
    return this.etat;
  }

  async fetch(requete: Request): Promise<Response> {
    const url = new URL(requete.url);
    if (url.pathname === "/initialiser" && requete.method === "POST") return this.initialiser(requete);
    if (url.pathname === "/fin" && requete.method === "POST") return this.terminer();
    if (url.pathname === "/ws") return this.connecter(requete);
    return new Response("introuvable", { status: 404 });
  }

  private async initialiser(requete: Request): Promise<Response> {
    if (await this.charger()) return Response.json({ erreur: "deja_initialisee" }, { status: 409 });
    const donnees = schemaInitialisation.safeParse(await requete.json().catch(() => null));
    if (!donnees.success) return Response.json({ erreur: "donnees_invalides" }, { status: 400 });
    const { code, joueurs, tokens } = donnees.data;
    this.etat = creerPartie(code, joueurs as [{ id: number; pseudo: string; deck: DeckDeTable }, { id: number; pseudo: string; deck: DeckDeTable }], aleatoireCrypto, Date.now(), tokens);
    await this.ctx.storage.put("etat", this.etat);
    return Response.json({ ok: true });
  }

  /** Fin de partie : on prévient les joueurs connectés, on ferme et on efface tout (plus rien n'est stocké). */
  private async terminer(): Promise<Response> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ type: "fin" }));
        ws.close(1000, "partie terminée");
      } catch {
        /* déjà fermée */
      }
    }
    this.etat = null;
    await this.ctx.storage.deleteAll();
    return Response.json({ ok: true });
  }

  private async connecter(requete: Request): Promise<Response> {
    if (requete.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("websocket attendu", { status: 426 });
    const etat = await this.charger();
    if (!etat) return new Response("partie non commencée", { status: 404 });
    const idJoueur = Number(requete.headers.get("X-Table-Joueur"));
    const index = etat.joueurs.findIndex((p) => p.id === idJoueur);
    if (index < 0) return new Response("interdit", { status: 403 });
    const j = index as IndexJoueur;

    const paire = new WebSocketPair();
    const [client, serveur] = [paire[0], paire[1]];
    this.ctx.acceptWebSocket(serveur);
    serveur.serializeAttachment({ j } satisfies Piece);
    serveur.send(JSON.stringify({ type: "vue", vue: vuePour(etat, j) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const piece = ws.deserializeAttachment() as Piece | null;
    if (!piece || typeof message !== "string" || message.length > TAILLE_MAX_MESSAGE) return;
    const maintenant = Date.now();
    const recents = (this.debits.get(ws) ?? []).filter((t) => maintenant - t < FENETRE_MS);
    recents.push(maintenant);
    this.debits.set(ws, recents);
    if (recents.length > MESSAGES_MAX) {
      ws.send(JSON.stringify({ type: "erreur", erreur: "trop_rapide" }));
      return;
    }

    let brut: unknown;
    try {
      brut = JSON.parse(message);
    } catch {
      return;
    }
    const lu = schemaMessage.safeParse(brut);
    if (!lu.success) {
      ws.send(JSON.stringify({ type: "erreur", erreur: "action_invalide" }));
      return;
    }
    const etat = await this.charger();
    if (!etat) return;
    const resultat = appliquerAction(etat, piece.j, lu.data.action, aleatoireCrypto, maintenant);
    if (!resultat.ok) {
      ws.send(JSON.stringify({ type: "erreur", erreur: resultat.erreur }));
      return;
    }
    await this.ctx.storage.put("etat", etat);
    this.diffuser(etat);
  }

  /** Chaque joueur reçoit SA vue (sa main visible, celle de l'autre réduite à un nombre). */
  private diffuser(etat: EtatTable): void {
    for (const ws of this.ctx.getWebSockets()) {
      const piece = ws.deserializeAttachment() as Piece | null;
      if (!piece) continue;
      try {
        ws.send(JSON.stringify({ type: "vue", vue: vuePour(etat, piece.j) }));
      } catch {
        /* connexion en cours de fermeture */
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.debits.delete(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, "fermeture");
    } catch {
      /* déjà fermée */
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.debits.delete(ws);
  }
}
