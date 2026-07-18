# DÉPLOIEMENT SUR RENDER — Ny Antsika Voyages

Ce projet est un seul service (frontend + backend ensemble). Pas besoin de Vercel,
pas besoin de service séparé pour la base de données (Supabase reste externe).

## Étape 1 — Pousser ce projet sur GitHub

1. Créez un nouveau dépôt GitHub (ou réutilisez l'existant en remplaçant tous les fichiers).
2. Poussez tout le contenu de ce dossier à la racine du dépôt (server.js, package.json,
   frontend/, etc.).

## Étape 2 — Créer le service sur Render

1. Allez sur https://dashboard.render.com
2. Cliquez sur **New +** → **Web Service**
3. Connectez votre dépôt GitHub `mada-voyage`
4. Renseignez :
   - **Name** : mada-voyage
   - **Region** : au choix (Frankfurt ou Singapore sont les plus proches de Madagascar)
   - **Branch** : master (ou main)
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `node server.js`
   - **Instance Type** : Free (ou payant si vous voulez éviter la mise en veille)

## Étape 3 — Variables d'environnement

Dans l'onglet **Environment** du service Render, ajoutez :

```
SUPABASE_URL=https://pmpoettqgndtketbhrpa.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcG9ldHRxZ25kdGtldGJocnBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDcyNDIsImV4cCI6MjA5OTEyMzI0Mn0.RAMGtYWwurErKz389xtYnC3fe86AgoBsV_y-dJmhdmg
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtcG9ldHRxZ25kdGtldGJocnBhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzU0NzI0MiwiZXhwIjoyMDk5MTIzMjQyfQ.l2piVwzjEuuyE8fedyBR7MrF80WWzst9fZ0r9xjLlbI
JWT_SECRET=ny_antsika_voyages_secret_key_2026_secure
NODE_ENV=production
```

(Ces mêmes valeurs sont déjà en secours dans `server.js`, donc même si vous oubliez
cette étape, le projet fonctionnera quand même — mais il est recommandé de les mettre
proprement en variables d'environnement.)

## Étape 4 — Déployer

Cliquez sur **Create Web Service**. Render installe les dépendances et démarre le
serveur automatiquement. Au bout de quelques minutes, votre URL sera du type :

```
https://mada-voyage.onrender.com
```

## Étape 5 — Tester

Une fois "Live" affiché sur Render, testez dans le navigateur :

```
https://mada-voyage.onrender.com/api/health         → doit répondre en JSON
https://mada-voyage.onrender.com/                   → doit afficher le site
https://mada-voyage.onrender.com/api/client/trajets → doit lister les trajets
```

Puis testez directement sur le site : inscription, connexion, recherche, réservation,
historique, et le dashboard admin.

## Notes importantes

- **Le frontend et le backend sont sur la même URL** (`window.location.origin + '/api'`
  dans `script.js` et `reservations.js`), donc aucun problème de CORS ni d'URL à
  changer après un redéploiement.
- **Plan gratuit Render** : le service se met en veille après 15 minutes d'inactivité.
  Le premier appel après une pause peut prendre 30 à 60 secondes.
- Vérifiez dans **Supabase → Table Editor** que les tables `users`, `trajets`,
  `reservations`, `vehicules`, `cooperatives` existent avec les colonnes attendues
  par `server.js` (voir le code pour la liste exacte des champs utilisés).
- Vérifiez aussi les policies RLS de Supabase si des erreurs 500 apparaissent sur
  les inscriptions ou créations de données — `server.js` utilise déjà la clé
  `service_role` pour contourner ça sur les écritures sensibles.



## supabase passwords : VxK9aNnHg5yQ5xwN

lien du site : https://mada-voyage-clean.onrender.com/index.html#
lien du supabases : https://supabase.com/dashboard/project/cxqipjzcqucpjskrjkci/editor/17619
lien git : https://github.com/leonardsarobidy-max/mada-voyage-clean/blob/main/server.js
lien render : https://dashboard.render.com/web/srv-d9d8jqahil2s73918r7g/logs?t=app&r=1h