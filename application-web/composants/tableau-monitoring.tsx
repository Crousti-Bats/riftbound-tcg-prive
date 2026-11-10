/**
 * Tableau de bord admin en quasi temps réel : interroge /api/admin/monitoring toutes les 8 secondes
 * (en pause quand l'onglet du navigateur est caché). Ce rafraîchissement ne prolonge pas l'accès admin.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { appelerApi, ErreurApi } from "../outils/appels-api";
import { LIBELLES_RARETE, LIBELLES_VARIANTE } from "../outils/libelles-cartes";
import { formaterDate } from "../outils/navigation";

const INTERVALLE_MS = 8_000;

type Quotas =
  | { statut: "non_configure" }
  | { statut: "erreur"; message: string; mesureLe: number }
  | {
      statut: "ok";
      depuis: string;
      mesureLe: number;
      requetesWorker: number;
      erreursWorker: number;
      lignesLuesD1: number;
      lignesEcritesD1: number;
      limites: { requetesWorker: number; lignesLuesD1: number; lignesEcritesD1: number };
    };

interface Monitoring {
  genereLe: number;
  joueurs: {
    total: number;
    actifs: number;
    enLigne: number;
    seuilEnLigneMs: number;
    recents: Array<{ pseudo: string; role: string; actif: boolean; derniereActivite: number }>;
    invitationsEnAttente: number;
  };
  activite: {
    boosters: { derniereHeure: number; dernieres24h: number; parSet24h: Array<{ set: string; nom: string; n: number }> };
    echanges24h: { proposes: number; acceptes: number; refuses: number; echoues: number; enAttente: number };
    tiragesRemarquables: Array<{
      code: string;
      nom: string;
      rarete: string | null;
      variante: string | null;
      foil: boolean;
      pseudo: string;
      horodatage: number;
    }>;
  };
  securite: {
    evenements: Record<string, { derniereHeure: number; dernieres24h: number }>;
    blocagesActifs: Array<{ cle: string; tentatives: number; finBlocage: number }>;
    erreurs24h: number;
    dernieresErreurs: Array<{ horodatage: number; methode: string; chemin: string; message: string }>;
  };
  sante: {
    api: string;
    base: string;
    latenceBaseMs: number;
    catalogue: { cartes: number; chargeLe: number; ageMs: number; miseAJourSource: string | null } | null;
    version: { id: string; tag: string | null; deployeeLe: string | null } | null;
  };
  quotas: Quotas;
}

const LIBELLES_SECURITE: Record<string, string> = {
  connexion_echouee: "Connexions échouées",
  connexion_bloquee: "Connexions bloquées",
  inscription_refusee: "Inscriptions refusées",
  reinitialisation_refusee: "Réinitialisations refusées",
  elevation_echouee: "Ouvertures admin refusées",
};

function duree(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function libelleBlocage(cle: string): string {
  const [action, genre, ...reste] = cle.split(":");
  const valeur = reste.join(":");
  const quoi = action === "connexion" ? "Connexion" : action === "inscription" ? "Inscription" : "Admin";
  const par = genre === "ip" ? "IP" : genre === "pseudo" ? "pseudo" : "compte";
  return `${quoi} · ${par} ${valeur}`;
}

function Jauge({ libelle, valeur, limite }: { libelle: string; valeur: number; limite: number }) {
  const pourcent = Math.min(100, (valeur / limite) * 100);
  const niveau = pourcent >= 90 ? "danger" : pourcent >= 70 ? "attention" : "ok";
  return (
    <div className="jauge">
      <div className="jauge-libelle">
        <span>{libelle}</span>
        <span>
          {valeur.toLocaleString("fr-FR")} / {limite.toLocaleString("fr-FR")} ({pourcent.toFixed(1)} %)
        </span>
      </div>
      <div className={`jauge-barre jauge-${niveau}`} role="meter" aria-valuenow={valeur} aria-valuemin={0} aria-valuemax={limite} aria-label={libelle}>
        <span style={{ width: `${pourcent}%` }} />
      </div>
    </div>
  );
}

function Chiffre({ valeur, libelle, alerte }: { valeur: number | string; libelle: string; alerte?: boolean }) {
  return (
    <div className={`chiffre ${alerte ? "chiffre-alerte" : ""}`}>
      <strong>{valeur}</strong>
      <span>{libelle}</span>
    </div>
  );
}

export function TableauMonitoring({ surExpiration }: { surExpiration: () => Promise<void> }) {
  const [donnees, setDonnees] = useState<Monitoring | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pause, setPause] = useState(false);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const enCours = useRef(false);

  const charger = useCallback(async () => {
    if (enCours.current) return;
    enCours.current = true;
    try {
      setDonnees(await appelerApi<Monitoring>("GET", "/admin/monitoring"));
      setErreur(null);
    } catch (e) {
      if (e instanceof ErreurApi && e.code === "elevation_requise") await surExpiration();
      else setErreur((e as Error).message);
    } finally {
      enCours.current = false;
    }
  }, [surExpiration]);

  useEffect(() => {
    if (pause) return;
    const premier = window.setTimeout(() => void charger(), 0);
    const minuteur = window.setInterval(() => {
      if (!document.hidden) void charger();
    }, INTERVALLE_MS);
    const surVisibilite = () => {
      if (!document.hidden) void charger();
    };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.clearTimeout(premier);
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, [charger, pause]);

  // Horloge locale pour « actualisé il y a … ».
  useEffect(() => {
    const t = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!donnees) {
    return <section className="carte">{erreur ? <p className="message-erreur">{erreur}</p> : <p className="aide">Chargement du tableau de bord…</p>}</section>;
  }

  const { joueurs, activite, securite, sante, quotas } = donnees;
  const ageDonnees = maintenant - donnees.genereLe;

  return (
    <section className="pile">
      <div className="entete barre-monitoring">
        <p className="aide">
          {pause ? "En pause" : `Actualisation toutes les ${INTERVALLE_MS / 1000} s`} · données d'il y a {duree(ageDonnees)}
          {ageDonnees > 3 * INTERVALLE_MS && !pause ? " ⚠️" : ""}
        </p>
        <div className="barre-actions">
          <button className="secondaire petit" onClick={() => setPause((p) => !p)}>{pause ? "Reprendre" : "Pause"}</button>
          <button className="secondaire petit" onClick={() => void charger()}>Actualiser</button>
        </div>
      </div>
      {erreur && <p className="message-erreur">{erreur} (dernières données affichées)</p>}

      <div className="grille-monitoring">
        <article className="carte">
          <h2>Joueurs</h2>
          <div className="chiffres">
            <Chiffre valeur={joueurs.enLigne} libelle={`en ligne (< ${duree(joueurs.seuilEnLigneMs)})`} />
            <Chiffre valeur={joueurs.total} libelle="comptes" />
            <Chiffre valeur={joueurs.total - joueurs.actifs} libelle="désactivés" />
            <Chiffre valeur={joueurs.invitationsEnAttente} libelle="invitations en attente" />
          </div>
        </article>

        <article className="carte">
          <h2>Activité</h2>
          <div className="chiffres">
            <Chiffre valeur={activite.boosters.derniereHeure} libelle="boosters (1 h)" />
            <Chiffre valeur={activite.boosters.dernieres24h} libelle="boosters (24 h)" />
            <Chiffre valeur={activite.echanges24h.proposes} libelle="échanges proposés (24 h)" />
            <Chiffre valeur={activite.echanges24h.acceptes} libelle="acceptés (24 h)" />
            <Chiffre valeur={activite.echanges24h.refuses} libelle="refusés (24 h)" />
            <Chiffre valeur={activite.echanges24h.enAttente} libelle="en attente" />
          </div>
          {activite.boosters.parSet24h.length > 0 && (
            <p className="aide">Par set (24 h) : {activite.boosters.parSet24h.map((s) => `${s.nom} ${s.n}`).join(" · ")}</p>
          )}
        </article>

        <article className="carte">
          <h2>Sécurité</h2>
          <div className="chiffres">
            {Object.entries(LIBELLES_SECURITE).map(([type, libelle]) => {
              const e = securite.evenements[type] ?? { derniereHeure: 0, dernieres24h: 0 };
              return (
                <Chiffre key={type} valeur={`${e.derniereHeure} / ${e.dernieres24h}`} libelle={`${libelle} (1 h / 24 h)`} alerte={e.derniereHeure > 0} />
              );
            })}
            <Chiffre valeur={securite.blocagesActifs.length} libelle="blocages actifs" alerte={securite.blocagesActifs.length > 0} />
            <Chiffre valeur={securite.erreurs24h} libelle="erreurs serveur (24 h)" alerte={securite.erreurs24h > 0} />
          </div>
        </article>

        <article className="carte">
          <h2>Santé</h2>
          <ul className="liste-sante">
            <li>
              API : <strong className="ok">{sante.api}</strong> · Base :{" "}
              <strong className={sante.base === "ok" ? "ok" : "ko"}>{sante.base}</strong> ({sante.latenceBaseMs} ms)
            </li>
            <li>
              Catalogue :{" "}
              {sante.catalogue ? (
                <>
                  {sante.catalogue.cartes} cartes, chargé il y a {duree(sante.catalogue.ageMs)}
                  {sante.catalogue.miseAJourSource ? ` (source du ${formaterDate(Date.parse(sante.catalogue.miseAJourSource))})` : ""}
                </>
              ) : (
                <strong className="ko">indisponible</strong>
              )}
            </li>
            <li>
              Version :{" "}
              {sante.version
                ? `${sante.version.id.slice(0, 8)}${sante.version.deployeeLe ? `, déployée le ${formaterDate(Date.parse(sante.version.deployeeLe))}` : ""}`
                : "inconnue (local)"}
            </li>
          </ul>
        </article>
      </div>

      <article className="carte">
        <h2>Quotas gratuits Cloudflare (aujourd'hui, depuis 0 h UTC)</h2>
        {quotas.statut === "non_configure" && (
          <p className="aide">
            Non configuré : il faut un jeton Cloudflare en lecture seule (« Account Analytics: Read ») enregistré en secret
            <code> JETON_ANALYTICS_CLOUDFLARE</code>.
          </p>
        )}
        {quotas.statut === "erreur" && <p className="message-erreur">{quotas.message}</p>}
        {quotas.statut === "ok" && (
          <>
            <Jauge libelle="Requêtes Worker" valeur={quotas.requetesWorker} limite={quotas.limites.requetesWorker} />
            <Jauge libelle="Lignes lues D1" valeur={quotas.lignesLuesD1} limite={quotas.limites.lignesLuesD1} />
            <Jauge libelle="Lignes écrites D1" valeur={quotas.lignesEcritesD1} limite={quotas.limites.lignesEcritesD1} />
            <p className="aide">
              {quotas.erreursWorker} erreur(s) Worker aujourd'hui · mesuré il y a {duree(maintenant - quotas.mesureLe)} (mis à jour chaque minute)
            </p>
          </>
        )}
      </article>

      <div className="grille-monitoring">
        <article className="carte">
          <h2>Joueurs récents (24 h)</h2>
          {joueurs.recents.length === 0 ? (
            <p className="aide">Personne.</p>
          ) : (
            <ul className="liste-simple">
              {joueurs.recents.map((j) => (
                <li key={j.pseudo}>
                  <span className={maintenant - j.derniereActivite < joueurs.seuilEnLigneMs ? "pastille-en-ligne" : "pastille-hors-ligne"} aria-hidden="true" />
                  {j.pseudo}
                  {j.role === "admin" ? " (admin)" : ""}
                  {!j.actif ? " — désactivé" : ""}
                  <span className="aide"> · il y a {duree(maintenant - j.derniereActivite)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="carte">
          <h2>Dernières cartes rares tirées</h2>
          {activite.tiragesRemarquables.length === 0 ? (
            <p className="aide">Aucune pour l'instant.</p>
          ) : (
            <ul className="liste-simple">
              {activite.tiragesRemarquables.map((t, i) => (
                <li key={`${t.code}-${t.horodatage}-${i}`}>
                  <strong>{t.nom}</strong>
                  {t.foil ? " ✨" : ""}
                  <span className="aide">
                    {" "}
                    · {t.variante && t.variante !== "base" ? LIBELLES_VARIANTE[t.variante] ?? t.variante : t.rarete ? LIBELLES_RARETE[t.rarete] ?? t.rarete : ""} ·{" "}
                    {t.pseudo} · il y a {duree(maintenant - t.horodatage)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {securite.blocagesActifs.length > 0 && (
        <article className="carte">
          <h2>Blocages actifs (limitation des tentatives)</h2>
          <ul className="liste-simple">
            {securite.blocagesActifs.map((b) => (
              <li key={b.cle} className="texte-alerte">
                {libelleBlocage(b.cle)} — {b.tentatives} essais, débloqué dans {duree(b.finBlocage - maintenant)}
              </li>
            ))}
          </ul>
        </article>
      )}

      <article className="carte">
        <h2>Dernières erreurs serveur</h2>
        {securite.dernieresErreurs.length === 0 ? (
          <p className="aide">Aucune erreur enregistrée (conservées 7 jours).</p>
        ) : (
          <div className="tableau-defilant">
            <table>
              <thead>
                <tr><th>Date</th><th>Requête</th><th>Message</th></tr>
              </thead>
              <tbody>
                {securite.dernieresErreurs.map((e, i) => (
                  <tr key={`${e.horodatage}-${i}`} className="ligne-alerte">
                    <td>{formaterDate(e.horodatage)}</td>
                    <td>{e.methode} {e.chemin}</td>
                    <td className="details">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
