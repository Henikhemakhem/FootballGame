# Football Games

Plateforme de deux jeux : **Jeu des enchères**, à deux participants sur le même écran, et **Parcours du joueur**, un quiz solo. React + Vite, API Express et une seule base SQLite. Utiliser Node.js **24.x** (`node:sqlite`).

## Démarrage

Depuis la racine, dans PowerShell :

```powershell
npm.cmd install
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
npm.cmd run dev
```

Ouvrir **http://localhost:5173** pour choisir un jeu. La navigation utilise `#/encheres` et `#/parcours` ; revenir à l'accueil n'efface aucune partie. Le backend écoute sur **http://localhost:3001**. Sous Windows, `npm.cmd` évite les restrictions d'exécution des scripts PowerShell.

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd start
```

Après le build, Express sert aussi l'interface sur http://localhost:3001. La base est créée automatiquement dans `backend/data/football-draft.sqlite`. Les deux jeux survivent au redémarrage du serveur ; le navigateur retient séparément leurs derniers identifiants de partie.

## Parcours du joueur

Choisir la difficulté puis cliquer sur **Nouvelle partie**. Le serveur choisit un joueur ayant au moins trois clubs distincts et renvoie uniquement son parcours. Une seule réponse est autorisée. Le nom et la photo sont révélés après validation, sur l'écran de succès ou d'échec.

- **Facile** : clubs et dates de transferts disponibles, en ordre chronologique.
- **Moyen** : clubs et périodes par année.
- **Difficile** : clubs seuls, sans dates.

La vérification ignore la casse, les accents et les espaces superflus. Elle exige le nom complet normalisé ; un nom partiel ou une correspondance approximative n'est pas accepté. Les réponses vides/invalides ne consomment pas la tentative.

Rejouer exclut le joueur de la partie précédente. Le retour depuis un autre jeu et le rechargement reprennent le parcours courant ou son résultat final. Les sauvegardes des enchères sont indépendantes.

Les candidats sont sélectionnés dans **SQLite**, parmi les joueurs disposant d'au moins trois clubs distincts dans leurs étapes actives. Aucune liste de noms fixes ne filtre les joueurs importés. La synchronisation récupère `/transfers?player=...`, qui renseigne les dates et les clubs de départ et d'arrivée. Les prêts et retours sont conservés. Les trous, les dates invalides et les transferts ambigus sont écartés ; une date de début inconnue reste indiquée « Avant… ». [Fonctionnement officiel des transferts](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).

Dès qu'au moins un parcours API jouable est enregistré, les nouvelles parties choisissent uniquement parmi ces parcours API. Les parcours de démonstration restent conservés et servent uniquement lorsque aucun parcours API n'est disponible. Rejouer exclut le joueur précédent ; si aucun autre parcours API n'est encore disponible, le serveur demande d'enrichir les carrières. Une partie déjà commencée conserve son instantané : cliquer sur **Nouvelle partie** pour utiliser les parcours nouvellement importés.

Commencer une partie ne déclenche **aucune requête API**. Une panne du fournisseur ne bloque pas les jeux utilisant les données enregistrées. Le premier démarrage initialise seulement un catalogue vide avec les 32 joueurs de démonstration existants et quatre parcours, figés fin 2024. Les biographies officielles ont servi à vérifier cet échantillon : [Liverpool](https://www.liverpoolfc.com/news/first-team/266614-fact-file-mohamed-salah-s-career-so-far-in-numbers), [Manchester City](https://www.mancity.com/news/first-team/first-team-news/2015/august/kevin-de-bruyne-signs-for-manchester-city), [Real Madrid](https://www.realmadrid.com/en-US/football/squad/jude-bellingham).

### REST du parcours

| Méthode | Route | Corps / réponse |
| --- | --- | --- |
| POST | `/api/player-career/start` | `{ "difficulty": "medium", "previousGameId": "uuid-optionnel" }` |
| GET | `/api/player-career/:gameId` | Reprendre les indices ou le résultat final |
| POST | `/api/player-career/:gameId/answer` | `{ "answer": "Prénom Nom" }` |

Avant validation : `{ gameId, status: "PLAYING", difficulty, career, dataNote }`. Le `gameId` est un UUID aléatoire indépendant de l'identité du footballeur. Les indices ne contiennent ni nom, ni photo, ni identifiant de joueur, ni URL de logo. Le serveur Vite limite aussi ses fichiers accessibles au frontend et aux dépendances : les sources et la base du backend ne sont pas téléchargeables via `/@fs/`.

Après validation : les mêmes champs, `status: "FINISHED"`, `correct`, `message`, et `player: { name, photo, career }`. Une seconde validation renvoie 409 ; le résultat enregistré reste consultable. Même deux requêtes simultanées ne peuvent valider deux réponses.

La table **PlayerCareerGame** utilise la base existante : id, playerId, playerName, playerPhoto, career, dataNote, status, difficulty, createdAt, answeredAt, isCorrect et answer. Les données d'identité restent privées côté serveur jusqu'à la première réponse. Le schéma SQLite est en version 4 ; les parties existantes restent inchangées.

## Règles des enchères

- Deux participants commencent chacun avec **$200** et terminent avec exactement **6 recrues** : 1 gardien, 2 défenseurs, 2 milieux, 1 attaquant.
- Les six manches suivent cet ordre : gardien → défenseur → défenseur → milieu → milieu → attaquant.
- Le participant 1 ouvre les manches 1, 3 et 5 ; le participant 2 ouvre les manches 2, 4 et 6.
- Le joueur proposé est choisi aléatoirement dans le poste de la manche. Les participants enchérissent alternativement. Le montant doit être un entier, au moins $1 au-dessus du prix actuel et au maximum égal au budget restant.
- Les enchères ne débitent pas le budget immédiatement. Quand l'autre participant passe, le dernier enchérisseur remporte la recrue et paie son dernier prix.
- Le perdant reçoit **gratuitement** un autre joueur aléatoire du même poste. Aucun footballeur déjà attribué aux deux équipes ne peut être réutilisé.
- Le paiement, les deux attributions et la préparation de la manche suivante sont atomiques. Le navigateur affiche le résultat pendant 4 secondes puis présente automatiquement la manche suivante, ou le résultat final après la sixième.
- Le cas sans offre est défini simplement : un premier passage donne la main à l'autre participant. Si les deux passent sans offre, le joueur proposé revient gratuitement au premier enchérisseur et l'autre reçoit un joueur gratuit du même poste. Un budget à zéro ne bloque donc jamais les six manches.
- Le catalogue est vérifié avant la création : au moins 2 gardiens, 4 défenseurs, 4 milieux et 2 attaquants **distincts**. Un manque de joueurs du bon poste est une erreur, sans remplacement par un autre poste.
- Le score V1 existant est conservé : somme des prix payés aux enchères. Les recrues gratuites valent 0 point. Le plus grand score gagne ; une égalité reste une égalité.

**Exemple testé :** participant 1 propose $20, participant 2 $40, participant 1 $60, participant 2 $80, participant 1 passe. Le participant 2 paie $80 (budget $120), le participant 1 conserve $200 et reçoit un autre joueur gratuit du même poste. La deuxième manche commence avec le participant 2.

Le mode local est destiné à deux personnes partageant un appareil. Le champ `player` vérifie le tour, mais ne constitue pas une authentification. Le multijoueur distant et les comptes ne font pas partie de cette V1.

## Architecture et données

```text
backend/src/
  controllers/          requêtes et réponses
  routes/               REST
  services/             moteur, API football, prix, score
  models/               schéma SQL, requêtes et transactions
  data/                 catalogue de démonstration
  app.js                application testable
  config.js             configuration privée
  server.js             démarrage
backend/test/           tests de règles, REST et fournisseur
frontend/src/
  App.jsx               choix du module par navigation hash
  pages/                menu, enchères et parcours
  components/           navigation, timeline et écrans du parcours
  components.jsx        composants des enchères conservés
  api.js                client REST et sauvegardes séparées
  styles.css            styles communs et responsive
scripts/check.mjs       contrôle de syntaxe backend
```

**Game** : id, noms, budgets, currentTurn (numéro d'action), currentPlayer (participant actif, 1 ou 2), status, createdAt, version. Le JSON `state` stocke `rulesVersion: 2`, le catalogue figé, les ids utilisés, le numéro de manche, l'enchère, la dernière action et le dernier résultat de manche.

**Enchère** : round, position, offeredPlayer, currentPrice, currentBidder, firstBidder, openingPasses, status. Le résultat stocke également winner, loser, finalPrice, soldPlayer et freePlayer.

**GamePlayer** : id, gameId, footballPlayerId, name, photo, team, nationality, position, price (prix réellement payé, zéro autorisé), owner. Clé étrangère vers Game et unicité `(gameId, footballPlayerId)`. La migration SQLite V1 → V2 conserve les données existantes et modifie la contrainte de prix sans effacer de partie.

Les équipes sont disponibles comme listes (`teams`) et regroupées par poste (`teamStructure` : goalkeeper, defenders, midfielders, attackers). Les quotas sont contrôlés côté serveur.

Le navigateur fournit `player`, `playerId`, `version` et, pour une enchère, `amount`. Le serveur décide du poste, du gagnant, du joueur gratuit, des budgets et de la manche suivante. Les versions empêchent les doubles clics ou décisions concurrentes de s'appliquer deux fois.

Les anciennes parties du système d'achat sont conservées en lecture seule. L'interface montre les équipes et budgets archivés et propose une nouvelle partie ; elle ne tente pas de convertir une équipe incomplète en partie d'enchères.

## REST

| Méthode | Route | Corps / effet |
| --- | --- | --- |
| GET | `/api/health` | Santé du serveur |
| POST | `/api/games` | `{ "player1Name": "Alex", "player2Name": "Sam" }` |
| GET | `/api/games/:id` | État complet, équipes et résultat |
| GET | `/api/games/:id/auction` | Enchère, dernier résultat, participant actif et version |
| POST | `/api/games/:id/bid` | `{ "player": 1, "playerId": "demo-27", "version": 0, "amount": 20 }` |
| POST | `/api/games/:id/pass` | `{ "player": 1, "playerId": "demo-27", "version": 4 }` |
| GET | `/api/games/:id/team/:player` | Équipe du participant 1 ou 2, regroupée par poste |

Les actions retournent l'état complet actualisé. `playerId` identifie le footballeur proposé ; `player` identifie le participant. Les anciennes routes d'achat ont été retirées. Erreurs : 400 entrée invalide, 404 partie absente, 409 conflit/règle du jeu, 502 fournisseur externe indisponible ou catalogue insuffisant. Les erreurs portent `{ "error": { "code", "message" } }`.

## API Football

Le flux est désormais **API-Football → playerSyncService → SQLite → services des deux jeux → React**. Le catalogue initial de démonstration reste utilisable sans clé. Les noms et clubs sont figés, et les portraits sont illustrés localement.

Le fournisseur intégré est **API-Football v3 (API-Sports direct)**. Pour importer les données réelles, modifier uniquement `backend/.env` :

```env
FOOTBALL_API_KEY=votre_cle
FOOTBALL_API_URL=https://v3.football.api-sports.io
FOOTBALL_API_LEAGUE=39
FOOTBALL_API_SEASON=2024
FOOTBALL_SYNC_MAX_PAGES=30
FOOTBALL_SYNC_CAREER_LIMIT=50
FOOTBALL_SYNC_MAX_REQUESTS=90
FOOTBALL_SYNC_REQUEST_DELAY_MS=6500
```

Choisir une ligue et une saison accessibles avec votre abonnement. `USE_MOCK_DATA` appartient à l'ancien client fournisseur : ce drapeau ne change plus la source des jeux et ne désactive pas la synchronisation réelle. Sans clé, la synchronisation échoue explicitement et conserve SQLite. Aucun secret n'est envoyé à React. Ne jamais préfixer la clé par `VITE_` ni versionner `.env`.

Depuis la racine :

```powershell
npm.cmd run sync:players
# Options facultatives, selon votre abonnement :
npm.cmd run sync:players -- --league 39 --season 2024 --max-pages 30 --career-limit 50 --max-requests 90
# Enrichir seulement les carrières des joueurs API déjà enregistrés :
npm.cmd run sync:careers
npm.cmd run sync:careers -- --career-limit 56
```

La commande affiche les joueurs récupérés/ajoutés/mis à jour, clubs ajoutés, étapes de carrière ajoutées/mises à jour, appels API et totaux SQLite. **Les compteurs sont calculés sur l'import réel**, pas sur l'exemple de la demande. Une erreur avant le premier joueur produit un code de sortie 1 ; un import partiel renvoie `success: true`, `complete: false` et des avertissements. Une limite de pages ou de parcours est explicitement signalée. Relancer complète progressivement les historiques : ceux jamais interrogés, puis les plus anciens, sont prioritaires, y compris quand une première réponse était vide.

Le bilan inclut `playableApiCareers`, le nombre de parcours API effectivement utilisables dans le quiz. `sync:careers` ne recharge pas `/players` ni `/teams` : son budget est réservé aux transferts des joueurs API déjà connus. Un import de 56 historiques prend environ six minutes avec l'espacement par défaut, hors temps réseau.

Le refus d'une page par l'abonnement (`FOOTBALL_API_PAGE_LIMIT`, notamment la quatrième page avec le forfait gratuit) est distingué d'un quota épuisé (`FOOTBALL_API_RATE_LIMIT`). La synchronisation conserve les pages accessibles et poursuit les carrières lorsque la pagination est limitée par le forfait. Attendre une remise à zéro du quota ne lève pas une restriction de pagination. Un endpoint interdit par l'abonnement produit `FOOTBALL_API_PLAN_LIMIT` et arrête les appels à cet endpoint.

Le service lit les profils paginés `/players?league=...&season=...&page=...`, les clubs `/teams?league=...&season=...`, puis les transferts individuels. Les informations absentes ne remplacent pas les champs locaux déjà renseignés. Un club historique fourni dans un transfert peut être créé même s'il n'est pas dans la ligue choisie ; son pays reste `NULL` s'il est inconnu. Une carrière avec un club sans identifiant fiable ou un historique discontinu est ignorée. Les parcours courts sont enregistrés lorsqu'ils sont exploitables, mais ne sont pas sélectionnés pour le quiz. Un parcours court ne remplace pas un parcours jouable existant.

Les appels sont séquentiels, espacés de 6,5 secondes par défaut, avec 10 secondes de délai par appel et 10 minutes au total. Le budget par défaut est 90 requêtes, avec 30 pages maximum et 50 historiques maximum. Ces plafonds limitent le coût ; adapter les variables à votre quota. Les erreurs HTTP, timeouts, réponses vides, limites indiquées par le fournisseur et erreurs API sont traitées sans effacer les données locales. Un quota atteint arrête les appels, sans boucle de tentatives. Les insertions déjà validées sont conservées. Un verrou SQLite empêche CLI et endpoint d'importer simultanément ; après un arrêt forcé, il expire au bout de 15 minutes.

### Modèles du catalogue

Les tables ont été ajoutées **dans `backend/data/football-draft.sqlite`**, sans deuxième base et sans suppression des parties :

- **Player** : id local stable, apiPlayerId unique, name complet, firstname, lastname, age, nationality, photo, position, height, weight, currentClubId, source et careerSyncedAt.
- **Club** : id local, apiClubId unique, name, logo, country et source.
- **PlayerCareer** : id, playerId → Player, clubId → Club, startDate, endDate, season nullable, source, stintKey et active. L'unicité `(playerId, stintKey)` distingue les prêts/retours sans dupliquer une étape à chaque import. Une date de fin peut être mise à jour.

Les identifiants de démonstration sont préfixés `demo-`. Lors du premier import, une correspondance de nom normalisé unique peut rattacher une ligne de démonstration au vrai identifiant API (par exemple Mohamed Salah). Entre joueurs réels, seul l'identifiant API décide de l'identité. Les anciennes étapes remplacées sont archivées (`active=0`), jamais supprimées. Le quiz lit uniquement le parcours actif ; les parties déjà créées conservent leurs instantanés. Les nouveaux jeux utilisent des identifiants stables `local-<id>` et gardent leurs règles d'enchères, budgets et scores.

### Routes du catalogue

| Méthode | Route | Effet |
| --- | --- | --- |
| GET | `/api/players` | Joueurs enregistrés dans SQLite |
| GET | `/api/players?position=ATT` | Filtre ATT, GK, DEF ou MID |
| POST | `/api/admin/sync-players` | Lance l'import ; corps `{}` ou options league, season, maxPages, careerLimit, maxRequests, careersOnly |
| GET | `/api/health` | `dataMode: "sqlite"` et totaux du catalogue |

En développement, le backend écoute sur loopback par défaut (`HOST=127.0.0.1`). L'endpoint d'administration accepte uniquement un client local et refuse les origines web externes. En production, il est désactivé : les commandes de synchronisation se lancent dans le Shell du serveur. Les réponses `/api` portent `Cache-Control: no-store` pour éviter qu'un proxy ou le navigateur conserve un ancien état de partie.

Exemple PowerShell sur le serveur démarré :

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/admin/sync-players -ContentType application/json -Body '{"careerLimit":50}' -TimeoutSec 900
Invoke-RestMethod http://localhost:3001/api/players?position=ATT
```

## Hébergement : Netlify + Render

Les fichiers de déploiement sont prêts à la racine. **Netlify sert React ; Render exécute Express avec la même SQLite sur un disque persistant.** Aucun compte ni service distant n'est créé par ces fichiers. Le disque nécessite une instance Render payante. [Disques Render](https://render.com/docs/disks), [configuration Blueprint](https://render.com/docs/blueprint-spec).

### 1. Backend Render

Publier le code dans un dépôt GitHub privé ou public, puis créer un Blueprint Render depuis ce dépôt. `render.yaml` configure :

| Paramètre | Valeur |
| --- | --- |
| Runtime | Node.js 24 |
| Plan | Starter, payant |
| Build | `npm ci` |
| Démarrage | `npm start` |
| Santé | `/api/health` |
| Adresse d'écoute | `0.0.0.0`, port fourni par Render |
| Disque persistant | `/var/data`, 1 Go |
| SQLite | `/var/data/football-draft.sqlite` |

Renseigner **FOOTBALL_API_KEY uniquement sur Render** lorsqu'il la demande. Le Blueprint ne contient pas la clé. Les autres paramètres API sont déjà renseignés ; la pagination est plafonnée à trois pages, conformément au forfait actuellement utilisé. Modifier ces paramètres si votre abonnement ou la compétition change.

En production (`NODE_ENV=production`), `.env` n'est pas chargé : les variables viennent de Render. `DATABASE_PATH` doit être absolu et pointer sur le disque persistant ; un chemin absent ou relatif bloque le démarrage pour éviter un stockage éphémère involontaire. `HOST` et `PORT` sont utilisés par le serveur. [Variables Render](https://render.com/docs/configure-environment-variables).

À la première création d'une base vide, le serveur installe le catalogue de démonstration. Pour garder vos joueurs importés, parcours et parties actuels, transférer la sauvegarde comme ci-dessous. Une autre possibilité consiste à synchroniser depuis le Shell Render avec `npm run sync:players` puis `npm run sync:careers` ; cela enrichit le catalogue mais ne transfère pas les anciennes parties.

### 2. Transférer la base actuelle sans écrasement

Sur votre ordinateur, depuis la racine :

```powershell
npm.cmd run db:backup
```

La commande crée un fichier dans `backend/backups/`, affiche son chemin et les compteurs, puis vérifie son intégrité et ses relations. Elle utilise l'API de sauvegarde SQLite et inclut les écritures du journal WAL : **ne pas copier seulement le fichier de la base active pendant que le serveur tourne**. Les joueurs, carrières, recrues et parties des deux jeux sont conservés. Le verrou de synchronisation de la copie est remis à zéro ; la base source reste inchangée. Une sauvegarde existante n'est jamais écrasée. [Sauvegarde SQLite de Node](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

Transférer ce fichier sur le disque Render, par exemple sous `/var/data/import.sqlite`, via SSH/SCP ou les outils du Shell. [Transfert de fichiers Render](https://render.com/docs/disks#transferring-files).

Dans le **Shell Render (Linux)**, copier cette sauvegarde vers un **nouveau fichier**, jamais vers la base active :

```sh
DATABASE_PATH=/var/data/import.sqlite npm run db:backup -- /var/data/football-draft-imported.sqlite
```

Si ce nom existe déjà, choisir un autre nom. Après confirmation de la sauvegarde et de ses compteurs, changer la variable Render **DATABASE_PATH** en `/var/data/football-draft-imported.sqlite`, puis redéployer. Le serveur utilisera la base transférée ; le fichier de l'ancienne base reste conservé. Le disque n'est pas disponible lors du build : exécuter la copie dans le Shell du service actif, pas dans une commande de build, de pré-déploiement ou un job séparé.

### 3. Frontend Netlify

Importer le même dépôt GitHub dans Netlify. Garder la **racine du dépôt** comme dossier de base ; `netlify.toml` définit le build et le dossier publié :

| Paramètre | Valeur |
| --- | --- |
| Build | `npm run build:netlify` |
| Dossier publié | `frontend/dist` |
| Node.js | 24 |

Ajouter une variable d'environnement disponible pendant le **build** :

```env
BACKEND_URL=https://votre-adresse-reelle.onrender.com
```

Utiliser l'URL copiée depuis Render, sans `/api`, sans paramètres et sans clé. `scripts/buildNetlify.mjs` génère `frontend/dist/_redirects`, qui transmet `/api/*` vers le backend HTTPS. Le client React conserve ainsi ses appels `/api/...`, sans changement de domaine dans le navigateur. Un `BACKEND_URL` manquant ou invalide fait échouer le build avec un message explicite. Modifier cette variable nécessite un nouveau déploiement Netlify. **Ne pas ajouter FOOTBALL_API_KEY à Netlify.** [Proxy Netlify](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).

Les règles incluent aussi un retour vers `index.html` pour la navigation du frontend. Un build ordinaire `npm run build` reste disponible pour l'utilisation locale avec Express ; le build Netlify est destiné au déploiement depuis Git avec sa variable `BACKEND_URL`.

### 4. Vérifier et actualiser

Vérifier `https://votre-site.netlify.app/api/health`, puis créer une **nouvelle partie** dans chaque jeu. Le nombre de joueurs doit correspondre à la base choisie sur Render. Les parties existantes gardent leur instantané ; les identifiants stockés dans votre navigateur sur localhost ne sont pas automatiquement transférés au nouveau domaine.

Pour actualiser les données, dans le Shell du service Render :

```sh
npm run sync:players
npm run sync:careers
# Sauvegarder sur le disque persistant :
npm run db:backup -- /var/data/sauvegarde-nouveau-nom.sqlite
```

L'endpoint `/api/admin/sync-players` retourne `403 ADMIN_CLI_ONLY` en production. Les jeux ne déclenchent aucun appel Football API : une indisponibilité du fournisseur ne les empêche pas de fonctionner. Ne pas lancer l'import long depuis le frontend ou le proxy Netlify. Les fichiers `.env`, sauvegardes, bases et journaux SQLite sont exclus de Git ; seul `frontend/dist` est publié sur Netlify.

## Vérifications

Les tests couvrent la séquence $20 → $40 → $60 → $80 → passer, le paiement du seul gagnant, le joueur gratuit du même poste, les six manches, les quotas, les budgets à zéro, les passages sans offre, l'unicité, les actions invalides, la fin, les décisions concurrentes, l'annulation transactionnelle, la reprise SQLite et la migration sans perte de données. Le fournisseur externe est vérifié avec des réponses simulées ; un appel réel nécessite votre clé et un abonnement compatible.

Les tests du parcours couvrent l'absence d'identité dans les indices et les réponses REST, l'échec, le succès, la normalisation, la sélection d'un nouveau joueur, les trois difficultés et la validation unique. Un test rend les vrais composants React du menu et des écrans d'indices/succès/échec et vérifie leurs contenus. Les deux jeux sont aussi testés dans la même SQLite après réouverture.

Les tests de synchronisation importent **350 profils simulés et 1 400 étapes** dans une SQLite de test, répètent l'import sans doublons, contrôlent les clés étrangères et la mise à jour de Salah sans perdre son identité locale. Ils couvrent également les erreurs, l'import partiel après quota, les clubs incomplets, les historiques courts, les lots successifs, le verrou concurrent, les filtres par poste et le démarrage des deux jeux avec les nouveaux joueurs alors que tout accès réseau est interdit. Ces fixtures ne sont jamais importées dans la base de l'application.

Les tests d'hébergement vérifient le proxy HTTPS Netlify, la validation de la configuration de production, le démarrage réel du serveur et des deux jeux, l'absence de cache des réponses API et le refus de la synchronisation HTTP en production. Une sauvegarde avec journal WAL est rouverte pour vérifier la conservation des parties et du catalogue, la libération du verrou de la copie et le refus d'écraser un fichier existant.

Les builds local et Netlify sont vérifiés. Le rendu React est testé automatiquement ; le contrôle visuel et les clics dans un navigateur restent à vérifier, faute de navigateur de contrôle disponible dans cet environnement.

Références : [Vite](https://vite.dev/guide/), [SQLite dans Node](https://nodejs.org/api/sqlite.html), [API-Football v3](https://www.api-football.com/documentation-v3).
