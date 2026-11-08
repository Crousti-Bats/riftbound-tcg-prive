/**
 * Hachage des mots de passe : PBKDF2-SHA256 via WebCrypto.
 * 100 000 itérations = maximum autorisé par Cloudflare Workers.
 * Format stocké : "pbkdf2-sha256$<iterations>$<sel base64url>$<hash base64url>"
 * Le nombre d'itérations est stocké : on pourra l'augmenter plus tard sans casser les anciens comptes.
 */
import { depuisBase64Url, egaliteTempsConstant, versBase64Url } from "./jetons-et-empreintes";

export const ITERATIONS_PBKDF2 = 100_000;
const ALGORITHME = "pbkdf2-sha256";
const encodeur = new TextEncoder();

async function deriver(motDePasse: string, sel: Uint8Array, iterations: number): Promise<Uint8Array> {
  const cle = await crypto.subtle.importKey("raw", encodeur.encode(motDePasse), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: sel as BufferSource, iterations },
    cle,
    256,
  );
  return new Uint8Array(bits);
}

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriver(motDePasse, sel, ITERATIONS_PBKDF2);
  return `${ALGORITHME}$${ITERATIONS_PBKDF2}$${versBase64Url(sel)}$${versBase64Url(hash)}`;
}

export async function verifierMotDePasse(motDePasse: string, stocke: string): Promise<boolean> {
  const [algo, iterTexte, selTexte, hashTexte] = stocke.split("$");
  const iterations = Number(iterTexte);
  if (algo !== ALGORITHME || !selTexte || !hashTexte || !Number.isInteger(iterations) || iterations < 1) return false;
  const calcule = await deriver(motDePasse, depuisBase64Url(selTexte), iterations);
  return egaliteTempsConstant(calcule, depuisBase64Url(hashTexte));
}

/**
 * Hash factice utilisé quand le pseudo n'existe pas : on fait quand même le calcul PBKDF2
 * pour que le temps de réponse ne révèle pas si un pseudo existe.
 */
export const HASH_FACTICE = `${ALGORITHME}$${ITERATIONS_PBKDF2}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
