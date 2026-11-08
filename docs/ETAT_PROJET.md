# Riftbound TCG privé — État du projet

Ce fichier est la source de vérité pour reprendre le projet. Le rapport PDF de chaque étape est généré depuis ce fichier et depuis `docs/PROMPT_INITIAL.md`.

**Dernière mise à jour :** 2026-11-08
**Étape en cours :** 0 — Cadrage et architecture (terminée côté code, il reste les actions manuelles)
**Prochaine étape :** 1 — Installer les outils, créer le dépôt GitHub et la pipeline CI de sécurité

## 1. Objectif

Un site privé de collection et d'échange de cartes Riftbound, accessible uniquement avec un compte et un mot de passe, hébergé gratuitement sur Cloudflare.

- Ouvrir des boosters en choisissant le set (Origins, Spiritforged, Unleashed, Vendetta, Radiance).
- Composition des boosters et taux de drop alignés sur le vrai jeu.
- Recevoir 1 booster toutes les 10 minutes, avec un stock de 15 au maximum.
- Échanger des cartes entre joueurs.
- Site responsive (téléphone, tablette, PC) et installable comme application (PWA).

## 2. Décisions d'architecture

| Sujet | Décision | Raison |
|---|---|---|
| Hébergement | Un seul Cloudflare Worker qui sert le front (Static Assets) et l'API | Offre gratuite, un seul déploiement, aucun CORS |
| Base de données | Cloudflare D1 (SQLite), offre gratuite | Demandé. Limites : 5 Go, 5 M lectures/jour, 100 k écritures/jour |
| Données des cartes | `cards.json` de la dernière release de LouisCourrian/riftbound-cards, récupéré par le Worker et mis en cache (Cache API, 24 h) | Aucune carte stockée en base. D1 ne garde que des `cardCode` et des quantités |
| Images | Liens directs vers le CDN Riot (`imageUrl`) | Rien à héberger |
| Backend | TypeScript + Hono | Léger, prévu pour Workers |
| Frontend | React + Vite + TypeScript, `vite-plugin-pwa` | PWA installable, responsive |
| Authentification | Inscription uniquement sur invitation : l'admin génère des codes. Mots de passe hachés en PBKDF2-SHA256 (WebCrypto), sessions en base avec cookie `HttpOnly; Secure; SameSite=Strict` | Site privé, sans dépendance externe |
| Aléatoire | `crypto.getRandomValues` côté serveur uniquement | Le client ne peut pas tricher |
| Timer des boosters | Calcul paresseux : `stock = min(15, stock_saved + floor((now - last_tick)/600 s))`, sans cron | Aucun coût, résultat exact |
| Échanges | Proposition, puis acceptation. Transfert atomique via `D1 batch()` après vérification de possession | Pas de duplication de cartes |
| Code source | GitHub (dépôt privé), synchronisé entre le PC fixe et le portable | Demandé |

## 3. Données de cartes (analysées le 2026-11-08, release v2026-11-04)

1407 cartes. Raretés présentes dans les données : Common, Uncommon, Rare, Epic, Showcase.

| Set | Code | Ouvrable en booster |
|---|---|---|
| Origins | ogn | oui |
| Proving Grounds | ogs | non (produit starter) |
| Spiritforged | sfd | oui |
| Unleashed | unl | oui |
| Vendetta | ven | oui |
| Radiance | rad | oui |

On classe les variantes à partir de `cardNumber` :

- `NNN-TTT` avec NNN ≤ TTT : carte de base, avec sa rareté.
- `NNNa-TTT` : Alt Art (Showcase).
- `NNN-TTT` avec NNN > TTT : Overnumbered (Showcase).
- `NNN-star-TTT` : Overnumbered signée (Showcase).
- `spX-NNN` : Special Alt (Showcase).
- `rNN` et `rNNa` : Rune et Rune alt. `tNN` : Token ou Battlefield token.

## 4. Composition d'un booster (14 cartes, source officielle Riot)

| Slot | Nb | Contenu |
|---|---|---|
| Common | 7 | Common |
| Uncommon | 3 | Uncommon |
| Foil | 1 | Common, Uncommon, Rare ou Epic en foil |
| Rare+ | 2 | Rare, Epic, Alt Art, Special Alt, Overnumbered, Signée |
| Rune / Token | 1 | Rune, Rune alt ou Token |

Taux par slot Rare+ (hypothèse initiale, configurable dans un fichier dédié) :

| Résultat | Proba par slot | Source |
|---|---|---|
| Epic | 13,4 % | Officiel : environ 1 booster sur 4 contient une Epic |
| Alt Art | 4,2 % | Officiel : environ 2 par display de 24 boosters |
| Overnumbered | 0,69 % | Officiel : environ 1 pour 3 displays |
| Overnumbered signée | 0,07 % | Officiel : environ 1 Overnumbered sur 10 |
| Special Alt (sp) | 0,05 % | Estimation (chase card) |
| Rare | le reste (environ 81,6 %) | |

Slot Foil (estimation communautaire) : 75 % Common, 20 % Uncommon, 4 % Rare, 1 % Epic.
Slot Rune : 92 % Rune, 8 % Rune alt. Si le set n'a pas de rune, on tire un Token du set ou une Rune d'Origins.

## 5. Démarche DevSecOps

- Branche `main` protégée. On passe par une Pull Request et la CI doit être verte avant de merger.
- La CI GitHub Actions lance le lint, le typecheck, les tests (Vitest) et `npm audit`.
- Analyse de sécurité : CodeQL (SAST), gitleaks (détection de secrets), Dependabot (dépendances).
- Les secrets (token Cloudflare) sont uniquement dans GitHub Secrets. Jamais dans le code.
- En-têtes de sécurité : CSP stricte, HSTS, X-Frame-Options DENY, Referrer-Policy.
- Rate limiting sur la connexion. Validation des entrées avec Zod. Requêtes SQL paramétrées uniquement.
- Le déploiement en production se fait automatiquement par la CI au merge sur `main`.

## 6. Feuille de route

| # | Étape | Statut |
|---|---|---|
| 0 | Cadrage, architecture, analyse des données, système de rapports | Terminé |
| 1 | Outils (Git, Node), dépôt GitHub, squelette du monorepo, CI sécurité | À faire |
| 2 | Compte Cloudflare, Worker et D1, premier déploiement "Hello" via la CI | À faire |
| 3 | Authentification : invitations, connexion, sessions, rate limit | À faire |
| 4 | Catalogue des cartes (fetch et cache du JSON, API sets et cartes) | À faire |
| 5 | Moteur de boosters (taux, tirage, tests statistiques) et timer 10 min / 15 max | À faire |
| 6 | Frontend : ouverture de booster animée, collection, filtres | À faire |
| 7 | Échanges entre joueurs | À faire |
| 8 | PWA (installable, hors-ligne partiel), responsive | À faire |
| 9 | Durcissement sécurité (revue, en-têtes, tests d'abus) et mise en prod | À faire |

## 7. Actions manuelles en attente (utilisateur)

1. Installer Git : `winget install --id Git.Git -e`
2. Installer Node.js LTS : `winget install --id OpenJS.NodeJS.LTS -e`
3. Installer GitHub CLI : `winget install --id GitHub.cli -e`, puis `gh auth login`
4. Créer un compte Cloudflare gratuit (on en aura besoin à l'étape 2)
5. Rouvrir VS Code pour que le PATH soit pris en compte

## 8. Journal

- **2026-11-08 — Étape 0.** Analyse de l'API (1407 cartes, 6 sets), recherche des taux officiels, choix de l'architecture, mise en place des rapports PDF (`tools/generate_report.py`).
