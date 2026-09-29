# Remplacer le Worker Cloudflare

Le fichier complet prêt à remplacer le script Cloudflare est [`index.mjs`](index.mjs). Il conserve les routes d’authentification existantes et ajoute les routes de mute, ban et unban.

Dans Cloudflare, ouvre le Worker `valdorian-verification`, remplace le contenu de son éditeur par le contenu complet de `index.mjs`, puis enregistre et déploie. Garde les bindings déjà configurés : `VALDORIAN_KV` et `BREVO_API_KEY`. Aucun nouveau namespace KV n’est requis ; les sanctions utilisent des clés `moderation:account:<id>` dans le KV existant.

Le mute accepte une durée entière de 1 à 9999 et une unité : `m` (minute), `h` (heure), `j` (jour), `mo` (mois de 30 jours) ou `a` (année de 365 jours). Le ban n’expire pas et reste en place jusqu’à `/moderation/unban`. Seul `kairo5575` peut appliquer ces actions, et ce compte ne peut pas être sanctionné.

## Routes ajoutées

- `GET /moderation/accounts`
- `POST /moderation/mute` avec `{ "accountId": "...", "durationValue": 2, "durationUnit": "h" }`
- `POST /moderation/ban` avec `{ "accountId": "..." }`
- `POST /moderation/unban` avec `{ "accountId": "..." }`

## Vérification locale

```sh
node --check worker/index.mjs
node --test worker/*.test.mjs
```
