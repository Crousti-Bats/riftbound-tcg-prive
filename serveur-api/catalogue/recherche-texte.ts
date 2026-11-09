/** Normalisation du texte pour la recherche : sans accents ni majuscules. Partagé par le catalogue et la collection. */
export function sansAccents(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
