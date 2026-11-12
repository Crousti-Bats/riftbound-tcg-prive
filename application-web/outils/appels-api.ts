/** Appels à l'API du serveur, avec messages d'erreur en français. */

export type Role = "joueur" | "admin";

export interface CompteCourant {
  pseudo: string;
  role: Role;
  adminActif: boolean;
}

const MESSAGES: Record<string, string> = {
  identifiants_invalides: "Pseudo ou mot de passe incorrect.",
  trop_de_tentatives: "Trop de tentatives. Réessaie dans 15 minutes.",
  invitation_invalide: "Ce code d'invitation est invalide, expiré, déjà utilisé ou réservé à un autre pseudo.",
  pseudo_indisponible: "Ce pseudo est déjà pris.",
  lien_invalide: "Ce lien est invalide, expiré ou déjà utilisé. Demande un nouveau lien à l'administrateur.",
  donnees_invalides: "Certains champs sont invalides.",
  mot_de_passe_incorrect: "Mot de passe incorrect.",
  elevation_requise: "Accès admin expiré : re-saisis ton mot de passe.",
  non_connecte: "Tu n'es pas connecté.",
  interdit: "Accès refusé.",
  action_sur_soi_interdite: "Tu ne peux pas faire cette action sur ton propre compte.",
  introuvable_ou_deja_utilisee: "Invitation introuvable ou déjà utilisée.",
  catalogue_indisponible: "La liste des cartes est momentanément indisponible. Réessaie dans une minute.",
  boosters_indisponibles: "Les boosters sont momentanément indisponibles. Réessaie dans une minute.",
  aucun_booster: "Tu n'as plus de booster. Reviens dans quelques minutes.",
  conflit_ouverture: "Ouverture déjà en cours. Réessaie dans un instant.",
  set_non_ouvrable: "Ce set ne peut pas être ouvert en booster.",
  joueur_introuvable: "Ce joueur n'existe pas ou son compte est désactivé.",
  echange_avec_soi: "Tu ne peux pas échanger avec toi-même.",
  trop_de_propositions: "Tu as déjà 20 propositions en attente. Attends des réponses ou annule-en.",
  cartes_non_possedees: "Une des cartes n'est pas (ou plus) disponible en quantité suffisante.",
  echange_introuvable: "Échange introuvable.",
  echange_deja_traite: "Cet échange a déjà été traité.",
  echange_expire: "Cette proposition a expiré (48 heures).",
  echange_introuvable_ou_deja_traite: "Échange introuvable ou déjà traité.",
  cartes_plus_disponibles: "Échange impossible : une des cartes n'est plus disponible chez l'un de vous deux. Rien n'a été transféré.",
  collection_indisponible: "La collection est momentanément indisponible. Réessaie dans une minute.",
  notifications_non_configurees: "Les notifications ne sont pas encore configurées sur le serveur.",
  aucun_abonnement: "Aucun appareil abonné : active d'abord les notifications.",
  aucune_annonce: "Aucune annonce en cours.",
  carte_introuvable: "Cette carte n'existe pas dans le catalogue.",
  wishlist_pleine: "Ta wishlist est pleine (100 cartes). Retires-en une avant d'en ajouter.",
  trop_de_decks: "Tu as déjà 20 decks. Supprimes-en un avant d'en créer un autre.",
  deck_introuvable: "Ce deck n'existe pas (ou plus).",
  decks_indisponibles: "Les decks sont momentanément indisponibles. Réessaie dans une minute.",
  deck_incomplet: "Ce deck n'est pas prêt à jouer : complète-le d'abord.",
  deck_adverse_incomplet: "Le deck de ton adversaire n'est plus prêt à jouer. Demande-lui de le compléter.",
  trop_de_parties: "Tu as déjà 5 parties ouvertes. Termine ou annule-en une.",
  partie_introuvable: "Cette partie n'existe pas (vérifie le code) ou elle est terminée.",
  partie_avec_soi: "Tu ne peux pas jouer contre toi-même.",
  partie_deja_commencee: "Cette partie a déjà commencé.",
  partie_non_commencee: "La partie n'a pas encore commencé.",
  table_indisponible: "La table de jeu est momentanément indisponible. Réessaie dans un instant.",
  trop_de_modifications: "Trop de modifications d'affilée. Réessaie dans une heure.",
  trop_de_requetes: "Trop d'actions d'affilée. Réessaie dans une heure.",
  non_recyclable: "Cette carte ne peut pas être recyclée (runes et tokens).",
  pas_assez_de_doublons: "Tu n'as pas assez d'exemplaires en trop : on garde toujours 1 exemplaire, et ceux de tes decks.",
  aucun_doublon: "Aucun doublon à recycler.",
  collection_modifiee: "Ta collection a changé entre-temps (échange, booster…). Rien n'a été recyclé : réessaie.",
  eclats_insuffisants: "Pas assez d'éclats.",
  non_fabricable: "Cette carte ne peut pas être fabriquée (runes et tokens).",
  hors_ligne: "Pas de connexion Internet. Réessaie quand tu seras de nouveau en ligne.",
  serveur_injoignable: "Le serveur ne répond pas. Réessaie dans un instant.",
};

export class ErreurApi extends Error {
  constructor(
    readonly code: string,
    readonly statut: number,
    readonly champs: Array<{ champ: string; message: string }> = [],
  ) {
    const detail = champs.length ? ` (${champs.map((c) => `${c.champ} : ${c.message}`).join(", ")})` : "";
    super((MESSAGES[code] ?? "Erreur inattendue, réessaie plus tard.") + detail);
  }
}

export async function appelerApi<T>(methode: "GET" | "POST" | "DELETE", chemin: string, corps?: unknown): Promise<T> {
  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode,
      credentials: "same-origin",
      headers: corps !== undefined ? { "Content-Type": "application/json" } : {},
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
  } catch {
    // Pas de réponse du tout : réseau coupé (ou serveur injoignable). Statut 0 par convention.
    throw new ErreurApi(navigator.onLine ? "serveur_injoignable" : "hors_ligne", 0);
  }
  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!reponse.ok) {
    throw new ErreurApi(
      String(donnees.erreur ?? donnees.error ?? "inconnue"),
      reponse.status,
      (donnees.champs as ErreurApi["champs"]) ?? [],
    );
  }
  return donnees as T;
}

export async function chargerCompteCourant(): Promise<CompteCourant | null> {
  try {
    return await appelerApi<CompteCourant>("GET", "/auth/moi");
  } catch (e) {
    if (e instanceof ErreurApi && e.statut === 401) return null;
    throw e;
  }
}
