/** Outils cryptographiques de base (WebCrypto, disponible sur Cloudflare Workers et Node). */

const encodeur = new TextEncoder();

/** Encode des octets en base64url (sans padding), adapté aux cookies et aux URL. */
export function versBase64Url(octets: Uint8Array): string {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function depuisBase64Url(texte: string): Uint8Array {
  const b64 = texte.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texte.length + 3) % 4);
  const binaire = atob(b64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
  return octets;
}

/** Jeton aléatoire cryptographiquement sûr (32 octets = 256 bits par défaut). */
export function jetonAleatoire(nbOctets = 32): string {
  return versBase64Url(crypto.getRandomValues(new Uint8Array(nbOctets)));
}

/** Empreinte SHA-256 (hexadécimal) : ce qu'on stocke en base à la place des jetons et codes. */
export async function empreinteSha256(texte: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", encodeur.encode(texte)));
  return Array.from(hash, (o) => o.toString(16).padStart(2, "0")).join("");
}

/** Comparaison en temps constant : évite de deviner un secret en mesurant le temps de réponse. */
export function egaliteTempsConstant(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}
