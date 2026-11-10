/**
 * Envoi de notifications Web Push, sans dépendance (WebCrypto uniquement, disponible sur Workers).
 *
 * - Chiffrement du message : RFC 8291 (« aes128gcm »). Seul le navigateur abonné peut le lire,
 *   le service de push (Google, Apple, Mozilla, Microsoft) ne voit qu'un bloc chiffré.
 * - Identification du serveur : VAPID (RFC 8292), un jeton JWT signé ES256 avec notre clé privée.
 *   La clé publique est dans la configuration (VAPID_CLE_PUBLIQUE), la clé privée est un secret Worker
 *   (VAPID_CLE_PRIVEE), jamais dans le dépôt.
 */
import { depuisBase64Url, versBase64Url } from "../securite/jetons-et-empreintes";

const encodeur = new TextEncoder();

export interface AbonnementPush {
  endpoint: string;
  /** Clé publique ECDH P-256 du navigateur (65 octets, base64url). */
  p256dh: string;
  /** Secret d'authentification du navigateur (16 octets, base64url). */
  auth: string;
}

export interface ClesVapid {
  /** Clé publique non compressée (65 octets, base64url). */
  publique: string;
  /** Scalaire privé « d » (32 octets, base64url). */
  privee: string;
  /** Contact du serveur exigé par VAPID (URL https ou mailto:). */
  sujet: string;
}

/**
 * Services de push des navigateurs. On n'envoie JAMAIS de requête ailleurs : sans cette liste,
 * un joueur pourrait enregistrer une adresse interne ou arbitraire et faire appeler le serveur dessus (SSRF).
 */
const HOTES_PUSH = [/^fcm\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

export function estEndpointAutorise(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.port === "" && url.username === "" && HOTES_PUSH.some((h) => h.test(url.hostname));
}

function concat(...parties: Uint8Array[]): Uint8Array {
  const total = new Uint8Array(parties.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parties) {
    total.set(p, i);
    i += p.length;
  }
  return total;
}

async function hkdf(sel: Uint8Array, ikm: Uint8Array, info: Uint8Array, octets: number): Promise<Uint8Array> {
  const cle = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: sel as BufferSource, info: info as BufferSource },
    cle,
    octets * 8,
  );
  return new Uint8Array(bits);
}

/** Options injectables pour les tests (vecteurs fixes). En production : clé éphémère et sel aléatoires. */
export interface OptionsChiffrement {
  paireEphemere?: CryptoKeyPair;
  sel?: Uint8Array;
}

/** Chiffre un message pour un abonné (RFC 8291, un seul enregistrement). Renvoie le corps HTTP à envoyer. */
export async function chiffrerMessage(abonnement: AbonnementPush, message: string, options: OptionsChiffrement = {}): Promise<Uint8Array> {
  const clePubliqueNavigateur = depuisBase64Url(abonnement.p256dh);
  const secretAuth = depuisBase64Url(abonnement.auth);
  if (clePubliqueNavigateur.length !== 65 || secretAuth.length !== 16) throw new Error("abonnement push invalide");

  const paire =
    options.paireEphemere ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const clePubliqueServeur = new Uint8Array((await crypto.subtle.exportKey("raw", paire.publicKey)) as ArrayBuffer);
  const cleNavigateur = await crypto.subtle.importKey("raw", clePubliqueNavigateur as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secretEcdh = new Uint8Array(
    // Les types Workers nomment ce champ « $public », mais l'API WebCrypto (et le runtime) attend bien « public ».
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: cleNavigateur } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0],
      paire.privateKey,
      256,
    ),
  );

  const infoCle = concat(encodeur.encode("WebPush: info\0"), clePubliqueNavigateur, clePubliqueServeur);
  const ikm = await hkdf(secretAuth, secretEcdh, infoCle, 32);
  const sel = options.sel ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sel, ikm, encodeur.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sel, ikm, encodeur.encode("Content-Encoding: nonce\0"), 12);

  // Le message, suivi du délimiteur 0x02 (« dernier enregistrement »), sans remplissage.
  const clair = concat(encodeur.encode(message), new Uint8Array([2]));
  const cleAes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, cleAes, clair as BufferSource));

  // En-tête : sel (16) | taille d'enregistrement (4, 4096) | longueur de l'identifiant (1) | clé publique du serveur (65).
  const entete = new Uint8Array(16 + 4 + 1);
  entete.set(sel, 0);
  new DataView(entete.buffer).setUint32(16, 4096);
  entete[20] = clePubliqueServeur.length;
  return concat(entete, clePubliqueServeur, chiffre);
}

/** Jeton VAPID (JWT ES256) pour l'origine du service de push. Valable 12 heures. */
export async function jetonVapid(endpoint: string, cles: ClesVapid, maintenant = Date.now()): Promise<string> {
  const publique = depuisBase64Url(cles.publique);
  const clePrivee = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: versBase64Url(publique.slice(1, 33)),
      y: versBase64Url(publique.slice(33, 65)),
      d: cles.privee,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const json = (objet: unknown) => versBase64Url(encodeur.encode(JSON.stringify(objet)));
  const aSigner = `${json({ typ: "JWT", alg: "ES256" })}.${json({
    aud: new URL(endpoint).origin,
    exp: Math.floor(maintenant / 1000) + 12 * 60 * 60,
    sub: cles.sujet,
  })}`;
  // WebCrypto renvoie déjà la signature au format JOSE (r || s, 64 octets).
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clePrivee, encodeur.encode(aSigner));
  return `${aSigner}.${versBase64Url(new Uint8Array(signature))}`;
}

export type ResultatEnvoi = "envoye" | "abonnement_perime" | "echec";

/** Envoie un message à un abonné. « abonnement_perime » : le navigateur s'est désabonné, à supprimer. */
export async function envoyerNotification(
  abonnement: AbonnementPush,
  message: unknown,
  cles: ClesVapid,
  telecharger: typeof fetch = fetch,
): Promise<ResultatEnvoi> {
  if (!estEndpointAutorise(abonnement.endpoint)) return "abonnement_perime";
  try {
    const reponse = await telecharger(abonnement.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${await jetonVapid(abonnement.endpoint, cles)}, k=${cles.publique}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(24 * 60 * 60),
        Urgency: "normal",
      },
      body: (await chiffrerMessage(abonnement, JSON.stringify(message))) as BodyInit,
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (reponse.status === 404 || reponse.status === 410) return "abonnement_perime";
    if (!reponse.ok) {
      console.warn("push refusé", reponse.status, new URL(abonnement.endpoint).hostname);
      return "echec";
    }
    return "envoye";
  } catch (err) {
    console.warn("push impossible", err);
    return "echec";
  }
}
