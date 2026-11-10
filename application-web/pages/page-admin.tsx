/**
 * Page d'administration (réservée au rôle admin, vérifié aussi côté serveur).
 * Il faut re-saisir son mot de passe pour l'ouvrir ; elle se referme après 15 minutes d'inactivité.
 */
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { TableauMonitoring } from "../composants/tableau-monitoring";
import { appelerApi, type CompteCourant, ErreurApi } from "../outils/appels-api";
import { formaterDate, naviguer } from "../outils/navigation";

interface Invitation {
  id: number;
  role: string;
  pseudoReserve: string | null;
  note: string | null;
  creeLe: number;
  expireLe: number;
  utiliseeLe: number | null;
  utiliseePar: string | null;
  revoquee: number;
}

interface Compte {
  id: number;
  pseudo: string;
  role: string;
  actif: number;
  creeLe: number;
  derniereActivite: number | null;
  sessionsActives: number;
}

interface Evenement {
  id: number;
  horodatage: number;
  categorie: string;
  type: string;
  pseudo: string | null;
  ip: string | null;
  details: string | null;
}

type Onglet = "monitoring" | "annonce" | "invitations" | "comptes" | "journal";

const LIBELLES_ONGLETS: Record<Onglet, string> = {
  monitoring: "Monitoring",
  annonce: "Annonce",
  invitations: "Invitations",
  comptes: "Comptes",
  journal: "Journal",
};

interface Props {
  compte: CompteCourant;
  surChangementCompte: () => Promise<void>;
}

export function PageAdmin({ compte, surChangementCompte }: Props) {
  const [onglet, setOnglet] = useState<Onglet>("monitoring");

  async function fermer() {
    await appelerApi("POST", "/admin/fermer", {}).catch(() => undefined);
    await surChangementCompte();
    naviguer("/");
  }

  return (
    <main className="conteneur">
      <header className="entete">
        <h1>Administration</h1>
        <nav className="barre-actions">
          {compte.adminActif && <button className="secondaire" onClick={fermer}>Fermer l'accès admin</button>}
        </nav>
      </header>
      {!compte.adminActif ? (
        <FormulaireElevation surSucces={surChangementCompte} />
      ) : (
        <>
          <nav className="onglets">
            {(Object.keys(LIBELLES_ONGLETS) as Onglet[]).map((o) => (
              <button key={o} className={o === onglet ? "onglet actif" : "onglet"} onClick={() => setOnglet(o)}>
                {LIBELLES_ONGLETS[o]}
              </button>
            ))}
          </nav>
          {onglet === "monitoring" && <TableauMonitoring surExpiration={surChangementCompte} />}
          {onglet === "annonce" && <OngletAnnonce surExpiration={surChangementCompte} />}
          {onglet === "invitations" && <OngletInvitations surExpiration={surChangementCompte} />}
          {onglet === "comptes" && <OngletComptes moi={compte.pseudo} surExpiration={surChangementCompte} />}
          {onglet === "journal" && <OngletJournal surExpiration={surChangementCompte} />}
        </>
      )}
    </main>
  );
}

function FormulaireElevation({ surSucces }: { surSucces: () => Promise<void> }) {
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      await appelerApi("POST", "/admin/elevation", { motDePasse });
      setMotDePasse("");
      await surSucces();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  return (
    <form className="carte formulaire conteneur-etroit" onSubmit={envoyer}>
      <h2>Confirme ton mot de passe</h2>
      <p className="aide">Par sécurité, l'accès admin demande ton mot de passe et se referme après 15 minutes d'inactivité.</p>
      <label>
        Mot de passe
        <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} autoComplete="current-password" required />
      </label>
      {erreur && <p className="message-erreur">{erreur}</p>}
      <button type="submit">Ouvrir l'administration</button>
    </form>
  );
}

/** Charge des données admin ; si l'accès a expiré, renvoie vers le formulaire de mot de passe. */
function useDonneesAdmin<T>(chemin: string, surExpiration: () => Promise<void>) {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const gererErreur = useCallback(
    async (e: unknown) => {
      if (e instanceof ErreurApi && e.code === "elevation_requise") await surExpiration();
      else setErreur((e as Error).message);
    },
    [surExpiration],
  );
  const recharger = useCallback(async () => {
    try {
      setDonnees(await appelerApi<T>("GET", chemin));
      setErreur(null);
    } catch (e) {
      await gererErreur(e);
    }
  }, [chemin, gererErreur]);
  useEffect(() => {
    appelerApi<T>("GET", chemin).then(setDonnees, gererErreur);
  }, [chemin, gererErreur]);
  return { donnees, erreur, recharger, setErreur };
}

const LONGUEUR_MAX_ANNONCE = 300;

/** Bandeau d'annonce : une seule annonce à la fois, affichée en grand à tous les joueurs connectés. */
function OngletAnnonce({ surExpiration }: { surExpiration: () => Promise<void> }) {
  const { donnees, erreur, recharger, setErreur } = useDonneesAdmin<{ annonce: { id: number; texte: string; creeLe: number } | null }>(
    "/annonce-site",
    surExpiration,
  );
  const [texte, setTexte] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  async function agir(action: () => Promise<unknown>, succes: string) {
    setInfo(null);
    try {
      await action();
      setInfo(succes);
      await recharger();
    } catch (err) {
      if (err instanceof ErreurApi && err.code === "elevation_requise") await surExpiration();
      else setErreur((err as Error).message);
    }
  }

  async function publier(e: FormEvent) {
    e.preventDefault();
    await agir(async () => {
      await appelerApi("POST", "/admin/annonce-site", { texte: texte.trim() });
      setTexte("");
    }, "Annonce publiée : tous les joueurs la voient en haut du site.");
  }

  async function retirer() {
    if (!window.confirm("Retirer l'annonce pour tout le monde ?")) return;
    await agir(() => appelerApi("DELETE", "/admin/annonce-site"), "Annonce retirée.");
  }

  const annonce = donnees?.annonce ?? null;
  return (
    <section className="pile">
      <div className="carte pile">
        <h2>Annonce en cours</h2>
        {annonce ? (
          <>
            <p className="apercu-annonce">
              <strong>{annonce.texte}</strong>
            </p>
            <p className="aide">Publiée le {formaterDate(annonce.creeLe)}.</p>
            <div className="barre-actions">
              <button className="secondaire" onClick={() => void retirer()}>
                Retirer l'annonce
              </button>
            </div>
          </>
        ) : (
          <p className="aide">Aucune annonce affichée.</p>
        )}
      </div>
      <form className="carte formulaire" onSubmit={publier}>
        <h2>{annonce ? "Remplacer l'annonce" : "Publier une annonce"}</h2>
        <p className="aide">
          Affichée en grand bandeau en haut du site pour tous les joueurs connectés. Chacun peut la fermer ; une nouvelle annonce
          réapparaît pour tout le monde.
        </p>
        <label>
          Texte ({texte.trim().length}/{LONGUEUR_MAX_ANNONCE})
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            maxLength={LONGUEUR_MAX_ANNONCE}
            rows={3}
            required
            placeholder="Ex. : Tous les boosters sont remis à 10/10, bonnes ouvertures !"
          />
        </label>
        <button type="submit" disabled={!texte.trim()}>
          Publier le bandeau
        </button>
      </form>
      {info && <p className="aide">{info}</p>}
      {erreur && <p className="message-erreur">{erreur}</p>}
    </section>
  );
}

function statutInvitation(i: Invitation): string {
  if (i.utiliseePar) return `Utilisée par ${i.utiliseePar}`;
  if (i.utiliseeLe) return "Utilisée";
  if (i.revoquee) return "Révoquée";
  if (i.expireLe < Date.now()) return "Expirée";
  return "En attente";
}

function OngletInvitations({ surExpiration }: { surExpiration: () => Promise<void> }) {
  const { donnees, erreur, recharger, setErreur } = useDonneesAdmin<{ invitations: Invitation[] }>("/admin/invitations", surExpiration);
  const [note, setNote] = useState("");
  const [pseudoReserve, setPseudoReserve] = useState("");
  const [dureeHeures, setDureeHeures] = useState(48);
  const [lien, setLien] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  async function creer(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await appelerApi<{ code: string }>("POST", "/admin/invitations", {
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(pseudoReserve.trim() ? { pseudoReserve: pseudoReserve.trim() } : {}),
        dureeHeures,
      });
      setLien(`${window.location.origin}/inscription#code=${r.code}`);
      setCopie(false);
      setNote("");
      setPseudoReserve("");
      await recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function revoquer(id: number) {
    if (!window.confirm("Révoquer cette invitation ?")) return;
    try {
      await appelerApi("DELETE", `/admin/invitations/${id}`);
      await recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function copier() {
    if (!lien) return;
    await navigator.clipboard.writeText(lien);
    setCopie(true);
  }

  return (
    <section className="pile">
      <form className="carte formulaire" onSubmit={creer}>
        <h2>Nouvelle invitation</h2>
        <div className="grille-champs">
          <label>
            Pour qui ? <span className="aide">(note libre)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={100} placeholder="ex. Bob du club" />
          </label>
          <label>
            Pseudo réservé <span className="aide">(optionnel)</span>
            <input value={pseudoReserve} onChange={(e) => setPseudoReserve(e.target.value)} pattern="[A-Za-z0-9_\-]{3,20}" />
          </label>
          <label>
            Valable
            <select value={dureeHeures} onChange={(e) => setDureeHeures(Number(e.target.value))}>
              <option value={24}>24 heures</option>
              <option value={48}>48 heures</option>
              <option value={168}>7 jours</option>
            </select>
          </label>
        </div>
        <button type="submit">Créer l'invitation</button>
        {lien && (
          <div className="encart-lien">
            <p>Envoie ce lien à ton ami. <strong>Il ne sera plus affiché ensuite.</strong></p>
            <code className="lien">{lien}</code>
            <button type="button" onClick={copier}>{copie ? "Copié ✓" : "Copier le lien"}</button>
          </div>
        )}
      </form>
      {erreur && <p className="message-erreur">{erreur}</p>}
      <div className="carte">
        <h2>Invitations</h2>
        <div className="tableau-defilant">
          <table>
            <thead>
              <tr><th>Créée</th><th>Note</th><th>Pseudo réservé</th><th>Expire</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {donnees?.invitations.map((i) => (
                <tr key={i.id}>
                  <td>{formaterDate(i.creeLe)}</td>
                  <td>{i.note ?? "—"}{i.role === "admin" ? " (admin)" : ""}</td>
                  <td>{i.pseudoReserve ?? "—"}</td>
                  <td>{formaterDate(i.expireLe)}</td>
                  <td>{statutInvitation(i)}</td>
                  <td>{statutInvitation(i) === "En attente" && <button className="petit danger" onClick={() => revoquer(i.id)}>Révoquer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function OngletComptes({ moi, surExpiration }: { moi: string; surExpiration: () => Promise<void> }) {
  const { donnees, erreur, recharger, setErreur } = useDonneesAdmin<{ comptes: Compte[] }>("/admin/comptes", surExpiration);
  const [info, setInfo] = useState<string | null>(null);
  const [lienMdp, setLienMdp] = useState<{ pseudo: string; lien: string } | null>(null);
  const [copie, setCopie] = useState(false);

  async function creerLienMdp(c: Compte) {
    if (!window.confirm(`Créer un lien pour que ${c.pseudo} choisisse un nouveau mot de passe ? (valable 24 h, une seule fois)`)) return;
    try {
      const r = await appelerApi<{ code: string; pseudo: string }>("POST", `/admin/comptes/${c.id}/reinitialisation-mdp`, {});
      setLienMdp({ pseudo: r.pseudo, lien: `${window.location.origin}/reinitialisation#code=${r.code}` });
      setCopie(false);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function copierLienMdp() {
    if (!lienMdp) return;
    await navigator.clipboard.writeText(lienMdp.lien);
    setCopie(true);
  }

  async function agir(c: Compte, action: "desactiver" | "reactiver" | "deconnecter") {
    const textes = { desactiver: "Désactiver", reactiver: "Réactiver", deconnecter: "Déconnecter" };
    if (!window.confirm(`${textes[action]} ${c.pseudo} ?`)) return;
    try {
      await appelerApi("POST", `/admin/comptes/${c.id}/${action}`, {});
      await recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  async function viderCollection(c: Compte | null) {
    const question = c
      ? `Vider TOUTE la collection de ${c.pseudo} ? Ses échanges en attente seront annulés. Impossible de revenir en arrière.`
      : "Vider les collections de TOUS les joueurs ? Les échanges en attente seront annulés. Impossible de revenir en arrière.";
    if (!window.confirm(question)) return;
    try {
      const r = await appelerApi<{ lignesSupprimees: number }>(
        "POST",
        c ? `/admin/comptes/${c.id}/vider-collection` : "/admin/collections/vider",
        {},
      );
      setInfo(`${c ? `Collection de ${c.pseudo} vidée` : "Toutes les collections ont été vidées"} (${r.lignesSupprimees} ligne(s) supprimée(s)).`);
      await recharger();
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  return (
    <section className="carte">
      <div className="entete">
        <h2>Comptes</h2>
        <button className="petit danger" onClick={() => void viderCollection(null)}>
          Vider toutes les collections
        </button>
      </div>
      {erreur && <p className="message-erreur">{erreur}</p>}
      {info && <p className="message-succes">{info}</p>}
      {lienMdp && (
        <div className="encart-lien">
          <p>
            Lien de nouveau mot de passe pour <strong>{lienMdp.pseudo}</strong> (24 h, une seule fois).{" "}
            <strong>Il ne sera plus affiché ensuite.</strong>
          </p>
          <code className="lien">{lienMdp.lien}</code>
          <div className="barre-actions">
            <button type="button" onClick={() => void copierLienMdp()}>{copie ? "Copié ✓" : "Copier le lien"}</button>
            <button type="button" className="secondaire" onClick={() => setLienMdp(null)}>Fermer</button>
          </div>
        </div>
      )}
      <div className="tableau-defilant">
        <table>
          <thead>
            <tr><th>Pseudo</th><th>Rôle</th><th>État</th><th>Inscrit</th><th>Dernière activité</th><th>Sessions</th><th></th></tr>
          </thead>
          <tbody>
            {donnees?.comptes.map((c) => (
              <tr key={c.id}>
                <td>{c.pseudo}</td>
                <td>{c.role}</td>
                <td>{c.actif ? "Actif" : "Désactivé"}</td>
                <td>{formaterDate(c.creeLe)}</td>
                <td>{formaterDate(c.derniereActivite)}</td>
                <td>{c.sessionsActives}</td>
                <td className="actions-ligne">
                  <button className="petit secondaire" onClick={() => void creerLienMdp(c)}>Nouveau mot de passe</button>
                  <button className="petit secondaire" onClick={() => void viderCollection(c)}>Vider la collection</button>
                  {c.pseudo !== moi && (
                    <>
                      {c.actif ? (
                        <button className="petit danger" onClick={() => agir(c, "desactiver")}>Désactiver</button>
                      ) : (
                        <button className="petit" onClick={() => agir(c, "reactiver")}>Réactiver</button>
                      )}
                      {c.sessionsActives > 0 && <button className="petit secondaire" onClick={() => agir(c, "deconnecter")}>Déconnecter</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const LIBELLES_EVENEMENTS: Record<string, string> = {
  inscription: "Inscription",
  inscription_refusee: "Inscription refusée",
  connexion_reussie: "Connexion",
  connexion_echouee: "Connexion échouée",
  connexion_bloquee: "Connexion bloquée (trop d'essais)",
  deconnexion: "Déconnexion",
  elevation: "Ouverture admin",
  elevation_echouee: "Ouverture admin refusée",
  reinitialisation_creee: "Lien de nouveau mot de passe créé",
  mot_de_passe_reinitialise: "Mot de passe réinitialisé",
  reinitialisation_refusee: "Réinitialisation refusée",
  invitation_creee: "Invitation créée",
  invitation_revoquee: "Invitation révoquée",
  compte_desactiver: "Compte désactivé",
  compte_reactiver: "Compte réactivé",
  compte_deconnecter: "Compte déconnecté",
  collection_videe: "Collection vidée",
  collections_videes: "Toutes les collections vidées",
};

function OngletJournal({ surExpiration }: { surExpiration: () => Promise<void> }) {
  const { donnees, erreur, recharger } = useDonneesAdmin<{ evenements: Evenement[] }>("/admin/journal?limite=200", surExpiration);
  return (
    <section className="carte">
      <div className="entete">
        <h2>Journal</h2>
        <button className="secondaire petit" onClick={() => void recharger()}>Actualiser</button>
      </div>
      {erreur && <p className="message-erreur">{erreur}</p>}
      <div className="tableau-defilant">
        <table>
          <thead>
            <tr><th>Date</th><th>Événement</th><th>Pseudo</th><th>IP</th><th>Détails</th></tr>
          </thead>
          <tbody>
            {donnees?.evenements.map((e) => (
              <tr key={e.id} className={e.type.includes("echouee") || e.type.includes("bloquee") || e.type.includes("refusee") ? "ligne-alerte" : ""}>
                <td>{formaterDate(e.horodatage)}</td>
                <td>{LIBELLES_EVENEMENTS[e.type] ?? e.type}</td>
                <td>{e.pseudo ?? "—"}</td>
                <td>{e.ip ?? "—"}</td>
                <td className="details">{e.details ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
