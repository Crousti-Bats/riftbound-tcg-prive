/**
 * Prépare une photo de profil dans le navigateur avant l'envoi : recadrage carré au centre, réduction à 256 x 256,
 * réencodage en WebP (JPEG si le navigateur ne sait pas faire de WebP). Le fichier d'origine (et ses métadonnées,
 * position GPS comprise) n'est jamais envoyé : seulement l'image redessinée.
 */
const COTE = 256;
const QUALITE = 0.85;
/** Le serveur refuse au-delà de 150 Ko ; une image 256 x 256 fait en général 10 à 40 Ko. */
const TAILLE_MAX = 150 * 1024;

export class ErreurPhoto extends Error {}

function versBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((ok) => canvas.toBlob(ok, type, QUALITE));
}

function versBase64(blob: Blob): Promise<string> {
  return new Promise((ok, echec) => {
    const lecteur = new FileReader();
    lecteur.onload = () => ok(String(lecteur.result).replace(/^data:[^,]*,/, ""));
    lecteur.onerror = () => echec(new ErreurPhoto("Impossible de lire l'image."));
    lecteur.readAsDataURL(blob);
  });
}

export async function preparerPhoto(fichier: File): Promise<string> {
  if (!fichier.type.startsWith("image/")) throw new ErreurPhoto("Ce fichier n'est pas une image.");
  if (fichier.size > 20 * 1024 * 1024) throw new ErreurPhoto("Image trop lourde (20 Mo au maximum).");
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    throw new ErreurPhoto("Image illisible. Essaie avec un JPEG ou un PNG.");
  }
  const cote = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = COTE;
  canvas.height = COTE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErreurPhoto("Ton navigateur ne peut pas préparer l'image.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, (image.width - cote) / 2, (image.height - cote) / 2, cote, cote, 0, 0, COTE, COTE);
  image.close();

  let blob = await versBlob(canvas, "image/webp");
  if (!blob || blob.type !== "image/webp") blob = await versBlob(canvas, "image/jpeg");
  if (!blob) throw new ErreurPhoto("Ton navigateur ne peut pas préparer l'image.");
  if (blob.size > TAILLE_MAX) throw new ErreurPhoto("Image trop lourde après réduction.");
  return versBase64(blob);
}
