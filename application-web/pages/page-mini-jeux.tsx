/** Page « Mini-jeux » : le champion du jour (4 modes) et le Memory, avec ce qu'ils rapportent aujourd'hui. */
import { type CSSProperties, type MouseEvent, useEffect, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { formaterEclats } from "../outils/eclats";
import { MODES, type ResumeMiniJeux, splashDecor, useCompteARebours } from "../outils/minijeux";
import { naviguer } from "../outils/navigation";
import "./mini-jeux.css";

const aller = (chemin: string) => (e: MouseEvent) => {
  e.preventDefault();
  naviguer(chemin);
};

export function PageMiniJeux() {
  const [resume, setResume] = useState<ResumeMiniJeux | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const prochain = useCompteARebours();

  useEffect(() => {
    appelerApi<ResumeMiniJeux>("GET", "/minijeux").then(setResume, (e: Error) => setErreur(e.message));
  }, []);

  const modes = resume ? MODES.map((m) => resume.devinette[m.code]) : [];
  const trouves = modes.filter((m) => m.trouve).length;
  const gagnes = modes.reduce((n, m) => n + m.gain, 0) + (resume?.memory.gainsDuJour ?? 0);
  const memory = resume?.memory;

  return (
    <main className="conteneur pile mj-page">
      <section className="mj-hero">
        <div className="mj-hero-fond" aria-hidden="true" style={{ backgroundImage: `url(${splashDecor("Jinx")})` }} />
        <div className="mj-hero-contenu">
          <span className="surtitre">Un nouveau défi chaque jour à minuit</span>
          <h1>Mini-jeux</h1>
          <p>Devine le champion du jour dans 4 modes et entraîne ta mémoire avec tes propres cartes. Chaque victoire rapporte des éclats 💎.</p>
          <div className="mj-pastilles">
            <span className="mj-pastille">🏆 {resume ? `${trouves} / ${MODES.length}` : "…"} trouvés aujourd'hui</span>
            <span className="mj-pastille mj-pastille-or">💎 +{gagnes} aujourd'hui</span>
            <span className="mj-pastille">⏳ Prochain champion dans {prochain}</span>
          </div>
        </div>
      </section>
      {erreur && <p className="message-erreur">{erreur}</p>}

      <h2 className="titre-section">Devine le champion</h2>
      <div className="mj-tuiles">
        {MODES.map((m) => {
          const etat = resume?.devinette[m.code];
          return (
            <a
              key={m.code}
              href={`/minijeux/champion/${m.code}`}
              className={etat?.trouve ? "mj-tuile trouve" : "mj-tuile"}
              onClick={aller(`/minijeux/champion/${m.code}`)}
              style={{ "--decor": `url(${splashDecor(m.decor)})` } as CSSProperties}
            >
              <span className="mj-tuile-medaillon" aria-hidden="true">
                {m.icone}
              </span>
              <strong className="mj-tuile-titre">{m.libelle}</strong>
              <span className="mj-tuile-texte">{m.texte}</span>
              <span className={etat?.trouve ? "mj-statut mj-statut-ok" : "mj-statut"}>
                {!etat
                  ? " "
                  : etat.trouve
                    ? `✓ Trouvé en ${etat.essais} · +${formaterEclats(etat.gain)}`
                    : etat.essais > 0
                      ? `${etat.essais} essai${etat.essais > 1 ? "s" : ""} · à toi de jouer`
                      : `Jusqu'à ${formaterEclats(etat.gainMax)}`}
              </span>
            </a>
          );
        })}
      </div>

      <h2 className="titre-section">Memory</h2>
      <section className="carte mj-memory-encart">
        <div className="pile-serree">
          <span className="surtitre">À volonté</span>
          <h2>Retrouve les paires de ta collection</h2>
          <p className="aide">8 paires, un minimum de coups : ★★★ 10 💎 en 12 coups ou moins, ★★ 6 💎 en 16, ★ 3 💎 au-delà.</p>
          {memory && (
            <div className="mj-jauge" aria-label={`${memory.gainsDuJour} éclats gagnés sur ${memory.plafond} aujourd'hui`}>
              <span className="mj-jauge-remplie" style={{ width: `${Math.min(100, (memory.gainsDuJour / memory.plafond) * 100)}%` }} />
              <span className="mj-jauge-texte">
                {memory.gainsDuJour} / {formaterEclats(memory.plafond)} aujourd'hui
              </span>
            </div>
          )}
          <div>
            <button onClick={() => naviguer("/minijeux/memory")}>Jouer au Memory</button>
          </div>
        </div>
        <div className="mj-eventail" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="mj-dos mj-dos-mini" style={{ "--n": i } as CSSProperties}>
              <img src="/icones/logo-transparent-512.png" alt="" />
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
