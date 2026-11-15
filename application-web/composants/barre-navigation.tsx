/**
 * Navigation commune à toutes les pages du joueur connecté :
 * barre du haut (logo, liens, déconnexion) et, sur téléphone, barre d'onglets en bas de l'écran.
 */
import { useEffect, useState, type ReactNode } from "react";
import { appelerApi, type CompteCourant } from "../outils/appels-api";
import { naviguer } from "../outils/navigation";
import { type AvatarLeger, lienProfil, surProfilModifie } from "../outils/profils";
import { AvatarJoueur } from "./avatar-joueur";

interface Lien {
  chemin: string;
  libelle: string;
  icone: ReactNode;
  actif: (chemin: string) => boolean;
}

const trait = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONES = {
  accueil: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M6 8h12M12 12l2 2-2 2-2-2z" />
    </svg>
  ),
  collection: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <rect x="3" y="6" width="10" height="14" rx="1.5" />
      <path d="M8 4.5 9 4h9.5A1.5 1.5 0 0 1 20 5.5V17l-.5 1" />
    </svg>
  ),
  decks: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <rect x="7" y="3" width="11" height="15" rx="1.5" transform="rotate(8 12.5 10.5)" />
      <rect x="4" y="5" width="11" height="15" rx="1.5" />
      <path d="M8 10.5h3M9.5 9v3" />
    </svg>
  ),
  echanges: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <path d="M4 8h14l-3-3M20 16H6l3 3" />
    </svg>
  ),
  catalogue: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <rect x="3" y="3" width="7" height="7" rx="1.2" />
      <rect x="14" y="3" width="7" height="7" rx="1.2" />
      <rect x="3" y="14" width="7" height="7" rx="1.2" />
      <rect x="14" y="14" width="7" height="7" rx="1.2" />
    </svg>
  ),
  marche: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" />
    </svg>
  ),
  sortie: (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...trait}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
    </svg>
  ),
};

const LIENS: Lien[] = [
  { chemin: "/", libelle: "Boosters", icone: ICONES.accueil, actif: (c) => c === "/" },
  { chemin: "/collection", libelle: "Collection", icone: ICONES.collection, actif: (c) => c === "/collection" },
  { chemin: "/jouer", libelle: "Jouer", icone: ICONES.decks, actif: (c) => c === "/jouer" || c === "/apprendre" || c.startsWith("/minijeux") || c === "/tutoriel" || c.startsWith("/decks") || c.startsWith("/table") },
  { chemin: "/echanges", libelle: "Échanges", icone: ICONES.echanges, actif: (c) => c.startsWith("/echanges") },
  { chemin: "/marche", libelle: "Marché", icone: ICONES.marche, actif: (c) => c.startsWith("/marche") },
  { chemin: "/catalogue", libelle: "Catalogue", icone: ICONES.catalogue, actif: (c) => c === "/catalogue" },
];
const LIEN_ADMIN: Lien = { chemin: "/admin", libelle: "Admin", icone: ICONES.admin, actif: (c) => c.startsWith("/admin") };

export function BarreNavigation({
  compte,
  chemin,
  surDeconnexion,
}: {
  compte: CompteCourant;
  chemin: string;
  surDeconnexion: () => Promise<void>;
}) {
  const [recuesEnAttente, setRecuesEnAttente] = useState(0);
  const [avatar, setAvatar] = useState<AvatarLeger | null>(null);
  const liens = compte.role === "admin" ? [...LIENS, LIEN_ADMIN] : LIENS;

  // Pastille des propositions reçues : relue à chaque changement de page (bonus, aucune erreur affichée).
  useEffect(() => {
    appelerApi<{ recuesEnAttente: number }>("GET", "/echanges/resume").then(
      (r) => setRecuesEnAttente(r.recuesEnAttente),
      () => undefined,
    );
  }, [chemin]);

  // Mon avatar : lu au chargement, puis relu quand je modifie mon profil.
  useEffect(() => {
    const lire = () =>
      appelerApi<{ avatar: AvatarLeger | null }>("GET", "/profils/avatar").then(
        (r) => setAvatar(r.avatar),
        () => undefined,
      );
    void lire();
    return surProfilModifie(() => void lire());
  }, [compte.pseudo]);

  const pastilles: Record<string, { nombre: number; libelle: string }> = {
    "/echanges": { nombre: recuesEnAttente, libelle: "proposition(s) reçue(s)" },
  };

  async function seDeconnecter() {
    await appelerApi("POST", "/auth/deconnexion", {}).catch(() => undefined);
    await surDeconnexion();
    naviguer("/connexion");
  }

  const contenuLien = (l: Lien) => (
    <>
      <span className="nav-icone">
        {l.icone}
        {(pastilles[l.chemin]?.nombre ?? 0) > 0 && (
          <span className="pastille pastille-nav" aria-label={`${pastilles[l.chemin]?.nombre} ${pastilles[l.chemin]?.libelle}`}>
            {Math.min(99, pastilles[l.chemin]?.nombre ?? 0)}
          </span>
        )}
      </span>
      <span className="nav-libelle">{l.libelle}</span>
    </>
  );

  const lien = (l: Lien, classe: string) => (
    <a
      key={l.chemin}
      href={l.chemin}
      className={l.actif(chemin) ? `${classe} actif` : classe}
      aria-current={l.actif(chemin) ? "page" : undefined}
      onClick={(e) => {
        e.preventDefault();
        naviguer(l.chemin);
      }}
    >
      {contenuLien(l)}
    </a>
  );

  return (
    <>
      <header className="barre-haut">
        <div className="barre-haut-interieur">
          <a
            href="/"
            className="marque"
            onClick={(e) => {
              e.preventDefault();
              naviguer("/");
            }}
          >
            <img src="/icones/logo-transparent-512.png" alt="" width="34" height="34" />
            <span>
              Riftbound <em>TCG</em>
            </span>
          </a>
          <nav className="nav-haut" aria-label="Navigation principale">
            {liens.map((l) => lien(l, "nav-lien"))}
          </nav>
          <div className="profil">
            <a
              href={lienProfil(compte.pseudo)}
              className={chemin === lienProfil(compte.pseudo) ? "lien-profil actif" : "lien-profil"}
              title="Mon profil"
              aria-label="Mon profil"
              onClick={(e) => {
                e.preventDefault();
                naviguer(lienProfil(compte.pseudo));
              }}
            >
              <AvatarJoueur pseudo={compte.pseudo} avatar={avatar} />
              <span className="profil-pseudo">{compte.pseudo}</span>
            </a>
            <button className="bouton-icone" onClick={() => void seDeconnecter()} title="Se déconnecter" aria-label="Se déconnecter">
              {ICONES.sortie}
            </button>
          </div>
        </div>
      </header>
      <nav className="nav-bas" aria-label="Navigation">
        {liens.map((l) => lien(l, "nav-bas-lien"))}
      </nav>
    </>
  );
}
