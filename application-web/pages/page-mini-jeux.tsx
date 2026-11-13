/** Page « Mini-jeux » : le champion du jour (3 modes) et le Memory, avec ce qu'ils rapportent aujourd'hui. */
import { type MouseEvent, useEffect, useState } from "react";
import { appelerApi } from "../outils/appels-api";
import { formaterEclats } from "../outils/eclats";
import { MODES, type ResumeMiniJeux } from "../outils/minijeux";
import { naviguer } from "../outils/navigation";
import "./mini-jeux.css";

export function PageMiniJeux() {
  const [resume, setResume] = useState<ResumeMiniJeux | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelerApi<ResumeMiniJeux>("GET", "/minijeux").then(setResume, (e: Error) => setErreur(e.message));
  }, []);

  const aller = (chemin: string) => (e: MouseEvent) => {
    e.preventDefault();
    naviguer(chemin);
  };

  return (
    <main className="conteneur pile">
      <header className="entete">
        <div>
          <h1>Mini-jeux</h1>
          <p className="aide">Un nouveau champion à deviner chaque jour à minuit. Chaque victoire rapporte des éclats 💎.</p>
        </div>
      </header>
      {erreur && <p className="message-erreur">{erreur}</p>}

      <section className="carte pile-serree">
        <span className="surtitre">Chaque jour</span>
        <h2>Devine le champion</h2>
        <div className="mj-modes">
          {MODES.map((m) => {
            const etat = resume?.devinette[m.code];
            return (
              <a key={m.code} href={`/minijeux/champion/${m.code}`} className={etat?.trouve ? "mj-mode trouve" : "mj-mode"} onClick={aller(`/minijeux/champion/${m.code}`)}>
                <span className="mj-mode-icone" aria-hidden="true">
                  {etat?.trouve ? "✓" : m.icone}
                </span>
                <span className="mj-mode-texte">
                  <strong>{m.libelle}</strong>
                  <span>{m.texte}</span>
                  <span className="mj-mode-gain">
                    {!etat
                      ? " "
                      : etat.trouve
                        ? `Trouvé en ${etat.essais} essai${etat.essais > 1 ? "s" : ""} · +${formaterEclats(etat.gain)}`
                        : etat.essais > 0
                          ? `${etat.essais} essai${etat.essais > 1 ? "s" : ""} · pas encore trouvé`
                          : `Jusqu'à ${formaterEclats(etat.gainMax)}`}
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <section className="carte pile-serree">
        <span className="surtitre">À volonté</span>
        <h2>Memory</h2>
        <p className="aide">
          Retrouve les 8 paires de cartes de ta collection en un minimum de coups : 10 💎 en 12 coups ou moins, 6 💎 en 16, 3 💎 au-delà.
          {resume && ` Aujourd'hui : ${resume.memory.gainsDuJour} / ${formaterEclats(resume.memory.plafond)}.`}
        </p>
        <div>
          <button onClick={() => naviguer("/minijeux/memory")}>Jouer au Memory</button>
        </div>
      </section>
    </main>
  );
}
