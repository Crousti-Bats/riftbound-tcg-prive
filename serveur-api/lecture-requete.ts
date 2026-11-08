/** Lecture sûre du corps JSON d'une requête, validé par un schéma Zod. */
import type { Context } from "hono";
import type { z } from "zod";

export type ResultatLecture<T> = { ok: true; donnees: T } | { ok: false; reponse: Response };

export async function lireCorps<S extends z.ZodType>(c: Context, schema: S): Promise<ResultatLecture<z.infer<S>>> {
  let brut: unknown;
  try {
    brut = await c.req.json();
  } catch {
    return { ok: false, reponse: c.json({ erreur: "json_invalide" }, 400) };
  }
  const resultat = schema.safeParse(brut);
  if (!resultat.success) {
    const champs = resultat.error.issues.map((i) => ({ champ: i.path.join("."), message: i.message }));
    return { ok: false, reponse: c.json({ erreur: "donnees_invalides", champs }, 400) };
  }
  return { ok: true, donnees: resultat.data };
}
