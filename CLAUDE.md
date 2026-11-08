# Riftbound TCG privé — instructions pour l'assistant

- Avant toute action, lire `docs/PROMPT_INITIAL.md` (besoin d'origine) et `docs/ETAT_PROJET.md` (décisions, étape en cours, feuille de route). Ces deux fichiers font foi.
- On avance une étape à la fois. À la fin de chaque étape :
  1. mettre à jour `docs/ETAT_PROJET.md` (statut, journal, prochaine étape, actions manuelles) ;
  2. générer le rapport : `python tools/generate_report.py <N> "<titre>"` (dépendance : `pip install reportlab`) ;
  3. committer sur une branche et ouvrir une PR (DevSecOps : CI verte avant de merger sur `main`).
- Langue : français pour les documents et les échanges.
- Sécurité : aucun secret dans le dépôt, requêtes SQL paramétrées, tirages aléatoires uniquement côté serveur.
- Les données de cartes ne sont jamais stockées en base. Seuls les `cardCode` et les quantités le sont.
