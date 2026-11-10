/**
 * Apprendre à jouer (/apprendre) : les règles de base de Riftbound en duel, puis comment jouer sur la table du site.
 * Rédigé d'après le guide officiel « How to Play » et les Core Rules (version du 2026-10-09), en nos propres mots.
 * Illustrations : de vraies cartes du deck de démo Annie (catalogue).
 */
import { type ReactNode, useEffect, useState } from "react";
import { ImageCarte } from "../composants/image-carte";
import { appelerApi } from "../outils/appels-api";
import type { Carte } from "../outils/libelles-cartes";
import { naviguer } from "../outils/navigation";

/** Cartes d'exemple (deck de démo Annie) : Légende, champion, unité, sort, équipement, rune, champ de bataille. */
const EXEMPLES = {
  legende: "ogs-017-024",
  champion: "ogs-010-024",
  unite: "ogn-003-298",
  sort: "ogn-004-298",
  equipement: "ogn-021-298",
  rune: "ogn-007-298",
  champ: "ogn-282-298",
} as const;

const SOMMAIRE: Array<[string, string]> = [
  ["but", "Le but du jeu"],
  ["deck", "Ton deck"],
  ["mise-en-place", "Mise en place"],
  ["payer", "Payer une carte"],
  ["tour", "Le déroulé d'un tour"],
  ["cartes", "Unités, sorts, équipements"],
  ["bouger", "Bouger et conquérir"],
  ["combat", "Le combat"],
  ["victoire", "Gagner la partie"],
  ["mots-cles", "Mots-clés courants"],
  ["table", "Jouer sur la table du site"],
];

export function PageApprendre() {
  const [cartes, setCartes] = useState<Record<string, Carte>>({});
  useEffect(() => {
    appelerApi<{ cartes: Carte[] }>("GET", `/catalogue/lot?codes=${Object.values(EXEMPLES).join(",")}`).then(
      (r) => setCartes(Object.fromEntries(r.cartes.map((c) => [c.code, c]))),
      () => undefined,
    );
  }, []);
  const illustration = (code: string, legende: string) => <Illustration carte={cartes[code]} legende={legende} />;

  return (
    <main className="conteneur apprendre">
      <header className="entete">
        <h1>Apprendre à jouer</h1>
        <button onClick={() => naviguer("/tutoriel")}>Tuto interactif</button>
      </header>
      <p className="aide apprendre-intro">
        Riftbound se joue à deux (ou plus) : tu fais équipe avec un champion de League of Legends et tu envoies tes unités conquérir
        des champs de bataille. Voici l'essentiel pour une partie en duel. Les règles complètes (en anglais) sont sur le site officiel.
      </p>

      <nav className="carte apprendre-sommaire" aria-label="Sommaire">
        <ol>
          {SOMMAIRE.map(([id, titre]) => (
            <li key={id}>
              <a href={`#${id}`}>{titre}</a>
            </li>
          ))}
        </ol>
      </nav>

      <Section id="but" titre="1. Le but du jeu">
        <p>
          Le premier à <strong>8 points</strong> gagne. On marque en contrôlant des champs de bataille :
        </p>
        <ul>
          <li>
            <strong>Conquérir</strong> un champ de bataille (y prendre le contrôle) : <strong>+1 point</strong>.
          </li>
          <li>
            <strong>Tenir</strong> un champ de bataille : <strong>+1 point</strong> au début de chacun de tes tours, pour chaque champ que
            tu contrôles encore.
          </li>
        </ul>
      </Section>

      <Section id="deck" titre="2. Ton deck">
        <div className="apprendre-galerie">
          {illustration(EXEMPLES.legende, "1 Légende")}
          {illustration(EXEMPLES.champion, "1 champion choisi")}
          {illustration(EXEMPLES.rune, "12 runes")}
          {illustration(EXEMPLES.champ, "3 champs de bataille")}
        </div>
        <ul>
          <li>
            <strong>La Légende</strong> : ton champion « chef ». Elle fixe tes deux <strong>domaines</strong> (couleurs) : tu ne joues que
            des cartes de ces domaines. Elle a souvent une capacité qui sert pendant la partie.
          </li>
          <li>
            <strong>Le champion choisi</strong> : une unité du même champion que ta Légende (ici Annie). Il commence la partie à côté de ta
            Légende, prêt à être joué.
          </li>
          <li>
            <strong>Le deck principal</strong> : 40 cartes en comptant le champion, donc 39 à mélanger. 3 exemplaires au maximum d'une même
            carte.
          </li>
          <li>
            <strong>Le deck de runes</strong> : 12 runes de tes domaines (6 + 6 pour commencer). Elles servent à payer tes cartes.
          </li>
          <li>
            <strong>3 champs de bataille</strong> : en duel, un seul est utilisé par partie, tiré au sort.
          </li>
        </ul>
      </Section>

      <Section id="mise-en-place" titre="3. Mise en place">
        <ol>
          <li>Chaque joueur tire au hasard 1 de ses 3 champs de bataille et le pose au milieu : il y a donc 2 champs de bataille.</li>
          <li>Légende et champion face visible, deck principal et deck de runes mélangés, chacun de son côté.</li>
          <li>On tire au sort qui commence.</li>
          <li>
            Chacun pioche <strong>4 cartes</strong>. Une seule fois, tu peux faire un <strong>mulligan</strong> : remettre jusqu'à 2 cartes
            sous ton deck et en piocher autant.
          </li>
          <li>
            Le joueur qui joue en second canalise <strong>3 runes</strong> au lieu de 2 à son premier tour, pour compenser.
          </li>
        </ol>
        <p className="aide">Sur la table du site, tout ça est fait automatiquement, sauf le mulligan (bouton « Mulligan ») et la rune en plus.</p>
      </Section>

      <Section id="payer" titre="4. Payer une carte">
        <div className="apprendre-duo">
          {illustration(EXEMPLES.unite, "Coût en haut à gauche")}
          <div>
            <p>Chaque carte a un coût en haut à gauche, en deux parties (toutes les cartes n'ont pas les deux) :</p>
            <ul>
              <li>
                <strong>L'énergie</strong> (le nombre) : <strong>incline</strong> (tourne sur le côté) autant de runes.
              </li>
              <li>
                <strong>La puissance</strong> (les symboles) : <strong>recycle</strong> une rune du bon domaine par symbole, c'est-à-dire
                remets-la sous ton deck de runes. Tu peux recycler une rune que tu viens d'incliner.
              </li>
            </ul>
            <p>
              Par défaut, on ne joue des cartes que pendant son tour, quand il n'y a pas de combat en cours. Les cartes{" "}
              <strong>Action</strong> se jouent aussi pendant un combat, les cartes <strong>Réaction</strong> à n'importe quel moment, même
              en réponse à une autre carte (elles se résolvent alors en premier).
            </p>
          </div>
        </div>
      </Section>

      <Section id="tour" titre="5. Le déroulé d'un tour">
        <ol className="apprendre-etapes">
          <li>
            <strong>Réveil</strong> : redresse toutes tes cartes inclinées (unités, runes, Légende).
          </li>
          <li>
            <strong>Début</strong> : résous les effets « au début du tour », puis marque <strong>1 point par champ de bataille</strong> que
            tu contrôles (tenir).
          </li>
          <li>
            <strong>Canaliser</strong> : pose les <strong>2 runes</strong> du dessus de ton deck de runes.
          </li>
          <li>
            <strong>Pioche</strong> : pioche <strong>1 carte</strong> (pas de limite de main).
          </li>
          <li>
            <strong>Action</strong> : dans l'ordre que tu veux, autant que tu peux : jouer des cartes, utiliser des capacités, déplacer des
            unités.
          </li>
          <li>
            <strong>Fin</strong> : les effets « à la fin du tour » se résolvent et <strong>toutes les unités guérissent</strong> (on retire
            les dégâts). Au tour de l'adversaire !
          </li>
        </ol>
      </Section>

      <Section id="cartes" titre="6. Unités, sorts, équipements">
        <div className="apprendre-galerie">
          {illustration(EXEMPLES.unite, "Unité")}
          {illustration(EXEMPLES.sort, "Sort")}
          {illustration(EXEMPLES.equipement, "Équipement")}
        </div>
        <ul>
          <li>
            <strong>Unité</strong> : arrive <strong>inclinée</strong>, dans ta base ou sur un champ de bataille que tu contrôles. Le chiffre
            en haut à droite est sa <strong>Might</strong> (sa force). Si elle a autant de dégâts que sa Might, elle meurt et va à la
            défausse. Ton champion est une unité.
          </li>
          <li>
            <strong>Sort</strong> : fait son effet, puis va à la défausse. Il ne reste jamais sur la table.
          </li>
          <li>
            <strong>Équipement</strong> : arrive <strong>prêt</strong> (debout) dans ta base. Il ne bouge pas et ne combat pas, mais ses
            capacités aident.
          </li>
        </ul>
      </Section>

      <Section id="bouger" titre="7. Bouger et conquérir">
        <ul>
          <li>
            Pour se déplacer, une unité <strong>s'incline</strong> : de ta base vers un champ de bataille, ou d'un champ de bataille vers
            ta base. Seules les unités avec <strong>Ganking</strong> vont directement d'un champ de bataille à un autre.
          </li>
          <li>
            Champ de bataille <strong>vide</strong> : il suffit d'y arriver pour le <strong>conquérir</strong> (+1 point). Tu le contrôles
            tant qu'il te reste au moins une unité dessus.
          </li>
          <li>
            Champ de bataille <strong>occupé par l'adversaire</strong> : y arriver déclenche un <strong>combat</strong>.
          </li>
        </ul>
      </Section>

      <Section id="combat" titre="8. Le combat">
        <ol className="apprendre-etapes">
          <li>Les effets « quand je défends » puis « quand j'attaque » se résolvent.</li>
          <li>
            <strong>Affrontement</strong> : chacun peut jouer des cartes Action et Réaction (et révéler une carte cachée sur ce champ). Quand
            les deux joueurs passent, on se bat.
          </li>
          <li>
            <strong>Les dégâts</strong> : chaque camp additionne la Might de ses unités présentes et répartit ce total sur les unités
            adverses. Il faut infliger assez de dégâts pour tuer une unité avant de passer à la suivante, et les unités avec{" "}
            <strong>Tank</strong> prennent les dégâts en premier. Tout tombe en même temps.
          </li>
          <li>Les unités qui ont autant de dégâts que leur Might meurent. Ensuite, toutes les unités guérissent.</li>
          <li>
            S'il ne reste <strong>que des attaquants</strong>, l'attaquant <strong>conquiert</strong> le champ de bataille (+1 point). S'il
            reste au moins un défenseur, pas de conquête et les attaquants survivants <strong>rentrent à la base</strong>.
          </li>
        </ol>
        <p className="aide">Les dégâts ne réduisent pas la Might : une unité de 6 avec 5 dégâts frappe toujours pour 6.</p>
      </Section>

      <Section id="victoire" titre="9. Gagner la partie">
        <p>
          La partie s'arrête au <strong>8e point</strong>. Mais ce dernier point ne peut pas venir d'une simple conquête : il faut le marquer
          en <strong>tenant</strong> un champ de bataille (au début de ton tour), ou en marquant <strong>tous les champs de bataille</strong>{" "}
          dans le même tour. Sinon, au lieu du point, tu pioches 1 carte.
        </p>
      </Section>

      <Section id="mots-cles" titre="10. Mots-clés courants">
        <dl className="apprendre-mots-cles">
          {MOTS_CLES.map(([mot, sens]) => (
            <div key={mot}>
              <dt>{mot}</dt>
              <dd>{sens}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="table" titre="11. Jouer sur la table du site">
        <p>
          La table ne fait pas respecter les règles : comme autour d'une vraie table, c'est vous qui jouez honnêtement. Avec l'
          <strong>aide automatique</strong> (activée par défaut), elle fait les gestes pour toi : payer, incliner, compter les points.
          Tu peux la couper pour tout faire à la main (incliner les runes, « Sous le deck de runes » pour recycler, « + » à côté du score…). Elle garde secrètes
          ta main et l'ordre de tes decks, et montre tout le reste en direct.
        </p>
        <table className="apprendre-table">
          <thead>
            <tr>
              <th>Dans le jeu</th>
              <th>Sur la table</th>
            </tr>
          </thead>
          <tbody>
            {GESTES.map(([jeu, table]) => (
              <tr key={jeu}>
                <td>{jeu}</td>
                <td>{table}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="aide">Clique sur n'importe quelle carte pour voir son texte en grand et ce que tu peux en faire.</p>
        <div className="actions-ligne">
          <button onClick={() => naviguer("/tutoriel")}>Essayer avec le tuto interactif</button>
          <button className="secondaire" onClick={() => naviguer("/jouer")}>
            Jouer une partie
          </button>
        </div>
      </Section>
    </main>
  );
}

const MOTS_CLES: Array<[string, string]> = [
  ["Accelerate", "En payant un coût en plus, l'unité arrive prête (debout) au lieu d'inclinée."],
  ["Assault", "Plus de Might quand l'unité attaque."],
  ["Shield", "Plus de Might quand l'unité défend."],
  ["Tank", "Prend les dégâts de combat en premier."],
  ["Ganking", "Peut aller directement d'un champ de bataille à un autre."],
  ["Legion", "Effet bonus si tu as déjà joué une autre carte de ton deck pendant ce tour."],
  ["Deathknell", "Effet qui se déclenche quand l'unité meurt."],
  ["Deflect", "L'adversaire doit payer de la puissance en plus pour cibler cette carte."],
  ["Vision", "Quand tu la joues, regarde la carte du dessus de ton deck ; tu peux la mettre dessous."],
  ["Temporary", "Meurt au début de ton prochain tour."],
  [
    "Hidden",
    "Pendant ton tour, pose la carte face cachée sur un champ de bataille que tu contrôles en payant 1 puissance (une seule par champ). Plus tard, révèle-la et joue-la comme une Réaction, gratuitement, sur ce champ.",
  ],
  ["Action / Réaction", "Se jouent aussi pendant un combat ; une Réaction peut même répondre à une autre carte."],
  ["Stun (étourdir)", "L'unité n'inflige pas de dégâts en combat ce tour-ci."],
  ["Buff", "Un marqueur +1 Might sur une unité (un seul par unité, sauf exception)."],
];

const GESTES: Array<[string, string]> = [
  ["Début du tour : réveil, tenir, canaliser 2, piocher 1", "Bouton « Début de mon tour » (aide automatique) : tout est fait, points des champs tenus compris"],
  ["Mulligan", "Bouton « Mulligan » au-dessus de ta main, puis choisis jusqu'à 2 cartes"],
  ["Jouer une unité ou un équipement", "Clic sur la carte → « Jouer dans ma base » : les runes sont inclinées et recyclées pour toi, l'unité arrive inclinée"],
  ["Jouer un sort", "Clic sur la carte → « Lancer le sort » (paiement automatique), puis applique son effet"],
  ["Déplacer une unité, conquérir", "Clic sur l'unité → « Conquérir… (+1) », « Attaquer… » ou « Revenir à ma base » : elle s'incline, la conquête est comptée"],
  ["Fin d'un combat", "Après les dégâts, bouton « Terminer le combat » sur le champ : conquête (+1), retour à la base des attaquants ou champ gardé, appliqués pour toi"],
  ["Infliger des dégâts", "Clic sur l'unité → « + marqueur » (un marqueur = 1 dégât)"],
  ["Une unité meurt", "Clic sur l'unité → « Défausse » (même celle de l'adversaire : elle va dans SA défausse)"],
  ["Créer un token (Recruit, Bomb…)", "Bouton « Créer un token »"],
  ["Hidden : poser face cachée", "Clic sur la carte en main → coche « Jouer face cachée » → le champ de bataille"],
  ["Fin du tour : guérir", "Retire les marqueurs de dégâts (« − marqueur »)"],
];

function Section({ id, titre, children }: { id: string; titre: string; children: ReactNode }) {
  return (
    <section id={id} className="carte apprendre-section">
      <h2>{titre}</h2>
      {children}
    </section>
  );
}

function Illustration({ carte, legende }: { carte: Carte | undefined; legende: string }) {
  const paysage = carte?.orientation === "paysage";
  return (
    <figure className={paysage ? "apprendre-figure apprendre-figure-paysage" : "apprendre-figure"}>
      {carte ? <ImageCarte image={carte.image} largeur={300} alt={carte.nom} paresseuse /> : <span className="apprendre-figure-vide" />}
      <figcaption>{legende}</figcaption>
    </figure>
  );
}
