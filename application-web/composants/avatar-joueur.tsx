/** Photo de profil d'un joueur : l'illustration de sa carte choisie, recadrée en rond, ou son initiale. */
import type { ReactNode } from "react";
import { ImageCarte } from "./image-carte";
import { naviguer } from "../outils/navigation";
import { type AvatarLeger, lienProfil } from "../outils/profils";

interface Props {
  pseudo: string;
  avatar: AvatarLeger | null | undefined;
  taille?: "petit" | "normal" | "grand";
}

export function AvatarJoueur({ pseudo, avatar, taille = "normal" }: Props) {
  const classe = `avatar ${taille === "normal" ? "" : `avatar-${taille}`} ${avatar ? "avatar-image" : ""}`;
  return (
    <span className={classe} aria-hidden="true">
      {avatar ? (
        <ImageCarte
          image={avatar.image}
          largeur={300}
          alt=""
          className={avatar.orientation === "paysage" ? "avatar-paysage" : undefined}
          paresseuse
        />
      ) : (
        pseudo.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

/** Lien vers le profil d'un joueur (pseudo cliquable dans le marché, le salon, les échanges). */
export function LienJoueur({ pseudo, children, className }: { pseudo: string; children?: ReactNode; className?: string }) {
  return (
    <a
      href={lienProfil(pseudo)}
      className={className ? `lien-joueur ${className}` : "lien-joueur"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        naviguer(lienProfil(pseudo));
      }}
    >
      {children ?? pseudo}
    </a>
  );
}
