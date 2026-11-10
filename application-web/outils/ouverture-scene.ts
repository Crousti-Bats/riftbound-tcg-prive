/**
 * Scène d'ouverture d'un booster : le booster officiel à déchirer, puis les 14 cartes une par une, avec une mise en
 * scène par rareté (néon, Alt Art, Overnumbered, Signée, Special, Ultime). Moteur impératif (DOM + canvas) monté par
 * le composant React `ouverture-booster.tsx`, qui garde la main sur le récapitulatif et la fiche de carte.
 *
 * Sécurité : aucune donnée de carte ne passe par innerHTML (textContent et propriétés seulement) ; les seuls
 * innerHTML sont des SVG fixes écrits ici. Les styles dynamiques passent par le CSSOM, compatible avec la CSP.
 */
import { type CarteOuverte, urlImage } from "./libelles-cartes";
import {
  type CategorieRevelation,
  REVELATION,
  type Theme,
  THEMES,
  categorieRevelation,
  numerosCarte,
  ordreRevelation,
  themeCarte,
} from "./ouverture-revelation";
import { arreterMusique, jouerSon, jouerTheme } from "./ouverture-sons";

export interface OptionsScene {
  set: string;
  nomSet: string;
  /** Numéro (1, 2, 3…) de l'illustration du premier booster affiché, pour reprendre celle de l'accueil. Ensuite : au hasard. */
  illustration?: number;
  /** Appel au serveur, lancé au moment où le booster se déchire. */
  ouvrir: () => Promise<CarteOuverte[]>;
  /** Toutes les cartes sont révélées (ou « Tout révéler ») : le composant affiche le récapitulatif. */
  surTerminee: (cartes: CarteOuverte[]) => void;
  surErreur: (message: string) => void;
  surAvis: (texte: string) => void;
  /** Préférence « Sans animation » : après la déchirure, on passe directement au récapitulatif. */
  sansAnimation?: () => boolean;
}

export interface Scene {
  /** Nouveau booster du même set (après le récapitulatif ou une erreur). */
  /** Nouveau booster ; `illustration` : celle à afficher (sinon au hasard). */
  recommencer: (illustration?: number) => void;
  /** Annule l'animation en cours (déchirure ou révélation) et affiche tout de suite le récapitulatif. */
  passer: () => void;
  detruire: () => void;
}

type TypeParticule =
  | "poussiere"
  | "petale"
  | "eclat-acier"
  | "spore"
  | "fumee"
  | "braise"
  | "etincelle"
  | "eclat"
  | "confetti"
  | "piece"
  | "tache"
  | "etoile"
  | "vide";

interface Emetteur {
  type: TypeParticule;
  couleurs: string[];
  taux: number;
}

interface Particule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  vie: number;
  usure: number;
  taille: number;
  couleur: string;
  type: TypeParticule;
  phase: number;
  angle: number;
  cible?: number;
  cx?: number;
  cy?: number;
}

/** Ambiance de chaque set : particules, éclairs, nombre de visuels de booster dans /ouverture/. */
const AMBIANCES: Record<string, { emetteurs: Emetteur[]; eclairs?: boolean; boosters: number }> = {
  ogn: {
    boosters: 3,
    emetteurs: [
      { type: "poussiere", couleurs: ["#e6b85c", "#ffe2a0"], taux: 0.3 },
      { type: "poussiere", couleurs: ["#5aa9ff", "#bfe0ff"], taux: 0.2 },
    ],
  },
  sfd: {
    boosters: 1,
    emetteurs: [
      { type: "petale", couleurs: ["#ff8fb3", "#ffc2d6", "#ffffff"], taux: 0.25 },
      { type: "eclat-acier", couleurs: ["#ffffff", "#cfe3ff"], taux: 0.04 },
    ],
  },
  unl: {
    boosters: 3,
    eclairs: true,
    emetteurs: [
      { type: "spore", couleurs: ["#b9ff6a", "#7dff9a"], taux: 0.22 },
      { type: "poussiere", couleurs: ["#9b6bff", "#6fb6ff"], taux: 0.12 },
    ],
  },
  ven: {
    boosters: 2,
    emetteurs: [
      { type: "fumee", couleurs: ["#7dff3c", "#3dff8b"], taux: 0.08 },
      { type: "fumee", couleurs: ["#ff2a2a"], taux: 0.05 },
      { type: "braise", couleurs: ["#ff4a2a", "#ffb03c", "#9dff3c"], taux: 0.3 },
    ],
  },
  rad: { boosters: 1, emetteurs: [{ type: "etincelle", couleurs: ["#ffe08a", "#ffffff", "#ff79e1", "#7fd8ff"], taux: 0.45 }] },
};

const ARC_EN_CIEL = ["#ff3d6e", "#ffb13d", "#f9ff3d", "#3dff8b", "#3dc8ff", "#8b3dff"];
const hasard = <T>(liste: readonly T[]): T => liste[Math.floor(Math.random() * liste.length)] as T;

function element<K extends keyof HTMLElementTagNameMap>(balise: K, classe = "", texte?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(balise);
  if (classe) el.className = classe;
  if (texte !== undefined) el.textContent = texte;
  return el;
}

/** Dos de carte du jeu : bleu pétrole et jaune ; variante claire pour les runes. SVG fixe (aucune donnée externe). */
function dosDeCarte(rune: boolean): string {
  const fond = rune ? "#f2f0e9" : "#063651";
  const trait = rune ? "#063651" : "#f4c430";
  const id = rune ? "r" : "b";
  const glyphe = (y: number, sens: number) => `<g transform="translate(372 ${y}) scale(1 ${sens})" fill="none" stroke="${trait}" stroke-width="4" stroke-linejoin="round">
      <path d="M0 -28 L22 0 L0 28 L-22 0 Z" fill="${trait}" stroke="none"/><path d="M-8 -6 Q4 -14 8 -2 Q10 8 -2 10 Q-8 10 -6 2" stroke="${fond}" stroke-width="4"/></g>`;
  let graduations = "";
  for (const [debut, fin] of [
    [236, 304],
    [56, 124],
  ] as const) {
    for (let a = debut; a <= fin; a += 4) {
      const r = (a * Math.PI) / 180;
      const c = Math.cos(r);
      const s = Math.sin(r);
      graduations += `<line x1="${372 + c * 146}" y1="${520 + s * 146}" x2="${372 + c * 160}" y2="${520 + s * 160}"/>`;
    }
  }
  return `<svg viewBox="0 0 745 1040" aria-hidden="true">
    <defs><clipPath id="ob-cotes-${id}"><rect x="0" y="0" width="152" height="1040"/><rect x="593" y="0" width="152" height="1040"/></clipPath></defs>
    <rect width="745" height="1040" fill="${fond}"/>
    <g fill="none" stroke="${trait}">
      <path d="M52 36 H693 V52 H709 V988 H693 V1004 H52 V988 H36 V52 H52 Z" stroke-width="3.5"/>
      <circle cx="372" cy="520" r="236" stroke-width="5"/>
      <circle cx="372" cy="520" r="258" stroke-width="4" clip-path="url(#ob-cotes-${id})"/>
      <path d="M372 210 L682 520 L372 830 L62 520 Z" fill="${fond}" stroke-width="5"/>
      <path d="M372 266 L626 520 L372 774 L118 520 Z" stroke-width="4"/>
      <path d="M26 520 L114 432 L222 432 L222 606 L114 606 Z M719 520 L631 432 L523 432 L523 606 L631 606 Z" fill="${fond}" stroke="none"/>
      <path d="M222 432 H114 L26 520 L114 606 H222 M523 432 H631 L719 520 L631 606 H523" stroke-width="5" stroke-linejoin="miter"/>
      <path d="M210 456 H134 L70 520 L134 582 H210 M535 456 H611 L675 520 L611 582 H535" stroke-width="3"/>
      <g stroke-width="4" stroke-linecap="round">${graduations}</g>
    </g>
    <g fill="${trait}" font-family="Montserrat, 'Arial Black', sans-serif" font-weight="800">
      <text x="206" y="502" font-size="80" textLength="270" lengthAdjust="spacingAndGlyphs">LEAGUE</text>
      <text x="481" y="472" font-size="32" textLength="62" lengthAdjust="spacingAndGlyphs">OF</text>
      <text x="206" y="582" font-size="80" textLength="322" lengthAdjust="spacingAndGlyphs">LEGENDS</text>
      <text x="531" y="530" font-size="13" textLength="16" lengthAdjust="spacingAndGlyphs">TM</text>
    </g>
    ${glyphe(150, 1)}${glyphe(888, -1)}
  </svg>`;
}

/** Silhouette de l'ombre du Baron (forme fixe, floutée en CSS). */
const SILHOUETTE_BARON = `<g class="ob-silhouette">
    <path d="M30 330 C120 250 200 390 320 300" fill="none" stroke-width="38"/>
    <path d="M300 310 C420 210 520 360 640 260 C690 220 720 215 760 225" fill="none" stroke-width="90"/>
    <path d="M720 175 C790 120 880 140 950 195 L995 218 L940 238 C900 272 820 305 730 300 Z"/>
    <path d="M735 180 L765 70 L792 160 L835 55 L855 150 L905 90 L910 182 Z"/>
  </g>
  <ellipse class="ob-yeux" cx="905" cy="210" rx="9" ry="4"/>`;

const SIGNATURE =
  '<path d="M18 74 C34 18 66 10 58 58 C54 84 38 92 44 70 C52 44 84 40 92 62 C98 78 108 76 118 56 C128 36 140 34 142 56 C144 76 156 80 168 58 C178 40 192 22 206 30 C222 40 196 84 214 82 C232 80 238 46 256 48 C270 50 264 74 280 70 C292 66 298 56 304 50 M40 96 C110 86 200 84 300 90"/>';

interface CarteScene {
  carte: CarteOuverte;
  cat: CategorieRevelation;
  theme: Theme | null;
}

export function monterScene(racine: HTMLElement, options: OptionsScene): Scene {
  // Liste blanche : le code du set (venu d'un <select>) n'entre jamais tel quel dans une URL, seule la clé connue sert.
  const setVisuel = Object.keys(AMBIANCES).find((cle) => cle === options.set) ?? "ogn";
  const ambiance = AMBIANCES[setVisuel] ?? AMBIANCES.ogn!;
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Minuteurs suivis : à la destruction, tout s'arrête et les attentes restent en suspens. ----------
  let detruite = false;
  const minuteurs = new Set<number>();
  const intervalles = new Set<number>();
  const plusTard = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      minuteurs.delete(id);
      if (!detruite) fn();
    }, ms);
    minuteurs.add(id);
    return id;
  };
  // Incrémenté quand on saute des cartes ou qu'on annule l'animation : les attentes lancées avant restent en
  // suspens, donc la mise en scène de l'ancienne carte s'arrête net (pas d'effet qui surgit sur le récapitulatif).
  let tour = 0;
  const pause = (ms: number) => {
    const monTour = tour;
    return new Promise<void>((r) =>
      plusTard(() => {
        if (monTour === tour) r();
      }, reduit ? Math.min(ms, 150) : ms),
    );
  };
  // Annulation pendant la déchirure : les pauses de l'ouverture se terminent aussitôt.
  let passerDemande = false;
  let dechire = false; // booster déchiré : il y a quelque chose à annuler
  let reveilPasser: (() => void) | null = null;
  const pauseOuverture = (ms: number) =>
    passerDemande
      ? Promise.resolve()
      : Promise.race([pause(ms), new Promise<void>((r) => (reveilPasser = r))]);

  // ---------- Décor ----------
  racine.dataset.set = setVisuel;
  const fond = element("div", "ob-fond");
  fond.style.backgroundImage = `url(/ouverture/fond-${setVisuel}.jpg)`;
  const projecteurs = element("div", "ob-projecteurs");
  projecteurs.append(element("i"), element("i"));
  const ciel = element("canvas", "ob-ciel");
  const scene = element("main", "ob-scene");
  const zonePaquet = element("div", "ob-paquet-zone");
  const table = element("div", "ob-table");
  table.hidden = true;
  scene.append(zonePaquet, table);
  for (const el of [fond, projecteurs, ciel]) el.setAttribute("aria-hidden", "true");
  racine.append(fond, element("div", "ob-ambiance"), projecteurs, ciel, scene);

  let actionCourante: (() => void) | null = null;
  let cartes: CarteScene[] = [];
  let index = 0;

  // ---------- Particules (canvas) ----------
  const ctx = ciel.getContext("2d");
  let particules: Particule[] = [];
  let dpr = 1;
  let flash = 0;
  let couleurFlash = "#fff";
  let eclair: { pts: Array<[number, number]>; vie: number } | null = null;
  let prochainEclair = 0;
  let confettiJusqua = 0;
  let confettiCouleurs = ARC_EN_CIEL;
  const ecran: { type: "neant" | "cosmos" | null; alpha: number; cible: number } = { type: null, alpha: 0, cible: 0 };
  let image = 0;

  const redimensionner = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    ciel.width = innerWidth * dpr;
    ciel.height = innerHeight * dpr;
  };
  addEventListener("resize", redimensionner);
  redimensionner();

  function emettre(e: Emetteur) {
    const w = innerWidth;
    const h = innerHeight;
    const p: Particule = {
      x: Math.random() * w,
      y: h + 20,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(0.3 + Math.random() * 0.7),
      vie: 1,
      usure: 0.0025 + Math.random() * 0.003,
      taille: 1 + Math.random() * 2.5,
      couleur: hasard(e.couleurs),
      type: e.type,
      phase: Math.random() * 6.28,
      angle: Math.random() * 6.28,
    };
    if (e.type === "petale") Object.assign(p, { y: -10, vy: 0.5 + Math.random() * 0.7, vx: 0.4 + Math.random() * 0.6, taille: 3 + Math.random() * 3.5 });
    if (e.type === "etincelle") Object.assign(p, { y: Math.random() * h, vy: 0, vx: 0, usure: 0.012 });
    if (e.type === "eclat-acier") Object.assign(p, { y: Math.random() * h, vy: 0, vx: 0, usure: 0.03, taille: 6 + Math.random() * 10 });
    if (e.type === "spore") Object.assign(p, { vy: -(0.15 + Math.random() * 0.35), taille: 1.5 + Math.random() * 2 });
    if (e.type === "fumee") Object.assign(p, { y: h + 60, vy: -(0.2 + Math.random() * 0.35), taille: 40 + Math.random() * 70, usure: 0.0015 + Math.random() * 0.0015 });
    if (e.type === "braise") Object.assign(p, { vy: -(0.8 + Math.random() * 1.6), taille: 1 + Math.random() * 1.8, usure: 0.006 + Math.random() * 0.006 });
    particules.push(p);
  }

  function explosion(x: number, y: number, couleurs: string[], n = 90, force = 7) {
    for (let i = 0; i < (reduit ? 0 : n); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = force * (0.3 + Math.random());
      particules.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vie: 1,
        usure: 0.012 + Math.random() * 0.015,
        taille: 1.5 + Math.random() * 3,
        couleur: couleurs[i % couleurs.length] ?? "#fff",
        type: "eclat",
        phase: 0,
        angle: a,
      });
    }
  }

  function pieces(cx: number, cy: number, n: number) {
    for (let i = 0; i < (reduit ? 0 : n); i++) {
      particules.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 9, vy: -8 - Math.random() * 9, vie: 1, usure: 0.008, taille: 5 + Math.random() * 5, couleur: "#ffd45e", type: "piece", phase: Math.random() * 6, angle: 0 });
    }
  }

  function taches(cx: number, cy: number, n: number, couleurs: string[]) {
    for (let i = 0; i < (reduit ? 0 : n); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * Math.min(innerWidth, innerHeight) * 0.45;
      particules.push({ x: cx, y: cy, vx: Math.cos(a) * d * 0.09, vy: Math.sin(a) * d * 0.09, vie: 1, usure: 0.009 + Math.random() * 0.006, taille: 2, cible: 10 + Math.random() * 34, couleur: hasard(couleurs), type: "tache", phase: 0, angle: Math.random() * 6 });
    }
  }

  function vitesseLumiere(cx: number, cy: number, duree: number) {
    const fin = performance.now() + duree;
    const tic = () => {
      if (detruite || performance.now() > fin || reduit) return;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.6 + Math.random();
        particules.push({ x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vie: 1, usure: 0.012, taille: 1, couleur: hasard(["#ffffff", "#9feaff", "#d9b8ff"]), type: "etoile", phase: 0, angle: 0 });
      }
      requestAnimationFrame(tic);
    };
    tic();
  }

  function neant(cx: number, cy: number, n: number) {
    for (let i = 0; i < (reduit ? 0 : n); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.max(innerWidth, innerHeight) * (0.4 + Math.random() * 0.3);
      particules.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: 0, vy: 0, cx, cy, vie: 1, usure: 0.006, taille: 50 + Math.random() * 80, couleur: hasard(["#7a1fff", "#b04dff", "#3d0066"]), type: "vide", phase: 0, angle: 0 });
    }
  }

  function tracerEclair() {
    const pts: Array<[number, number]> = [[Math.random() * innerWidth, -10]];
    let dernier = pts[0]!;
    while (dernier[1] < innerHeight * (0.45 + Math.random() * 0.3)) {
      dernier = [dernier[0] + (Math.random() - 0.5) * 90, dernier[1] + 20 + Math.random() * 40];
      pts.push(dernier);
    }
    eclair = { pts, vie: 1 };
    couleurFlash = "#9fc8ff";
    flash = 0.12;
  }

  function boucle(t: number) {
    if (detruite || !ctx) return;
    if (!reduit && particules.length < 160) for (const e of ambiance.emetteurs) if (Math.random() < e.taux) emettre(e);
    if (!reduit && performance.now() < confettiJusqua) {
      for (let i = 0; i < 6; i++) {
        particules.push({ x: Math.random() * innerWidth, y: -12, vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 3, vie: 1, usure: 0.0045, taille: 6 + Math.random() * 7, couleur: hasard(confettiCouleurs), type: "confetti", phase: Math.random() * 6, angle: Math.random() * 6 });
      }
    }
    if (!reduit && ambiance.eclairs && t > prochainEclair) {
      tracerEclair();
      prochainEclair = t + 3500 + Math.random() * 5000;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ecran.alpha += (ecran.cible - ecran.alpha) * 0.07;
    if (ecran.type && ecran.alpha > 0.01) {
      const g = ctx.createRadialGradient(innerWidth / 2, innerHeight / 2, 0, innerWidth / 2, innerHeight / 2, Math.max(innerWidth, innerHeight) * 0.75);
      if (ecran.type === "cosmos") {
        g.addColorStop(0, "#2a1260");
        g.addColorStop(0.5, "#0b0526");
        g.addColorStop(1, "#010007");
      } else {
        g.addColorStop(0, "#3b0a52");
        g.addColorStop(0.55, "#12021c");
        g.addColorStop(1, "#000000");
      }
      ctx.globalAlpha = ecran.alpha;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = couleurFlash;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
      flash = Math.max(0, flash - 0.03);
    }
    if (eclair) {
      ctx.globalAlpha = eclair.vie;
      ctx.strokeStyle = "#cfe4ff";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#6fb6ff";
      ctx.beginPath();
      eclair.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.shadowBlur = 0;
      eclair.vie -= 0.06;
      if (eclair.vie <= 0) eclair = null;
    }
    ctx.globalCompositeOperation = "lighter";
    particules = particules.filter((p) => p.vie > 0);
    for (const p of particules) dessinerParticule(ctx, p);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    image = requestAnimationFrame(boucle);
  }

  function dessinerParticule(c: CanvasRenderingContext2D, p: Particule) {
    p.phase += 0.05;
    if (p.type === "eclat") {
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 0.06;
    }
    if (p.type === "spore" || p.type === "fumee") p.vx = Math.sin(p.phase * 0.5) * 0.4;
    if (p.type === "braise") p.vx += (Math.random() - 0.5) * 0.2;
    if (p.type === "confetti") {
      p.vy = Math.min(p.vy + 0.04, 4.5);
      p.vx += Math.sin(p.phase) * 0.06;
    }
    if (p.type === "piece") p.vy += 0.28;
    if (p.type === "tache") {
      p.taille += ((p.cible ?? p.taille) - p.taille) * 0.18;
      p.vx *= 0.9;
      p.vy *= 0.9;
    }
    if (p.type === "etoile") {
      p.vx *= 1.07;
      p.vy *= 1.07;
    }
    if (p.type === "vide") {
      p.vx += ((p.cx ?? p.x) - p.x) * 0.002;
      p.vy += ((p.cy ?? p.y) - p.y) * 0.002;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vie -= p.usure;
    p.angle += 0.03;
    let alpha = Math.min(1, p.vie * 1.5);
    if (p.type === "etincelle" || p.type === "eclat-acier") alpha = Math.sin(p.vie * Math.PI);
    if (p.type === "fumee") alpha = Math.sin(p.vie * Math.PI) * 0.09;
    c.globalAlpha = Math.max(0, alpha);
    c.fillStyle = p.couleur;
    c.strokeStyle = p.couleur;
    if (p.type === "petale") {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.angle);
      c.beginPath();
      c.ellipse(0, 0, p.taille, p.taille * 0.5, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    } else if (p.type === "etincelle" || p.type === "eclat-acier") {
      const t2 = p.type === "eclat-acier" ? p.taille : p.taille * 2.2;
      c.lineWidth = p.type === "eclat-acier" ? 1.5 : 1;
      c.beginPath();
      c.moveTo(p.x - t2, p.y);
      c.lineTo(p.x + t2, p.y);
      c.moveTo(p.x, p.y - t2 * 0.6);
      c.lineTo(p.x, p.y + t2 * 0.6);
      c.stroke();
    } else if (p.type === "piece") {
      c.globalCompositeOperation = "source-over";
      c.save();
      c.translate(p.x, p.y);
      c.scale(Math.max(0.15, Math.abs(Math.cos(p.phase * 3))), 1);
      c.beginPath();
      c.arc(0, 0, p.taille, 0, Math.PI * 2);
      c.fillStyle = "#ffd45e";
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = "#a8780c";
      c.stroke();
      c.restore();
      c.globalCompositeOperation = "lighter";
    } else if (p.type === "tache") {
      c.globalAlpha = Math.max(0, p.vie * 0.55);
      c.beginPath();
      c.arc(p.x, p.y, p.taille, 0, Math.PI * 2);
      c.fill();
      for (let k = 0; k < 4; k++) {
        const a = p.angle + k * 1.7;
        c.beginPath();
        c.arc(p.x + Math.cos(a) * p.taille * 1.35, p.y + Math.sin(a) * p.taille * 1.35, p.taille * 0.22, 0, Math.PI * 2);
        c.fill();
      }
    } else if (p.type === "etoile") {
      c.lineWidth = Math.min(3, 0.6 + Math.hypot(p.vx, p.vy) * 0.08);
      c.beginPath();
      c.moveTo(p.x - p.vx * 4, p.y - p.vy * 4);
      c.lineTo(p.x, p.y);
      c.stroke();
    } else if (p.type === "vide" || p.type === "fumee") {
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.taille);
      g.addColorStop(0, p.couleur);
      g.addColorStop(1, "transparent");
      if (p.type === "vide") c.globalAlpha = Math.max(0, Math.sin(p.vie * Math.PI) * 0.5);
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, p.taille, 0, Math.PI * 2);
      c.fill();
    } else if (p.type === "confetti") {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.angle * 4);
      c.scale(1, Math.sin(p.phase * 2));
      c.fillRect(-p.taille / 2, -p.taille / 4, p.taille, p.taille / 2);
      c.restore();
    } else {
      c.shadowBlur = 8;
      c.shadowColor = p.couleur;
      c.beginPath();
      c.arc(p.x, p.y, p.taille, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
    }
  }
  image = requestAnimationFrame(boucle);

  // ---------- Outils d'interface ----------
  function inclinaison(el: HTMLElement, e: PointerEvent, force = 22) {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ty", `${(x - 0.5) * force}deg`);
    el.style.setProperty("--tx", `${(0.5 - y) * force}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  }
  function remettre(el: HTMLElement) {
    el.style.setProperty("--tx", "0deg");
    el.style.setProperty("--ty", "0deg");
  }
  function secousse(duree: number) {
    scene.classList.remove("ob-secousse");
    void scene.offsetWidth;
    scene.style.setProperty("--duree", `${duree}s`);
    scene.classList.add("ob-secousse");
  }
  function vibrer(motif: number[]) {
    try {
      navigator.vibrate?.(motif);
    } catch {
      /* indisponible */
    }
  }
  function nettoyerEffets() {
    racine.querySelectorAll(".ob-titre-drop, .ob-signature, .ob-fissures, .ob-ombre-baron").forEach((t) => t.remove());
    intervalles.forEach((id) => clearInterval(id));
    intervalles.clear();
    confettiJusqua = 0;
    confettiCouleurs = ARC_EN_CIEL;
    ecran.cible = 0;
  }

  // ---------- Booster ----------
  let premiereIllustration = options.illustration;
  function afficherPaquet() {
    passerDemande = false;
    reveilPasser = null;
    dechire = false;
    arreterMusique();
    nettoyerEffets();
    actionCourante = null;
    table.hidden = true;
    table.replaceChildren();
    zonePaquet.hidden = false;
    const demandee = premiereIllustration;
    premiereIllustration = undefined;
    const numero =
      demandee && demandee >= 1 && demandee <= ambiance.boosters ? demandee : 1 + Math.floor(Math.random() * ambiance.boosters);
    const source = `/ouverture/booster-${setVisuel}-${numero}.webp`;
    const paquet = element("div", "ob-paquet");
    paquet.setAttribute("role", "button");
    paquet.tabIndex = 0;
    paquet.setAttribute("aria-label", `Booster ${options.nomSet} : touche ou glisse pour l'ouvrir`);
    const bas = element("img", "ob-bas");
    const haut = element("img", "ob-haut");
    for (const img of [bas, haut]) {
      img.alt = "";
      img.src = source;
      img.draggable = false;
    }
    const reflet = element("div", "ob-reflet");
    reflet.style.setProperty("mask-image", `url(${source})`);
    reflet.style.setProperty("-webkit-mask-image", `url(${source})`);
    const dechirure = element("div", "ob-dechirure");
    paquet.append(bas, haut, reflet, dechirure);
    const consigne = element("p", "ob-consigne");
    consigne.append(element("strong", "", "Touche"), " ou ", element("strong", "", "glisse"), " pour ouvrir", element("br"), "Clavier : ", element("strong", "", "Espace"), " ou ", element("strong", "", "Entrée"));
    zonePaquet.replaceChildren(element("div", "ob-sol"), paquet, consigne);
    brancherPaquet(paquet, dechirure, consigne);
  }

  function brancherPaquet(paquet: HTMLElement, dechirure: HTMLElement, consigne: HTMLElement) {
    let depart: { x: number; glisse: boolean } | null = null;
    let progres = 0;
    let ouvert = false;
    const ouvrir = () => {
      if (ouvert) return;
      ouvert = true;
      actionCourante = null;
      void ouvrirPaquet(paquet, dechirure, consigne);
    };
    actionCourante = ouvrir;
    paquet.addEventListener("pointermove", (e) => {
      if (ouvert) return;
      inclinaison(paquet, e);
      if (!depart) return;
      const r = paquet.getBoundingClientRect();
      const dx = e.clientX - depart.x;
      if (Math.abs(dx) > 10) depart.glisse = true;
      if (!depart.glisse) return;
      // Glissement horizontal n'importe où sur le booster : la déchirure suit le doigt le long du haut.
      progres = Math.max(progres, Math.abs(dx) / r.width);
      dechirure.style.left = dx < 0 ? "auto" : "0";
      dechirure.style.right = dx < 0 ? "0" : "auto";
      dechirure.style.width = `${Math.min(100, progres * 100)}%`;
      if (progres > 0.5) ouvrir();
    });
    paquet.addEventListener("pointerdown", (e) => {
      if (ouvert) return;
      paquet.setPointerCapture(e.pointerId);
      depart = { x: e.clientX, glisse: false };
      progres = 0;
    });
    paquet.addEventListener("pointerup", () => {
      if (!depart) return;
      const simpleClic = !depart.glisse;
      depart = null;
      if (simpleClic) ouvrir();
      else if (!ouvert) {
        dechirure.style.width = "0";
        remettre(paquet);
      }
    });
    paquet.addEventListener("pointercancel", () => {
      depart = null;
      if (!ouvert) {
        dechirure.style.width = "0";
        remettre(paquet);
      }
    });
    paquet.addEventListener("pointerleave", () => {
      if (!depart) remettre(paquet);
    });
  }

  async function ouvrirPaquet(paquet: HTMLElement, dechirure: HTMLElement, consigne: HTMLElement) {
    dechire = true;
    if (options.sansAnimation?.()) passerDemande = true;
    // Le serveur tire les cartes pendant que le booster se déchire.
    const reponse = options.ouvrir().then(
      (liste) => ({ ok: true as const, liste }),
      (e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : "Ouverture impossible." }),
    );
    const r = paquet.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * 0.07;
    jouerSon("dechire");
    dechirure.style.transition = "width 0.15s";
    dechirure.style.width = "100%";
    paquet.classList.add("ob-ouvert", "ob-tremble");
    // L'éclat d'ouverture garde les couleurs du set : il ne trahit pas le contenu.
    const style = getComputedStyle(racine);
    explosion(cx, cy, [style.getPropertyValue("--ob-accent").trim() || "#fff", style.getPropertyValue("--ob-halo").trim() || "#fff", "#ffffff"], 130, 8);
    couleurFlash = "#ffffff";
    flash = 0.25;
    await pauseOuverture(650);
    paquet.classList.remove("ob-tremble");
    paquet.classList.add("ob-part");
    consigne.style.opacity = "0";
    await pauseOuverture(450);
    // Réseau lent : on le dit plutôt que de laisser un écran vide.
    const attente = plusTard(() => {
      consigne.textContent = "Ouverture du booster…";
      consigne.style.opacity = "1";
    }, 300);
    const resultat = await reponse;
    clearTimeout(attente);
    if (detruite) return;
    if (!resultat.ok) {
      options.surErreur(resultat.message);
      afficherPaquet();
      return;
    }
    cartes = ordreRevelation(resultat.liste).map((carte) => ({ carte, cat: categorieRevelation(carte), theme: themeCarte(carte.code) }));
    index = 0;
    // Préchargement : la face est prête quand la carte se retourne.
    cartes.forEach(({ carte }) => {
      const img = new Image();
      img.src = urlImage(carte.image, 744);
    });
    zonePaquet.hidden = true;
    if (passerDemande) terminer();
    else afficherTable();
  }

  // ---------- Cartes ----------
  let compte: HTMLElement | null = null;
  let pile: HTMLElement | null = null;
  let boutonRares: HTMLButtonElement | null = null;

  /** Prochaine carte rare ou mieux après la carte courante, si la carte courante n'en est pas une. */
  function prochaineRare(): number {
    const courante = cartes[index];
    if (!courante || REVELATION[courante.cat].rang >= 2) return -1;
    return cartes.findIndex((cs, i) => i > index && REVELATION[cs.cat].rang >= 2);
  }

  function passerAuxRares() {
    const cible = prochaineRare();
    if (cible < 0 || !pile) return;
    tour++;
    nettoyerEffets();
    pile.replaceChildren();
    index = cible;
    carteSuivante();
  }

  function afficherTable() {
    table.hidden = false;
    pile = element("div", "ob-pile");
    compte = element("span");
    const tout = element("button", "ob-bouton-second", "Tout révéler");
    tout.type = "button";
    tout.addEventListener("click", terminer);
    boutonRares = element("button", "ob-bouton-second", "Passer aux rares");
    boutonRares.type = "button";
    boutonRares.addEventListener("click", passerAuxRares);
    const barre = element("div", "ob-compteur");
    barre.append(compte, boutonRares, tout);
    table.replaceChildren(pile, barre);
    carteSuivante();
  }

  function elementCarte(cs: CarteScene) {
    const place = element("div", "ob-emplacement");
    place.style.setProperty("--c", REVELATION[cs.cat].couleur);
    const carte = element("div", "ob-carte");
    carte.tabIndex = 0;
    carte.setAttribute("role", "button");
    carte.setAttribute("aria-label", "Retourner la carte");
    const dos = element("div", "ob-dos");
    dos.innerHTML = dosDeCarte(cs.cat === "rune"); // SVG fixe, sans donnée de carte
    const face = element("div", "ob-face");
    const img = element("img");
    const sources = [urlImage(cs.carte.image, 744), cs.carte.image];
    let essai = 0;
    img.alt = cs.carte.nom;
    img.decoding = "async";
    img.src = sources[0]!;
    img.addEventListener("error", () => {
      if (essai < sources.length - 1) img.src = sources[++essai]!;
    });
    if (cs.carte.orientation === "paysage") img.classList.add("ob-paysage");
    face.append(img);
    carte.append(dos, face);
    place.append(element("div", "ob-rayons"), element("div", "ob-aura"), carte, element("div", "ob-indication"), element("div", "ob-bandeau-rarete"));
    return { place, carte };
  }

  function carteSuivante() {
    const cs = cartes[index];
    if (!cs || !pile || !compte) return terminer();
    compte.textContent = `Carte ${index + 1} / ${cartes.length}`;
    if (boutonRares) boutonRares.hidden = prochaineRare() < 0;
    const monTour = tour;
    const rang = REVELATION[cs.cat].rang;
    const { place, carte } = elementCarte(cs);
    const indication = place.querySelector<HTMLElement>(".ob-indication")!;
    // Rare ou mieux : même néon arc-en-ciel pour toutes, impossible de savoir laquelle avant de la retourner.
    if (rang >= 2) {
      place.classList.add("ob-neon");
      indication.textContent = "Carte rare ou mieux…";
    } else indication.textContent = cs.carte.foil ? "Emplacement foil" : "";
    place.style.translate = "0 40px";
    place.style.opacity = "0";
    pile.append(place);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        place.style.translate = "0 0";
        place.style.opacity = "1";
      }),
    );
    if (rang >= 2) jouerSon("neon");
    let etape: "cachee" | "occupee" | "visible" = "cachee";
    const action = async () => {
      if (etape === "occupee") return;
      if (etape === "cachee") {
        etape = "occupee";
        await retourner(place, carte, cs);
        etape = "visible";
        return;
      }
      etape = "occupee";
      await ranger(place);
      if (monTour !== tour) return; // cartes sautées entre-temps
      index++;
      carteSuivante();
    };
    carte.addEventListener("click", () => void action());
    actionCourante = () => void action();
    carte.addEventListener("pointermove", (e) => {
      if (carte.classList.contains("ob-retournee")) inclinaison(carte, e, 14);
    });
    carte.addEventListener("pointerleave", () => remettre(carte));
    // Une fois retournée, la carte suit le doigt ou la souris sans traîner.
    carte.addEventListener("transitionend", (e) => {
      if (e.target === carte && carte.classList.contains("ob-retournee")) carte.classList.add("ob-posee");
    });
  }

  function centre(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  async function retourner(place: HTMLElement, carte: HTMLElement, cs: CarteScene) {
    const info = REVELATION[cs.cat];
    const { cx, cy } = centre(carte);
    place.querySelector<HTMLElement>(".ob-indication")!.style.opacity = "0";
    if (info.rang >= 2) await pause(500); // même suspense pour toutes les rares : la durée ne trahit rien
    if (info.rang >= 4) return miseEnScene(place, carte, cs, cx, cy);
    carte.classList.add("ob-retournee");
    place.classList.remove("ob-neon");
    jouerSon(info.rang === 3 ? "epic" : info.rang === 2 ? "rare" : "retourne");
    await pause(info.rang >= 2 ? 650 : 350);
    if (cs.carte.foil) place.classList.add("ob-foil-revele");
    if (info.rang >= 2) {
      place.classList.add("ob-lueur");
      explosion(cx, cy, [info.couleur, "#ffffff"], info.rang === 3 ? 170 : 70, info.rang === 3 ? 9 : 7);
      if (info.rang === 3) {
        onde(place, 2);
        secousse(0.35);
        jouerSon("boum");
        couleurFlash = info.couleur;
        flash = 0.2;
      }
    }
    if (info.rang >= 2 || cs.carte.foil) bandeau(place, cs);
  }

  function bandeau(place: HTMLElement, cs: CarteScene) {
    const b = place.querySelector<HTMLElement>(".ob-bandeau-rarete")!;
    b.textContent = (cs.carte.foil ? "Foil · " : "") + REVELATION[cs.cat].nom;
    b.classList.add("ob-visible");
  }

  function onde(place: HTMLElement, n: number) {
    for (let i = 0; i < n; i++) {
      const o = element("div", "ob-onde");
      o.style.animationDelay = `${i * 140}ms`;
      place.append(o);
      plusTard(() => o.remove(), 1400 + i * 140);
    }
  }

  function titreDrop(cs: CarteScene, opts: { compteur?: boolean; glitch?: boolean } = {}) {
    const info = REVELATION[cs.cat];
    const titre = element("div", "ob-titre-drop" + (opts.glitch ? " ob-glitch" : ""), info.court ?? info.nom);
    titre.style.setProperty("--c", info.couleur);
    titre.append(element("small", "", cs.carte.nom));
    const numeros = numerosCarte(cs.carte.code);
    if (opts.compteur && numeros) {
      // Overnumbered : le numéro dépasse le total du set (« 238 / 219 ») en défilant.
      const zone = element("span", "ob-compteur-num", `${numeros.total} / ${numeros.total}`);
      titre.append(zone);
      let n = numeros.total;
      const id = window.setInterval(
        () => {
          n++;
          zone.textContent = `${n} / ${numeros.total}`;
          if (n >= numeros.numero) {
            clearInterval(id);
            intervalles.delete(id);
          }
        },
        Math.max(25, 900 / Math.max(1, numeros.numero - numeros.total)),
      );
      intervalles.add(id);
    }
    if (cs.theme) titre.append(element("em", `ob-theme ob-theme-${cs.theme}`, THEMES[cs.theme].nom));
    table.append(titre);
  }

  /** Ultime : fissures violettes qui partent de derrière la carte. */
  function fissures(cx: number, cy: number) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ob-fissures");
    table.prepend(svg); // derrière la pile
    const r = svg.getBoundingClientRect();
    let d = "";
    for (let k = 0; k < 9; k++) {
      let a = (k / 9) * Math.PI * 2 + Math.random() * 0.4;
      let x = cx - r.left;
      let y = cy - r.top;
      d += `M${x.toFixed(0)} ${y.toFixed(0)} `;
      for (let i = 0; i < 8; i++) {
        a += (Math.random() - 0.5) * 0.9;
        const l = 45 + Math.random() * 70;
        x += Math.cos(a) * l;
        y += Math.sin(a) * l;
        d += `L${x.toFixed(0)} ${y.toFixed(0)} `;
      }
    }
    const chemin = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chemin.setAttribute("d", d);
    svg.append(chemin);
  }

  /** Ultime : l'ombre du Baron traverse l'écran avant la révélation. */
  function ombreBaron() {
    if (reduit) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ob-ombre-baron");
    svg.setAttribute("viewBox", "0 0 1000 420");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = SILHOUETTE_BARON; // forme fixe
    racine.append(svg);
    plusTard(() => svg.remove(), 2400);
  }

  function signature() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ob-signature");
    svg.setAttribute("viewBox", "0 0 320 110");
    svg.innerHTML = SIGNATURE; // tracé fixe
    table.append(svg);
  }

  /** Une mise en scène par rareté (Alt Art, Overnumbered, Signée, Special, Ultime). */
  async function miseEnScene(place: HTMLElement, carte: HTMLElement, cs: CarteScene, cx: number, cy: number) {
    const type = cs.cat;
    const couleur = REVELATION[type].couleur;
    // 1. Tension : le néon s'emballe, avec une ambiance propre à chaque rareté.
    place.classList.add("ob-surcharge");
    if (type === "signee") {
      for (let i = 0; i < 3; i++) {
        jouerSon("coeur");
        secousse(0.18);
        await pause(620);
      }
    } else if (type === "ultime") {
      // Le néant monte, puis l'ombre du Baron passe au-dessus de la carte avant qu'elle ne se retourne.
      jouerSon("neant");
      ecran.type = "neant";
      ecran.cible = 0.85;
      neant(cx, cy, 26);
      secousse(1.5);
      await pause(700);
      ombreBaron();
      await pause(1100);
      secousse(0.6);
      jouerSon("coeur");
      await pause(1250);
    } else if (type === "special") {
      jouerSon("cosmos");
      ecran.type = "cosmos";
      ecran.cible = 0.94;
      vitesseLumiere(cx, cy, 1700);
      await pause(1500);
    } else {
      jouerSon("monte");
      await pause(type === "alt" ? 800 : 1100);
    }
    place.classList.remove("ob-surcharge", "ob-neon");
    const rayons = place.querySelector<HTMLElement>(".ob-rayons")!;

    // 2. Révélation.
    if (type === "alt") {
      // Alt Art : une toile qui éclate — taches de peinture pastel, pétales, rotation douce.
      couleurFlash = "#ffd1f4";
      flash = 0.55;
      jouerSon("harpe");
      carte.classList.add("ob-tour-et-demi", "ob-retournee");
      place.classList.add("ob-geante");
      taches(cx, cy, 34, ["#ff8fd8", "#c07cff", "#7fd8ff", "#ffd36b", "#8dffc4"]);
      for (let i = 0; i < 50; i++) emettre({ type: "petale", couleurs: ["#ffc2e8", "#e0b8ff", "#ffffff"], taux: 0 });
      rayons.classList.add("ob-visibles");
      titreDrop(cs);
      await pause(550);
      taches(cx, cy, 18, ["#ff8fd8", "#c07cff", "#7fd8ff"]);
    } else if (type === "over") {
      // Overnumbered : la ruée vers l'or — secousse, tourbillon, ondes de choc, pièces, numéro qui dépasse le total.
      couleurFlash = "#ffffff";
      flash = 0.95;
      secousse(0.75);
      jouerSon("boum");
      jouerSon("legendaire");
      vibrer([90, 50, 180]);
      carte.classList.add("ob-spectaculaire", "ob-retournee");
      place.classList.add("ob-geante");
      explosion(cx, cy, [couleur, "#ffffff", "#ffb13d"], 260, 14);
      onde(place, 4);
      pieces(cx, cy, 70);
      rayons.classList.add("ob-visibles", "ob-rapides");
      await pause(380);
      couleurFlash = couleur;
      flash = 0.45;
      confettiCouleurs = ["#ffd45e", "#ffb13d", "#fff4c2", "#ffffff"];
      confettiJusqua = performance.now() + 3000;
      titreDrop(cs, { compteur: true });
      await pause(450);
      pieces(cx, cy, 40);
      explosion(cx, cy - 90, [couleur, "#ffffff"], 120, 9);
    } else if (type === "signee") {
      // Signée : un pilier de lumière descend, la carte tourne au ralenti, puis l'artiste signe à l'écran.
      place.append(element("div", "ob-pilier"));
      await pause(450);
      couleurFlash = "#fff6d8";
      flash = 0.9;
      jouerSon("boum");
      jouerSon("legendaire");
      secousse(0.5);
      carte.classList.add("ob-lente", "ob-retournee");
      place.classList.add("ob-geante");
      explosion(cx, cy, ["#fff1b8", "#ffd45e", "#ffffff"], 220, 11);
      onde(place, 3);
      rayons.classList.add("ob-visibles");
      confettiCouleurs = ["#fff4c2", "#ffd45e", "#ffffff"];
      confettiJusqua = performance.now() + 4500;
      titreDrop(cs, { compteur: true });
      await pause(1100);
      signature();
      pieces(cx, cy, 50);
      await pause(900);
      explosion(cx, cy, ["#ffffff", "#ffd45e"], 140, 10);
    } else if (type === "special") {
      // Special : saut dans le cosmos — vitesse lumière, puis explosion arc-en-ciel au milieu des étoiles.
      couleurFlash = "#bff8ff";
      flash = 0.75;
      jouerSon("legendaire");
      jouerSon("boum");
      carte.classList.add("ob-spectaculaire", "ob-retournee");
      place.classList.add("ob-geante");
      explosion(cx, cy, ["#5ff2ff", "#ff5fd2", "#ffffff", ...ARC_EN_CIEL], 300, 15);
      onde(place, 3);
      rayons.classList.add("ob-visibles", "ob-rapides");
      ecran.cible = 0.6;
      vitesseLumiere(cx, cy, 2500);
      titreDrop(cs);
      await pause(600);
      explosion(cx, cy, ARC_EN_CIEL, 160, 10);
    } else if (type === "ultime") {
      // Ultime : le néant — l'écran se fissure derrière la carte, choc lourd, la carte s'écrase, titre qui grésille.
      fissures(cx, cy);
      couleurFlash = "#b04dff";
      flash = 0.85;
      jouerSon("boum");
      plusTard(() => jouerSon("boum"), 180);
      jouerSon("legendaire");
      secousse(1);
      vibrer([200, 60, 300]);
      carte.classList.add("ob-ultime-flip", "ob-retournee");
      place.classList.add("ob-impact", "ob-geante");
      explosion(cx, cy, ["#b04dff", "#ff3df2", "#ffffff", "#3d0066"], 320, 16);
      onde(place, 5);
      neant(cx, cy, 14);
      rayons.classList.add("ob-visibles", "ob-rapides");
      ecran.cible = 0.6;
      titreDrop(cs, { glitch: true });
      await pause(700);
      explosion(cx, cy, ["#b04dff", "#ffffff"], 160, 11);
    }
    await pause(250);
    if (cs.carte.foil) place.classList.add("ob-foil-revele");
    place.classList.add("ob-lueur");
    bandeau(place, cs);
    if (cs.theme) {
      confettiCouleurs = THEMES[cs.theme].couleurs;
      confettiJusqua = performance.now() + 7000;
      if (!jouerTheme(cs.theme)) options.surAvis(`Active le son pour entendre le thème ${THEMES[cs.theme].nom}`);
    }
  }

  async function ranger(place: HTMLElement) {
    nettoyerEffets();
    place.classList.add("ob-sort-gauche");
    await pause(280);
    place.remove();
  }

  function terminer() {
    if (cartes.length === 0) return;
    nettoyerEffets();
    actionCourante = null;
    table.hidden = true;
    table.replaceChildren();
    pile = null;
    compte = null;
    boutonRares = null;
    tour++;
    options.surTerminee(cartes.map((cs) => cs.carte));
  }

  // ---------- Clavier : Espace ou Entrée fait avancer (ouvrir, retourner, carte suivante). ----------
  const surTouche = (e: KeyboardEvent) => {
    if (e.key !== " " && e.key !== "Enter") return;
    // Un bouton ou un champ garde son rôle ; une fiche ouverte par-dessus aussi.
    if (e.target instanceof Element && e.target.closest("button, select, a, input, .fond-modale")) return;
    if (!actionCourante) return;
    e.preventDefault();
    if (!e.repeat) actionCourante();
  };
  addEventListener("keydown", surTouche);

  afficherPaquet();

  return {
    recommencer: (illustration?: number) => {
      premiereIllustration = illustration;
      cartes = [];
      afficherPaquet();
    },
    passer: () => {
      if (cartes.length > 0) {
        arreterMusique();
        terminer();
        return;
      }
      if (!dechire) return; // booster encore scellé : rien à annuler
      // Booster déchiré, cartes pas encore reçues : on ira au récapitulatif dès la réponse du serveur.
      passerDemande = true;
      reveilPasser?.();
    },
    detruire: () => {
      detruite = true;
      cancelAnimationFrame(image);
      minuteurs.forEach((id) => clearTimeout(id));
      intervalles.forEach((id) => clearInterval(id));
      removeEventListener("resize", redimensionner);
      removeEventListener("keydown", surTouche);
      arreterMusique();
      racine.replaceChildren();
    },
  };
}
