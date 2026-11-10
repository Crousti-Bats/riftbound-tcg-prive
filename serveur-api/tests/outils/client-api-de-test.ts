/** Client HTTP de test : appelle l'API comme le ferait le navigateur (Origin, JSON, cookie de session). */
import { app } from "../../point-entree-api";
import { empreinteSha256 } from "../../securite/jetons-et-empreintes";
import { creerBaseDeTest } from "./base-d1-de-test";

export const ORIGINE = "http://localhost";

export interface OptionsAppel {
  corps?: unknown;
  cookie?: string | null;
  /** Cookie « appareil connu » (__Host-appareil), reçu à la connexion ou à l'inscription. */
  appareil?: string | null;
  ip?: string;
  entetes?: Record<string, string>;
}

export function creerEnvironnementDeTest() {
  const { bd, d1 } = creerBaseDeTest();
  const env = { BASE_DE_DONNEES: d1 } as unknown as Env;

  async function appeler(methode: string, chemin: string, options: OptionsAppel = {}) {
    const entetes: Record<string, string> = {
      Origin: ORIGINE,
      "CF-Connecting-IP": options.ip ?? "203.0.113.10",
      ...(options.corps !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(options.cookie || options.appareil
        ? {
            Cookie: [
              options.cookie ? `__Host-session=${options.cookie}` : "",
              options.appareil ? `__Host-appareil=${options.appareil}` : "",
            ]
              .filter(Boolean)
              .join("; "),
          }
        : {}),
      ...options.entetes,
    };
    const reponse = await app.request(
      chemin,
      {
        method: methode,
        headers: entetes,
        body: options.corps !== undefined ? JSON.stringify(options.corps) : undefined,
      },
      env,
    );
    const setCookie = reponse.headers.get("Set-Cookie") ?? "";
    const cookie = /__Host-session=([^;]*)/.exec(setCookie)?.[1] ?? null;
    const appareil = /__Host-appareil=([^;]*)/.exec(setCookie)?.[1] ?? null;
    const texte = await reponse.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(texte) as Record<string, unknown>;
    } catch {
      /* réponse non JSON */
    }
    return { statut: reponse.status, json, texte, cookie, appareil, setCookie };
  }

  /** Insère directement une invitation (comme le fait la commande admin) et renvoie son code. */
  async function creerInvitation(options: { role?: "joueur" | "admin"; pseudoReserve?: string; expireDansMs?: number } = {}) {
    const code = `code-de-test-${Math.random().toString(36).slice(2)}-abcdefghijklmnop`;
    bd.prepare(
      "INSERT INTO invitations (code_hash, role, pseudo_reserve, cree_le, expire_le) VALUES (?, ?, ?, ?, ?)",
    ).run(
      await empreinteSha256(code),
      options.role ?? "joueur",
      options.pseudoReserve ?? null,
      Date.now(),
      Date.now() + (options.expireDansMs ?? 3_600_000),
    );
    return code;
  }

  /** Crée un compte via la vraie route d'inscription et renvoie son cookie de session. */
  async function inscrire(pseudo: string, motDePasse: string, role: "joueur" | "admin" = "joueur") {
    const code = await creerInvitation({ role });
    const r = await appeler("POST", "/api/auth/inscription", { corps: { code, pseudo, motDePasse } });
    if (r.statut !== 201 || !r.cookie) throw new Error(`inscription impossible : ${r.statut} ${r.texte}`);
    return r.cookie;
  }

  return { bd, env, appeler, creerInvitation, inscrire };
}
