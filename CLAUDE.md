# Riftbound TCG privé — instructions pour l'assistant

- Avant toute action, lire `documentation/demande-initiale.md` (besoin d'origine) et `documentation/etat-du-projet.md` (décisions, étape en cours, feuille de route). Ces deux fichiers font foi.
- On avance une étape à la fois. À la fin de chaque étape :
  1. mettre à jour `documentation/etat-du-projet.md` (statut, journal, prochaine étape, actions manuelles) ;
  2. générer le rapport : `python outils/generer-rapport-pdf.py <N> "<titre>"` (dépendance : `pip install reportlab`) ;
  3. committer sur une branche et ouvrir une PR (DevSecOps : CI verte avant de merger sur `main`).
- Langue : français pour les documents et les échanges.
- Sécurité : aucun secret dans le dépôt, requêtes SQL paramétrées, tirages aléatoires uniquement côté serveur.
- Les données de cartes ne sont jamais stockées en base. Seuls les `cardCode` et les quantités le sont.
