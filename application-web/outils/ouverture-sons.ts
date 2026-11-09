/** Sons de l'ouverture, tous synthétisés par le navigateur (aucun fichier audio). Coupés par défaut.
 *  Les deux jingles « K/DA » et « HEARTSTEEL » sont des compositions originales dans le style, pas les vrais morceaux. */
import type { Theme } from "./ouverture-revelation";

export type Son =
  | "dechire"
  | "monte"
  | "boum"
  | "coeur"
  | "harpe"
  | "cosmos"
  | "neant"
  | "retourne"
  | "neon"
  | "rare"
  | "epic"
  | "legendaire";

const CLE_PREFERENCE = "ouverture-son";
let actif = lirePreference();
let audio: AudioContext | null = null;
let musique: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null;

function lirePreference(): boolean {
  try {
    return localStorage.getItem(CLE_PREFERENCE) === "1";
  } catch {
    return false;
  }
}

export function sonActif(): boolean {
  return actif;
}

/** Appelé depuis un clic : le navigateur n'autorise l'audio qu'après un geste de l'utilisateur. */
export function definirSon(valeur: boolean): void {
  actif = valeur;
  try {
    localStorage.setItem(CLE_PREFERENCE, valeur ? "1" : "0");
  } catch {
    /* stockage indisponible : la préférence ne sera pas retenue */
  }
  if (valeur) {
    audio ??= new AudioContext();
    void audio.resume();
    jouerSon("retourne");
  } else {
    arreterMusique();
  }
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function jouerSon(type: Son): void {
  if (!actif) return;
  audio ??= new AudioContext();
  const a = audio;
  const t = a.currentTime;
  const sortie = a.createGain();
  sortie.connect(a.destination);

  if (type === "dechire") {
    const tampon = a.createBuffer(1, a.sampleRate * 0.5, a.sampleRate);
    const d = tampon.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = a.createBufferSource();
    const filtre = a.createBiquadFilter();
    filtre.type = "bandpass";
    filtre.frequency.setValueAtTime(900, t);
    filtre.frequency.exponentialRampToValueAtTime(3500, t + 0.4);
    src.buffer = tampon;
    src.connect(filtre).connect(sortie);
    sortie.gain.value = 0.5;
    src.start(t);
    return;
  }
  if (type === "monte") {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 1.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.12);
    o.connect(g).connect(sortie);
    o.start(t);
    o.stop(t + 1.15);
    return;
  }
  if (type === "boum") {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.6);
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g).connect(sortie);
    o.start(t);
    o.stop(t + 0.95);
    return;
  }
  if (type === "coeur") {
    [0, 0.22].forEach((decalage, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.frequency.setValueAtTime(90, t + decalage);
      o.frequency.exponentialRampToValueAtTime(40, t + decalage + 0.15);
      g.gain.setValueAtTime(i ? 0.35 : 0.5, t + decalage);
      g.gain.exponentialRampToValueAtTime(0.001, t + decalage + 0.2);
      o.connect(g).connect(sortie);
      o.start(t + decalage);
      o.stop(t + decalage + 0.22);
    });
    return;
  }
  if (type === "harpe" || type === "cosmos") {
    const harpe = type === "harpe";
    const gamme = harpe ? [60, 64, 67, 71, 72, 76, 79, 83, 84] : [72, 79, 84, 88, 91, 96];
    gamme.forEach((m, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      const debut = t + i * (harpe ? 0.06 : 0.18);
      o.type = harpe ? "triangle" : "sine";
      o.frequency.value = hz(m);
      g.gain.setValueAtTime(0.0001, debut);
      g.gain.exponentialRampToValueAtTime(0.12, debut + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, debut + (harpe ? 1.2 : 1.6));
      o.connect(g).connect(sortie);
      o.start(debut);
      o.stop(debut + 1.7);
    });
    return;
  }
  if (type === "neant") {
    const o = a.createOscillator();
    const lfo = a.createOscillator();
    const profondeur = a.createGain();
    const g = a.createGain();
    const f = a.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.value = 46;
    lfo.frequency.value = 7;
    profondeur.gain.value = 18;
    f.type = "lowpass";
    f.frequency.value = 380;
    lfo.connect(profondeur).connect(o.frequency);
    o.connect(f).connect(g).connect(sortie);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.65);
    lfo.stop(t + 1.65);
    return;
  }
  const notes: Partial<Record<Son, number[]>> = {
    retourne: [660],
    neon: [330, 415],
    rare: [523, 659, 784],
    epic: [523, 659, 784, 1046],
    legendaire: [392, 523, 659, 784, 1046, 1318],
  };
  const simple = type === "retourne";
  (notes[type] ?? [440]).forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = simple ? "triangle" : "sine";
    o.frequency.value = f;
    const debut = t + i * (simple ? 0 : 0.09);
    const duree = simple ? 0.08 : 0.9;
    g.gain.setValueAtTime(0, debut);
    g.gain.linearRampToValueAtTime(simple ? 0.12 : 0.15, debut + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, debut + duree);
    o.connect(g).connect(sortie);
    o.start(debut);
    o.stop(debut + duree + 0.05);
  });
}

export function arreterMusique(): void {
  if (!musique || !audio) return;
  const m = musique;
  musique = null;
  m.gain.gain.setTargetAtTime(0.0001, audio.currentTime, 0.15);
  setTimeout(
    () =>
      m.sources.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* déjà arrêté */
        }
      }),
    700,
  );
}

/** Joue le jingle du thème. Renvoie false si le son est coupé (l'appelant peut le signaler). */
export function jouerTheme(nom: Theme): boolean {
  if (!actif) return false;
  audio ??= new AudioContext();
  const a = audio;
  arreterMusique();
  const sortie = a.createGain();
  sortie.gain.value = 0.3;
  sortie.connect(a.destination);
  const sources: AudioScheduledSourceNode[] = [];
  musique = { gain: sortie, sources };
  const t0 = a.currentTime + 0.05;
  const temps = 60 / (nom === "kda" ? 112 : 132);
  const croche = temps / 2;
  const doubleCroche = temps / 4;
  const sature = new Float32Array(1024).map((_, i) => Math.tanh((i / 512 - 1) * 5));

  const note = (forme: OscillatorType, m: number, debut: number, duree: number, vol: number, coupure?: number, distorsion = false) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = forme;
    o.frequency.value = hz(m);
    let noeud: AudioNode = o;
    if (distorsion) {
      const w = a.createWaveShaper();
      w.curve = sature;
      noeud.connect(w);
      noeud = w;
    }
    if (coupure) {
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = coupure;
      noeud.connect(f);
      noeud = f;
    }
    noeud.connect(g);
    g.connect(sortie);
    g.gain.setValueAtTime(0.0001, debut);
    g.gain.exponentialRampToValueAtTime(vol, debut + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
    o.start(debut);
    o.stop(debut + duree + 0.05);
    sources.push(o);
  };
  const bruit = (debut: number, duree: number, vol: number, type: BiquadFilterType, freq: number) => {
    const b = a.createBuffer(1, Math.ceil(a.sampleRate * duree), a.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = a.createBufferSource();
    const f = a.createBiquadFilter();
    const g = a.createGain();
    src.buffer = b;
    f.type = type;
    f.frequency.value = freq;
    g.gain.value = vol;
    src.connect(f).connect(g).connect(sortie);
    src.start(debut);
    sources.push(src);
  };
  const grosseCaisse = (d: number) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.frequency.setValueAtTime(150, d);
    o.frequency.exponentialRampToValueAtTime(45, d + 0.18);
    g.gain.setValueAtTime(0.9, d);
    g.gain.exponentialRampToValueAtTime(0.001, d + 0.3);
    o.connect(g).connect(sortie);
    o.start(d);
    o.stop(d + 0.32);
    sources.push(o);
  };

  if (nom === "kda") {
    // Synth-pop sombre en la mineur : la – fa – do – sol, quatre temps au sol, clap sur 2 et 4, arpèges.
    const accords = [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ];
    const melodie = [69, 72, 76, 72, 74, 72, 69, 67, 65, 69, 72, 69, 74, 72, 69, 65, 64, 67, 72, 67, 76, 74, 72, 67, 67, 71, 74, 71, 79, 77, 76, 74];
    for (let tour = 0; tour < 2; tour++) {
      for (let mesure = 0; mesure < 4; mesure++) {
        const accord = accords[mesure] ?? [57, 60, 64];
        for (let tps = 0; tps < 4; tps++) {
          const d = t0 + ((tour * 4 + mesure) * 4 + tps) * temps;
          grosseCaisse(d);
          if (tps % 2) bruit(d, 0.18, 0.5, "bandpass", 1500);
          bruit(d + croche, 0.05, 0.18, "highpass", 8000);
          note("sawtooth", (accord[0] ?? 57) - 12, d, temps * 0.9, 0.2, 500);
          for (let k = 0; k < 4; k++) note("square", (accord[k % 3] ?? 57) + 12, d + k * doubleCroche, doubleCroche * 0.85, 0.035, 3200);
          if (tour === 1) {
            for (let k = 0; k < 2; k++) {
              const m = melodie[mesure * 8 + tps * 2 + k] ?? 69;
              note("sawtooth", m, d + k * croche, croche * 0.95, 0.07, 2600);
              note("sawtooth", m + 0.1, d + k * croche, croche * 0.95, 0.05, 2600);
            }
          }
        }
      }
    }
    const fin = t0 + 32 * temps;
    [57, 60, 64, 69].forEach((m) => note("sawtooth", m, fin, 1.6, 0.06, 1800));
    sortie.gain.setValueAtTime(0.3, fin + 1.2);
    sortie.gain.exponentialRampToValueAtTime(0.0001, fin + 2);
  } else {
    // Pop-rock « boys band » en mi : mi – do – sol – ré, guitares saturées en croches, refrain à la guitare solo.
    const fondamentales = [40, 36, 43, 38];
    const melodie = [64, 64, 67, 69, 71, 71, 69, 67, 67, 67, 64, 67, 69, 67, 64, 62, 62, 62, 67, 71, 74, 74, 71, 69, 69, 71, 69, 67, 66, 67, 69, 71];
    for (let tour = 0; tour < 2; tour++) {
      for (let mesure = 0; mesure < 4; mesure++) {
        const f = fondamentales[mesure] ?? 40;
        for (let tps = 0; tps < 4; tps++) {
          const d = t0 + ((tour * 4 + mesure) * 4 + tps) * temps;
          if (tps === 0 || tps === 2) grosseCaisse(d);
          if (tps === 2) grosseCaisse(d + croche);
          if (tps % 2) bruit(d, 0.22, 0.55, "bandpass", 1900);
          for (let k = 0; k < 2; k++) {
            const dd = d + k * croche;
            bruit(dd, 0.04, 0.15, "highpass", 7500);
            note("sawtooth", f, dd, croche * 0.9, 0.09, 2400, true);
            note("sawtooth", f + 7, dd, croche * 0.9, 0.07, 2400, true);
            if (tour === 1) note("sawtooth", melodie[mesure * 8 + tps * 2 + k] ?? 64, dd, croche * 0.95, 0.06, 3600, true);
          }
        }
      }
    }
    const fin = t0 + 32 * temps;
    [40, 47, 52].forEach((m) => note("sawtooth", m, fin, 1.8, 0.09, 2200, true));
    sortie.gain.setValueAtTime(0.3, fin + 1.2);
    sortie.gain.exponentialRampToValueAtTime(0.0001, fin + 2);
  }
  return true;
}
