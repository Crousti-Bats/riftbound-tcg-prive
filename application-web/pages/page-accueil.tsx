import type { ReactNode } from "react";
import { CarteInstallation } from "../composants/carte-installation";
import { PanneauBoosters } from "../composants/panneau-boosters";
import type { CompteCourant } from "../outils/appels-api";
import { naviguer } from "../outils/navigation";

const RACCOURCIS: Array<{ chemin: string; titre: string; texte: string; icone: ReactNode }> = [
  {
    chemin: "/collection",
    titre: "Ma collection",
    texte: "Tes cartes, ta progression par set, tes doublons.",
    icone: <span aria-hidden="true">◆</span>,
  },
  {
    chemin: "/echanges",
    titre: "Échanges",
    texte: "Propose et accepte des échanges avec tes amis.",
    icone: <span aria-hidden="true">⇄</span>,
  },
  {
    chemin: "/catalogue",
    titre: "Catalogue",
    texte: "Toutes les cartes de Riftbound, set par set.",
    icone: <span aria-hidden="true">▦</span>,
  },
];

export function PageAccueil({ compte }: { compte: CompteCourant }) {
  return (
    <main className="conteneur pile">
      <PanneauBoosters pseudo={compte.pseudo} />

      <section className="raccourcis" aria-label="Accès rapides">
        {RACCOURCIS.map((r) => (
          <a
            key={r.chemin}
            href={r.chemin}
            className="raccourci"
            onClick={(e) => {
              e.preventDefault();
              naviguer(r.chemin);
            }}
          >
            <span className="raccourci-icone">{r.icone}</span>
            <span className="raccourci-texte">
              <strong>{r.titre}</strong>
              <span>{r.texte}</span>
            </span>
            <span className="raccourci-fleche" aria-hidden="true">
              →
            </span>
          </a>
        ))}
      </section>

      <CarteInstallation />
    </main>
  );
}
