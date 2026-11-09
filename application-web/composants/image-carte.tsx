/** Image de carte avec repli : si le redimensionnement du CDN Riot échoue (ça arrive ponctuellement sur une
 *  miniature, l'image restait vide jusqu'à l'ouverture de la fiche), on essaie une autre taille puis l'original. */
import { useState } from "react";
import { urlImage } from "../outils/libelles-cartes";

interface Props {
  image: string;
  largeur: 300 | 744 | 1039;
  alt: string;
  className?: string;
  paresseuse?: boolean;
}

export function ImageCarte({ image, largeur, alt, className, paresseuse }: Props) {
  const sources = [urlImage(image, largeur), ...(largeur === 300 ? [urlImage(image, 744)] : []), image];
  const [essai, setEssai] = useState(0);
  const [imagePrecedente, setImagePrecedente] = useState(image);
  // Nouvelle carte affichée dans le même composant : on repart de la première source.
  if (imagePrecedente !== image) {
    setImagePrecedente(image);
    setEssai(0);
  }

  return (
    <img
      className={className}
      src={sources[Math.min(essai, sources.length - 1)]}
      alt={alt}
      loading={paresseuse ? "lazy" : undefined}
      onError={() => setEssai((n) => (n < sources.length - 1 ? n + 1 : n))}
    />
  );
}
