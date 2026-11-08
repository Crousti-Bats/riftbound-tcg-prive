# Politique de sécurité

## Signaler une vulnérabilité

Ne pas ouvrir d'issue publique. Utiliser **Security → Report a vulnerability** sur GitHub (signalement privé).

## Mesures en place

| Domaine | Mesure |
|---|---|
| Code | CodeQL (`security-extended`) à chaque PR, à chaque push sur `main` et chaque semaine |
| Secrets | Gitleaks en CI, secret scanning et push protection GitHub. Aucun secret dans le dépôt : ils vont dans GitHub Secrets ou dans `wrangler secret` |
| Dépendances | Versions exactes et lockfile, `npm audit` bloquant, dependency review sur les PR, Dependabot hebdomadaire |
| CI | Actions épinglées par SHA, `permissions` minimales, `persist-credentials: false` |
| Branche | `main` protégée : PR obligatoire et CI verte avant de merger |
| Application | En-têtes de sécurité (CSP stricte, HSTS, X-Frame-Options DENY), erreurs internes jamais renvoyées au client |
| Authentification | Inscription uniquement sur invitation, mots de passe PBKDF2-SHA256, cookie `__Host-session` (HttpOnly, Secure, SameSite=Strict) dont seule l'empreinte est stockée, limitation des tentatives, mêmes réponses pour un pseudo inconnu ou un mauvais mot de passe |
| Requêtes | Contrôle de l'en-tête `Origin` (CSRF), validation Zod stricte, corps limité à 16 Ko, SQL uniquement préparé (règle ESLint bloquante et testée) |
| Admin | Rôle vérifié côté serveur, re-saisie du mot de passe (15 minutes), création d'admin uniquement en ligne de commande, journal de toutes les actions |
| À venir | Aléatoire côté serveur pour les boosters (étape 5), Cloudflare Access sur /admin (étape 10) |
