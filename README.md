# Riftbound TCG privé

Site privé (sur invitation) pour ouvrir des boosters Riftbound, gérer sa collection et échanger des cartes entre amis. Hébergé sur Cloudflare Workers et D1 (offre gratuite).

- Besoin d'origine : [documentation/demande-initiale.md](documentation/demande-initiale.md)
- État, décisions et feuille de route : [documentation/etat-du-projet.md](documentation/etat-du-projet.md)
- Rapports d'avancement : [documentation/rapports-avancement/](documentation/rapports-avancement/)

## Développement

```
npm ci
npm run dev          # site + API en local
npm test             # tests
npm run lint && npm run typecheck
```

Toute modification passe par une Pull Request. La CI et les contrôles de sécurité doivent être verts pour merger.

Données des cartes : [LouisCourrian/riftbound-cards](https://github.com/LouisCourrian/riftbound-cards). Les cartes, textes et images sont © Riot Games et utilisés dans le cadre de la politique Riot pour les contenus de fans, sans usage commercial. Ce projet n'est pas affilié à Riot Games.
