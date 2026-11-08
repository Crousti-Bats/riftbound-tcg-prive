# Riftbound TCG privé — État du projet

Ce fichier est la source de vérité pour reprendre le projet. Le rapport PDF de chaque étape est généré depuis ce fichier et depuis `documentation/demande-initiale.md`.

**Dernière mise à jour :** 2026-11-08
**Étape en cours :** 2 — Cloudflare, D1, déploiement continu (site en ligne ; il reste à saisir le jeton API dans GitHub, voir §7)
**Prochaine étape :** 3 — Authentification (invitations, connexion, sessions, limitation des tentatives)
**Dépôt :** https://github.com/Crousti-Bats/riftbound-tcg-prive (public, `main` protégée)
**Site en production :** https://riftbound-tcg.axelgirard.workers.dev

### Infrastructure Cloudflare (aucune de ces valeurs n'est secrète)

| Élément | Valeur |
|---|---|
| Compte | `Axelgirard@gmail.com's Account` (ID `14bd3e99e009ec33efebde236223ab6a`) |
| Worker | `riftbound-tcg` (site + API), URL `riftbound-tcg.axelgirard.workers.dev` |
| Base D1 | `riftbound-tcg`, ID `efbe0899-7a3f-4f63-aad4-4bd9c540eb2d`, région WEUR, nom dans le code `BASE_DE_DONNEES` |
| Migrations | `base-de-donnees/migrations/NNNN_description.sql`, appliquées automatiquement au déploiement |
| GitHub | environnement `production` (déploiement depuis `main` uniquement) : secrets `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`, variable `CLOUDFLARE_SOUS_DOMAINE=axelgirard` |

## 0. Reprendre sur un autre PC

```
git clone https://github.com/Crousti-Bats/riftbound-tcg-prive.git
cd riftbound-tcg-prive
npm ci
npm run dev        # site + API en local (http://localhost:5173)
npm test           # tests
```

Pré-requis : Git, Node.js 22 ou plus, GitHub CLI (`gh auth login`), Python avec `pip install reportlab` pour les rapports.
Méthode de travail : `git switch -c etape-N`, puis commit, puis `git push`, puis `gh pr create`. On merge quand la CI est verte.

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
| Code source | GitHub (dépôt public, voir §5), synchronisé entre le PC fixe et le portable | Demandé |

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

**Taux de référence, validés par l'utilisateur le 2026-11-08** (ils font foi, à coder dans un fichier de configuration à l'étape 5) :

| Rareté | Fréquence par booster | Soit par display de 24 |
|---|---|---|
| Epic (orange) | 1 booster sur 6 | 4 |
| Alt Art | 1 booster sur 12 | 2 |
| Overnumbered | 1 booster sur 72 | 1 pour 3 displays |
| Overnumbered signée | 1 booster sur 240 | 1 pour 10 displays |

On les convertit en probabilités pour chacun des 2 slots Rare+. Comme il y a 2 slots, « 1 pour N boosters » devient 1/(2N) par slot. Pour l'Epic, on retire d'abord la part du slot Foil (1 %), pour que le total observé reste de 1 sur 6 :

| Résultat | Proba par slot Rare+ | Calcul |
|---|---|---|
| Epic | 7,83 % | (1/6 − 0,01) / 2 |
| Alt Art | 4,17 % | 1/24 |
| Overnumbered | 0,694 % | 1/144 |
| Overnumbered signée | 0,208 % | 1/480 |
| Special Alt (sp) | 0,05 % | estimation, non fournie par l'utilisateur |
| Rare | 87,05 % | le reste |

Les tests de l'étape 5 simuleront au moins 100 000 boosters et vérifieront ces fréquences **par booster** : Epic environ 16,7 %, Alt environ 8,3 %, Over environ 1,39 %, signée environ 0,42 %.

Slot Foil (estimation communautaire) : 75 % Common, 20 % Uncommon, 4 % Rare, 1 % Epic.
Slot Rune : 92 % Rune, 8 % Rune alt. Si le set n'a pas de rune, on tire un Token du set ou une Rune d'Origins.

## 5. Démarche DevSecOps

- Le dépôt est **public** (choix du 2026-11-08). Sur le plan gratuit, c'est la seule façon d'avoir la protection de branche, CodeQL et la push protection. Le site reste privé grâce à l'authentification.
- Branche `main` protégée par un ruleset « Protection main » : PR obligatoire (0 approbation, on est seul), pas de force-push ni de suppression, merge en squash uniquement, et 4 contrôles requis : `Lint, types, tests, build`, `Audit des dépendances`, `CodeQL (SAST)`, `Gitleaks (secrets)`.
- `.github/workflows/verifications-qualite.yml` lance le lint (ESLint), le typecheck (tsc), les tests (Vitest), le build, `npm audit` et la dependency review sur les PR. Il vérifie aussi que `serveur-api/types-cloudflare-generes.d.ts` est à jour.
- `.github/workflows/analyses-securite.yml` lance CodeQL (`security-extended`, JS/TS et Actions) et Gitleaks, à chaque PR, à chaque push et chaque lundi.
- Dependabot (npm et Actions, chaque semaine), alertes et correctifs automatiques activés. Secret scanning et push protection activés. Signalement privé de vulnérabilités activé (voir `.github/SECURITY.md`).
- Chaîne d'approvisionnement : versions npm exactes (`.npmrc` `save-exact`), lockfile, `npm ci`, actions épinglées par SHA, `permissions` minimales.
- Override `minimatch@11.0.5` dans `package.json` : corrige GHSA-g3hv-75wg-m249 (ReDoS, moderate), remonté via eslint 10. On pourra le retirer quand eslint le corrigera.
- Les secrets (token Cloudflare) sont uniquement dans GitHub Secrets. Jamais dans le code.
- En-têtes de sécurité : CSP stricte, HSTS, X-Frame-Options DENY, Referrer-Policy.
- Rate limiting sur la connexion. Validation des entrées avec Zod. Requêtes SQL paramétrées uniquement.
- Le déploiement en production se fait automatiquement au merge sur `main`, via `.github/workflows/deploiement-production.yml`. Le workflow lance les tests, le build, les migrations D1 `--remote`, puis `wrangler deploy` et vérifie `/api/health`. Il utilise l'environnement GitHub `production`, limité à la branche `main`. Le jeton Cloudflare n'a que les droits Workers et D1.
- `/api/health` vérifie aussi la base (`SELECT 1`). Si la base est en panne, il répond 503 sans détail interne.
- Dependabot ignore les versions majeures de TypeScript : TS 7 n'est pas supporté par typescript-eslint (PR #2 à fermer).

## 6. Feuille de route

| # | Étape | Statut |
|---|---|---|
| 0 | Cadrage, architecture, analyse des données, système de rapports | Terminé |
| 1 | Outils (Git, Node), dépôt GitHub, squelette du monorepo, CI sécurité | Terminé |
| 2 | Compte Cloudflare, Worker et D1, premier déploiement "Hello" via la CI | Terminé (il reste à saisir le jeton, voir §7) |
| 3 | Authentification : invitations, connexion, sessions, rate limit | À faire |
| 4 | Catalogue des cartes (fetch et cache du JSON, API sets et cartes) | À faire |
| 5 | Moteur de boosters (taux, tirage, tests statistiques) et timer 10 min / 15 max | À faire |
| 6 | Frontend : ouverture de booster animée, collection, filtres | À faire |
| 7 | Échanges entre joueurs | À faire |
| 8 | PWA (installable, hors-ligne partiel), responsive | À faire |
| 9 | Durcissement sécurité (revue, en-têtes, tests d'abus) et mise en prod | À faire |

## 7. Actions manuelles en attente (utilisateur)

1. **Créer le jeton API Cloudflare pour GitHub.** Sur https://dash.cloudflare.com/profile/api-tokens : Create Token, modèle « Edit Cloudflare Workers ». Ajouter la permission Account / D1 / Edit. Dans Account Resources, choisir son compte. Dans Zone Resources, laisser All zones. Choisir une expiration d'un an, puis Create. Copier le jeton.
2. **Saisir les valeurs dans GitHub.** Dans une fenêtre PowerShell, depuis le dossier du projet :
   `gh secret set CLOUDFLARE_API_TOKEN --env production` (coller le jeton quand c'est demandé ; il ne s'affiche pas)
   `gh secret set CLOUDFLARE_ACCOUNT_ID --env production --body 14bd3e99e009ec33efebde236223ab6a`
   `gh variable set CLOUDFLARE_SOUS_DOMAINE --env production --body axelgirard`
3. **Fermer la PR Dependabot #2** (TypeScript 7) : `gh pr close 2 --comment "TS 7 pas encore supporté par typescript-eslint"`.
4. Merger la PR de l'étape 2. Le workflow « Déploiement production » doit passer au vert.
5. Sur le portable : installer Git, Node.js LTS et GitHub CLI (`winget install --id Git.Git -e`, `OpenJS.NodeJS.LTS`, `GitHub.cli`), puis lancer `gh auth login`.

## 8. Journal

- **2026-11-08 — Étape 0.** Analyse de l'API (1407 cartes, 6 sets), recherche des taux officiels, choix de l'architecture, mise en place des rapports PDF (`outils/generer-rapport-pdf.py`).
- **2026-11-08 — Étape 1.** Dépôt public `Crousti-Bats/riftbound-tcg-prive` créé. Squelette : Worker Hono (`worker/`, route `/api/health`, en-têtes de sécurité, 3 tests), front React 19 et Vite 8 (`src/`), `@cloudflare/vite-plugin`, TypeScript strict, ESLint. CI et sécurité (CodeQL, Gitleaks, audit, dependency review, Dependabot), ruleset sur `main`. Le lint, les types, les tests et le build passent en local, avec 0 vulnérabilité.
- **2026-11-08 — Réorganisation.** Les fichiers sont rangés dans des dossiers par fonction, avec des noms explicites en français (voir ci-dessous). Les anciens chemins (`worker/`, `src/`, `docs/`, `tools/`) n'existent plus. Les rapports PDF 00 et 01 citent encore ces anciens chemins, c'est normal : ce sont des archives.
- **2026-11-08 — Étape 2.** `wrangler login` effectué sur le PC fixe. Base D1 `riftbound-tcg` créée (WEUR), migration `0001_initialisation.sql` (table `parametres`) appliquée en local et en production. Premier déploiement manuel réussi : https://riftbound-tcg.axelgirard.workers.dev/api/health répond `{"status":"ok","base":"ok"}`, avec les en-têtes CSP, HSTS et X-Frame-Options vérifiés. Workflow de déploiement automatique ajouté, environnement GitHub `production` créé (branche `main` uniquement). L'assistant n'a pas le droit d'écrire des secrets GitHub ni de fermer des PR : ces actions reviennent à l'utilisateur (§7). 4 tests passent.
- **2026-11-08 — Taux de drop.** L'utilisateur a fourni les taux de référence : Epic 1/6, Alt 1/12, Over 1/72, Over signée 1/240 boosters. Ils remplacent les estimations initiales (Epic à 13,4 % et signée à 0,07 % par slot, jugées trop élevée et trop faible). Voir §4.
- Astuce Windows : `pkill` n'existe pas dans Git Bash. Pour arrêter un serveur de dev resté ouvert, utiliser PowerShell `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` puis `Stop-Process`.

### Arborescence (convention de nommage : français, minuscules, tirets)

```
application-web/                      LE SITE (navigateur : téléphone, tablette, PC)
  index.html                          page HTML de départ (nom imposé par le web et Cloudflare)
  demarrage-application.tsx           démarre React et affiche l'écran d'accueil
  ecran-accueil.tsx                   écran principal (pour l'instant : état de l'API)
  styles-globaux.css                  couleurs et mise en page communes
  fichiers-statiques/_headers         en-têtes de sécurité du site (nom imposé par Cloudflare)

serveur-api/                          L'API (Cloudflare Worker, Hono)
  point-entree-api.ts                 déclare les routes /api/...
  entetes-securite.ts                 en-têtes de sécurité des réponses de l'API
  point-entree-api.test.ts            tests automatiques de l'API
  types-cloudflare-generes.d.ts       GÉNÉRÉ par `npm run cf-typegen`, ne pas modifier à la main

base-de-donnees/                      BASE SQLITE CLOUDFLARE D1
  migrations/0001_initialisation.sql  scripts de création/évolution des tables (numérotés, jamais modifiés après merge)

configuration/                        RÉGLAGES DES OUTILS
  cloudflare-wrangler.jsonc           Cloudflare : nom du service, règles de routage, base D1
  vite-site-et-api.config.ts          Vite : `npm run dev` et `npm run build`
  tests-vitest.config.ts              Vitest : où sont les tests
  qualite-code-eslint.config.js       ESLint : règles de qualité et de sécurité du code
  typescript/tsconfig.json            TypeScript : fichier principal, qui renvoie aux 3 suivants
  typescript/tsconfig-application-web.json
  typescript/tsconfig-serveur-api.json
  typescript/tsconfig-configuration.json

documentation/                        REPRISE DU PROJET
  demande-initiale.md                 ta demande d'origine, mot pour mot
  etat-du-projet.md                   CE FICHIER : décisions, étape en cours, feuille de route
  rapports-avancement/*.pdf           un rapport PDF par étape

outils/
  generer-rapport-pdf.py              fabrique le PDF de fin d'étape

.github/                              GITHUB (emplacement imposé)
  workflows/verifications-qualite.yml lint, types, tests, build, audit à chaque PR
  workflows/analyses-securite.yml     CodeQL et Gitleaks à chaque PR et chaque lundi
  workflows/deploiement-production.yml  mise en ligne automatique après merge sur main
  dependabot.yml                      mises à jour automatiques des dépendances (nom imposé)
  SECURITY.md                         politique de sécurité (nom imposé)

À la racine (emplacement imposé par les outils) :
  package.json / package-lock.json    dépendances et commandes npm
  .npmrc                              réglages npm (versions exactes)
  .gitignore / .gitattributes         ce que Git ignore, fins de ligne
  README.md                           page d'accueil GitHub
  CLAUDE.md                           consignes lues par l'assistant à chaque nouvelle conversation
```
