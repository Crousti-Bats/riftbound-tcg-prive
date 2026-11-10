/**
 * Profil d'un joueur (/profil/<pseudo>) : avatar, bio, vitrine de ses plus belles cartes et statistiques.
 * Sur son propre profil, bouton « Personnaliser » : bio, avatar (une carte possédée) et vitrine de 6 cartes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarJoueur } from "../composants/avatar-joueur";
import { FicheCarte } from "../composants/fiche-carte";
import { ImageCarte } from "../composants/image-carte";
import { SelecteurCartes } from "../composants/selecteur-cartes";
import { appelerApi } from "../outils/appels-api";
import { cleLigne } from "../outils/echanges";
import { type Carte, classeRarete, libelleRarete, type SetInfo } from "../outils/libelles-cartes";
import { ecrireA } from "../outils/chat";
import { naviguer } from "../outils/navigation";
import { avatarDuProfil, LONGUEUR_BIO, type ProfilJoueur, signalerProfilModifie, TAILLE_VITRINE } from "../outils/profils";
import { ErreurPhoto, preparerPhoto } from "../outils/photo-profil";

type CarteVitrine = ProfilJoueur["vitrine"][number];
type CarteWishlist = ProfilJoueur["wishlist"][number];

export function PageProfil({ pseudo }: { pseudo: string }) {
  const [profil, setProfil] = useState<ProfilJoueur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [fiche, setFiche] = useState<CarteVitrine | null>(null);
  const [ficheWishlist, setFicheWishlist] = useState<CarteWishlist | null>(null);
  const [sets, setSets] = useState<SetInfo[]>([]);

  const charger = useCallback(
    () =>
      appelerApi<ProfilJoueur>("GET", `/profils/joueur/${encodeURIComponent(pseudo)}`).then(
        (p) => {
          setProfil(p);
          setErreur(null);
        },
        (e: Error) => setErreur(e.message),
      ),
    [pseudo],
  );

  // Un autre pseudo = une autre page (clé `pseudo` dans racine-application.tsx) : pas d'état à réinitialiser ici.
  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    appelerApi<{ sets: SetInfo[] }>("GET", "/catalogue/sets").then((r) => setSets(r.sets), () => undefined);
  }, []);

  const nomSet = (code: string) => sets.find((s) => s.code === code)?.nom ?? code;

  async function retirerPhotoModeration() {
    if (!profil || !window.confirm(`Retirer la photo de profil de ${profil.pseudo} ?`)) return;
    try {
      await appelerApi("DELETE", `/profils/joueur/${encodeURIComponent(profil.pseudo)}/photo`);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function effacerBio() {
    if (!profil || !window.confirm(`Effacer la bio de ${profil.pseudo} ?`)) return;
    try {
      await appelerApi("DELETE", `/profils/joueur/${encodeURIComponent(profil.pseudo)}/bio`);
      await charger();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  if (erreur && !profil) {
    return (
      <main className="conteneur">
        <p className="message-erreur">{erreur}</p>
      </main>
    );
  }
  if (!profil) {
    return (
      <main className="conteneur">
        <p className="aide">Chargement…</p>
      </main>
    );
  }

  if (edition) {
    return (
      <main className="conteneur pile page-profil">
        <EditeurProfil
          profil={profil}
          sets={sets}
          surAnnulation={() => {
            // La photo est déjà envoyée (ou retirée) au moment du choix : on relit le profil même en annulant.
            void charger();
            setEdition(false);
          }}
          surEnregistrement={async () => {
            signalerProfilModifie();
            await charger();
            setEdition(false);
          }}
        />
      </main>
    );
  }

  const stats = profil.statistiques;
  const membreDepuis = new Date(profil.membreDepuis).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <main className="conteneur pile page-profil">
      <section className="carte profil-entete">
        <AvatarJoueur pseudo={profil.pseudo} avatar={avatarDuProfil(profil.photo, profil.avatar)} taille="grand" />
        <div className="profil-identite">
          <h1>{profil.pseudo}</h1>
          <p className="aide">
            Membre depuis {membreDepuis}
            {!profil.photo && profil.avatar && ` · avatar : ${profil.avatar.nom}`}
          </p>
          {profil.bio ? (
            <p className="profil-bio">{profil.bio}</p>
          ) : (
            <p className="aide">{profil.estMoi ? "Pas encore de bio. Présente-toi !" : "Pas de bio."}</p>
          )}
          <div className="profil-actions">
            {profil.estMoi ? (
              <button onClick={() => setEdition(true)}>Personnaliser mon profil</button>
            ) : (
              <>
                <button onClick={() => naviguer(`/echanges/nouveau?avec=${encodeURIComponent(profil.pseudo)}`)}>Proposer un échange</button>
                <button className="secondaire" onClick={() => ecrireA(profil.pseudo)}>
                  Écrire
                </button>
              </>
            )}
            {profil.peutModerer && profil.photo && (
              <button className="secondaire" onClick={() => void retirerPhotoModeration()}>
                Retirer la photo (modération)
              </button>
            )}
            {profil.peutModerer && profil.bio && (
              <button className="secondaire" onClick={() => void effacerBio()}>
                Effacer la bio (modération)
              </button>
            )}
          </div>
          {erreur && <p className="message-erreur">{erreur}</p>}
        </div>
      </section>

      <section className="carte">
        <h2>Vitrine</h2>
        {profil.vitrine.length === 0 ? (
          <p className="aide">
            {profil.estMoi
              ? "Ta vitrine est vide. Personnalise ton profil pour exposer tes plus belles cartes."
              : `${profil.pseudo} n'expose encore aucune carte.`}
          </p>
        ) : (
          <div className="vitrine">
            {profil.vitrine.map((v) => (
              <button
                key={cleLigne(v.carte.code, v.foil)}
                className={`vignette-carte ${classeRarete(v.carte)}`}
                onClick={() => setFiche(v)}
                title={v.carte.nom}
              >
                <CadreCarte carte={v.carte} foil={v.foil} />
                <span className="legende-carte">{v.carte.nom}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="carte">
        <h2>
          <span className="titre-wishlist" aria-hidden="true">
            ♥
          </span>{" "}
          {profil.estMoi ? "Ma wishlist" : "Wishlist"}
          {profil.wishlist.length > 0 && <span className="aide"> · {profil.wishlist.length}</span>}
        </h2>
        {profil.wishlist.length === 0 ? (
          <p className="aide">
            {profil.estMoi
              ? "Ta wishlist est vide. Ajoute des cartes avec le bouton ♡ sur leur fiche : elles apparaîtront aussi dans « Qui a ? » au marché."
              : `${profil.pseudo} ne recherche aucune carte pour l'instant.`}
          </p>
        ) : (
          <>
            {!profil.estMoi && profil.wishlist.some((w) => w.jePossede > 0) && (
              <p className="aide">
                Tu as {profil.wishlist.filter((w) => w.jePossede > 0).length} de ces cartes : propose-lui un échange !
              </p>
            )}
            <div className="grille-cartes grille-compacte">
              {profil.wishlist.map((w) => (
                <button key={w.carte.code} className={`vignette-carte ${classeRarete(w.carte)}`} onClick={() => setFicheWishlist(w)} title={w.carte.nom}>
                  <CadreCarte carte={w.carte} foil={false} />
                  {!profil.estMoi && w.jePossede > 0 && <span className="pastille-info pastille-tu-las">Tu l'as ×{w.jePossede}</span>}
                  <span className="legende-carte">
                    {w.carte.nom}
                    <small>{libelleRarete(w.carte)}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="carte resume-collection">
        <div className="chiffres-collection">
          <p>
            <strong>{stats.totalCartes}</strong>
            <span>carte{stats.totalCartes > 1 ? "s" : ""}</span>
          </p>
          <p>
            <strong>{stats.cartesDistinctes}</strong>
            <span>différente{stats.cartesDistinctes > 1 ? "s" : ""}</span>
          </p>
          <p>
            <strong>{stats.boostersOuverts}</strong>
            <span>booster{stats.boostersOuverts > 1 ? "s" : ""}</span>
          </p>
          <p>
            <strong>{stats.echangesReussis}</strong>
            <span>échange{stats.echangesReussis > 1 ? "s" : ""}</span>
          </p>
        </div>
        <div className="completion">
          {stats.completion
            .filter((s) => s.total > 0)
            .map((s) => (
              <div key={s.code} className="completion-set">
                <span className="aide">
                  {s.nom} — {s.possedees}/{s.total}
                </span>
                <span className="barre-completion">
                  <span className="barre-completion-remplie" style={{ width: `${(s.possedees / s.total) * 100}%` }} />
                </span>
              </div>
            ))}
        </div>
      </section>

      {ficheWishlist && (
        <FicheCarte
          carte={ficheWishlist.carte}
          nomSet={nomSet(ficheWishlist.carte.set)}
          surFermeture={() => {
            setFicheWishlist(null);
            void charger(); // la carte a pu être retirée de ma wishlist depuis sa fiche
          }}
        />
      )}
      {fiche && <FicheCarte carte={fiche.carte} nomSet={nomSet(fiche.carte.set)} foil={fiche.foil} surFermeture={() => setFiche(null)} />}
    </main>
  );
}

function CadreCarte({ carte, foil }: { carte: Carte; foil: boolean }) {
  return (
    <span className={`cadre-carte ${foil ? "voile-foil" : ""}`}>
      <ImageCarte className={carte.orientation === "paysage" ? "image-paysage" : undefined} image={carte.image} largeur={300} alt={carte.nom} paresseuse />
      {foil && <span className="badge-foil">✨</span>}
    </span>
  );
}

/** Personnalisation de mon profil. Rien n'est envoyé avant « Enregistrer ». */
function EditeurProfil({
  profil,
  sets,
  surAnnulation,
  surEnregistrement,
}: {
  profil: ProfilJoueur;
  sets: SetInfo[];
  surAnnulation: () => void;
  surEnregistrement: () => Promise<void>;
}) {
  const [bio, setBio] = useState(profil.bio);
  const [avatar, setAvatar] = useState<Carte | null>(profil.avatar);
  const [photo, setPhoto] = useState<string | null>(profil.photo);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [vitrine, setVitrine] = useState<CarteVitrine[]>(profil.vitrine);
  const [choix, setChoix] = useState<"avatar" | "vitrine" | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const dejaExposees = useMemo(() => new Map(vitrine.map((v) => [cleLigne(v.carte.code, v.foil), 1])), [vitrine]);
  const avatarActuel = useMemo(() => new Map(avatar ? [[avatar.code, 1]] : []), [avatar]);

  function deplacer(index: number, sens: -1 | 1) {
    setVitrine((l) => {
      const cible = index + sens;
      if (cible < 0 || cible >= l.length) return l;
      const copie = [...l];
      [copie[index], copie[cible]] = [copie[cible] as CarteVitrine, copie[index] as CarteVitrine];
      return copie;
    });
  }

  // La photo est envoyée tout de suite (sans attendre « Enregistrer ») : c'est une image, pas un champ du formulaire.
  async function choisirPhoto(fichier: File | undefined) {
    if (!fichier) return;
    setErreur(null);
    setEnvoiPhoto(true);
    try {
      const image = await preparerPhoto(fichier);
      const r = await appelerApi<{ photo: string }>("POST", "/profils/photo", { image });
      setPhoto(r.photo);
      signalerProfilModifie();
    } catch (e) {
      setErreur(e instanceof ErreurPhoto ? e.message : (e as Error).message);
    } finally {
      setEnvoiPhoto(false);
    }
  }

  async function retirerPhoto() {
    setErreur(null);
    try {
      await appelerApi("DELETE", "/profils/photo");
      setPhoto(null);
      signalerProfilModifie();
    } catch (e) {
      setErreur((e as Error).message);
    }
  }

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    try {
      await appelerApi("POST", "/profils", {
        bio,
        avatar: avatar?.code ?? null,
        vitrine: vitrine.map((v) => ({ code: v.carte.code, foil: v.foil })),
      });
      await surEnregistrement();
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  }

  return (
    <>
      <header className="entete">
        <h1>Personnaliser mon profil</h1>
        <div className="profil-actions">
          <button className="secondaire" onClick={surAnnulation} disabled={envoi}>
            Annuler
          </button>
          <button onClick={() => void enregistrer()} disabled={envoi || bio.length > LONGUEUR_BIO}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </header>
      {erreur && <p className="message-erreur">{erreur}</p>}

      <section className="carte profil-entete">
        <AvatarJoueur pseudo={profil.pseudo} avatar={avatarDuProfil(photo, avatar)} taille="grand" />
        <div className="profil-identite">
          <h2>Photo de profil</h2>
          <p className="aide">
            {photo
              ? "Ta photo est en ligne. Elle s'affiche partout à la place de la carte."
              : avatar
                ? `Illustration de « ${avatar.nom} ». Tu peux aussi mettre ta propre photo.`
                : "Mets ta propre photo, ou l'illustration d'une carte de ta collection."}
          </p>
          <div className="profil-actions">
            <label className={`bouton petit ${envoiPhoto ? "desactive" : ""}`}>
              {envoiPhoto ? "Envoi…" : photo ? "Changer de photo" : "Envoyer une photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="champ-fichier-cache"
                disabled={envoiPhoto}
                onChange={(e) => {
                  void choisirPhoto(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {photo && (
              <button className="petit secondaire" onClick={() => void retirerPhoto()}>
                Retirer la photo
              </button>
            )}
            <button className="petit secondaire" onClick={() => setChoix("avatar")}>
              {avatar ? "Changer de carte" : "Choisir une carte"}
            </button>
            {avatar && (
              <button className="petit secondaire" onClick={() => setAvatar(null)}>
                Retirer la carte
              </button>
            )}
          </div>
          <p className="aide">La photo est recadrée en carré et réduite avant l'envoi. Évite les photos d'autres personnes sans leur accord.</p>
        </div>
      </section>

      <section className="carte pile-serree">
        <label htmlFor="bio-profil">
          <h2>Bio</h2>
        </label>
        <textarea
          id="bio-profil"
          className="profil-bio-saisie"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={LONGUEUR_BIO}
          rows={4}
          placeholder="Ton deck préféré, la carte que tu cherches désespérément…"
        />
        <p className="aide compteur-bio">
          {bio.length}/{LONGUEUR_BIO}
        </p>
      </section>

      <section className="carte">
        <h2>Vitrine</h2>
        <p className="aide">
          Jusqu'à {TAILLE_VITRINE} cartes de ta collection, dans l'ordre que tu veux. Une carte échangée quitte la vitrine d'elle-même.
        </p>
        <div className="vitrine">
          {vitrine.map((v, i) => (
            <div key={cleLigne(v.carte.code, v.foil)} className={`vignette-carte ${classeRarete(v.carte)}`}>
              <CadreCarte carte={v.carte} foil={v.foil} />
              <span className="legende-carte">{v.carte.nom}</span>
              <span className="vitrine-commandes">
                <button className="petit secondaire" onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label={`Avancer ${v.carte.nom}`} title="Avancer">
                  ←
                </button>
                <button
                  className="petit secondaire"
                  onClick={() => setVitrine((l) => l.filter((_, j) => j !== i))}
                  aria-label={`Retirer ${v.carte.nom} de la vitrine`}
                  title="Retirer"
                >
                  ×
                </button>
                <button
                  className="petit secondaire"
                  onClick={() => deplacer(i, 1)}
                  disabled={i === vitrine.length - 1}
                  aria-label={`Reculer ${v.carte.nom}`}
                  title="Reculer"
                >
                  →
                </button>
              </span>
            </div>
          ))}
          {vitrine.length < TAILLE_VITRINE && (
            <button className="vitrine-vide" onClick={() => setChoix("vitrine")}>
              <span aria-hidden="true">+</span>
              Ajouter une carte
            </button>
          )}
        </div>
      </section>

      {choix && (
        <div className="fond-modale" onClick={() => setChoix(null)} role="presentation">
          <div
            className="modale modale-choix"
            role="dialog"
            aria-modal="true"
            aria-label={choix === "avatar" ? "Choisir une photo de profil" : "Ajouter une carte à la vitrine"}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="entete">
              <h2>{choix === "avatar" ? "Choisir une photo de profil" : `Ajouter à la vitrine (${vitrine.length}/${TAILLE_VITRINE})`}</h2>
              <button className="secondaire" onClick={() => setChoix(null)}>
                Fermer
              </button>
            </header>
            <SelecteurCartes
              source="/collection"
              sets={sets}
              mode={choix}
              dejaChoisi={choix === "avatar" ? avatarActuel : dejaExposees}
              surAjout={(carte, foil) => {
                if (choix === "avatar") {
                  setAvatar(carte);
                  setChoix(null);
                  return;
                }
                const suivante = [...vitrine, { carte, foil }];
                setVitrine(suivante);
                if (suivante.length >= TAILLE_VITRINE) setChoix(null);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
