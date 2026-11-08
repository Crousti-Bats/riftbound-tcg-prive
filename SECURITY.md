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
| À venir | Mots de passe PBKDF2, cookies `HttpOnly; Secure; SameSite=Strict`, rate limiting, validation Zod, SQL paramétré, aléatoire côté serveur |
