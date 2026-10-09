# Football Games

Deux jeux dans une application React + Vite : **enchères à deux sur le même écran** et **Parcours du joueur**. Les règles s'exécutent dans le navigateur et les parties sont sauvegardées sur cet appareil. **Seul le frontend doit être hébergé sur Netlify : aucun serveur Express, aucune base distante, aucune Function Netlify et aucun service Render ne sont nécessaires.**

Utiliser Node.js **24.x** pour les commandes de développement et de build.

## Démarrer localement

Depuis la racine du projet, dans PowerShell :

```powershell
npm.cmd install
npm.cmd run dev
```

Ouvrir **http://localhost:5173**. Le catalogue livré contient **56 joueurs réels API-Football et 20 parcours jouables**, exportés depuis les données déjà synchronisées. Les profils de démonstration ne sont pas utilisés par cette version.

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd start
```

La dernière commande lance la prévisualisation du site construit, normalement sur **http://localhost:4173**. Les jeux ne font aucun appel `/api`. Le navigateur charge une fois `/players.json`, puis calcule les décisions et les résultats localement.

## Héberger uniquement sur Netlify

1. Publier le projet dans un dépôt GitHub et importer ce dépôt dans Netlify.
2. Garder la **racine du dépôt** comme dossier de base.
3. Utiliser les paramètres de `netlify.toml` :
   - commande de build : **npm run build:netlify** ;
   - dossier publié : **frontend/dist** ;
   - Node.js : **24**.
4. Déployer : le catalogue API fourni suffit déjà pour jouer.

**BACKEND_URL n'est plus utilisée.** Aucun backend externe n'est à configurer. `render.yaml` concerne uniquement l'ancien serveur optionnel.

### Actualiser les joueurs avec API-Football

Pour que Netlify récupère les données auprès du fournisseur à chaque déploiement, ajouter **FOOTBALL_API_KEY** dans les variables d'environnement Netlify, avec la portée **Builds uniquement**. Ne pas préfixer cette variable par `VITE_` et ne pas mettre sa valeur dans le dépôt.

Paramètres facultatifs du build :

| Variable | Valeur par défaut |
| --- | --- |
| FOOTBALL_API_URL | https://v3.football.api-sports.io |
| FOOTBALL_API_LEAGUE | 39 |
| FOOTBALL_API_SEASON | 2024 |
| FOOTBALL_SYNC_MAX_PAGES | 3 |
| FOOTBALL_SYNC_CAREER_LIMIT | 20 |
| FOOTBALL_SYNC_MAX_REQUESTS | 30 |
| FOOTBALL_SYNC_REQUEST_DELAY_MS | 6500 |

Le build récupère les pages de joueurs puis les historiques `/transfers`, séquentiellement et avec une pause entre les requêtes. Avec ces valeurs, il peut prendre quelques minutes. Les valeurs choisies doivent être autorisées par votre forfait API-Football.

Les données passent par ce flux :

```text
API-Football → build Netlify → players.json → jeux dans le navigateur
```

**La clé reste dans l'environnement du build.** Les fichiers publiés contiennent uniquement les profils et les parcours, sans clé, sans réponse brute du fournisseur et sans anciennes parties. Les visiteurs ne consomment pas votre quota en jouant. Un appel direct du navigateur au fournisseur exposerait la clé ; la récupération pendant le build évite cela. [Sécurité de la clé API-Football](https://www.api-football.com/news/post/introducing-the-api-sports-widget-builder), [variables d'environnement Netlify](https://docs.netlify.com/build/environment-variables/overview/).

Sans clé, le build conserve le catalogue livré et n'appelle pas le fournisseur. Si le quota est atteint ou l'API indisponible, le build conserve les données valides, affiche les avertissements et reste jouable. Les mises à jour partielles sont conservées ; un historique vide ou trop court ne remplace jamais un ancien parcours jouable.

**Les joueurs ne sont pas récupérés en direct à chaque partie.** Pour actualiser le site, déclencher un nouveau déploiement Netlify. Ce fonctionnement permet un hébergement entièrement statique. Changer de ligue ou de saison exige d'abord un catalogue correspondant ; le build refuse de mélanger deux compétitions.

### Actualiser le catalogue sur votre ordinateur

La clé déjà configurée dans `backend/.env` peut servir à la commande locale suivante :

```powershell
npm.cmd run sync:catalogue
npm.cmd run dev
```

Elle actualise **frontend/public/players.json**, sans lancer Express ni utiliser SQLite. Enregistrer ce catalogue dans Git puis redéployer pour publier les nouvelles données. Le fichier ne contient aucune clé.

Pour réexporter des joueurs et des parcours déjà importés dans votre ancienne SQLite :

```powershell
npm.cmd run export:catalogue
```

Cet export lit la base locale sans la modifier et ne publie ni les parties, ni les recrues, ni les réponses des utilisateurs. Seuls les joueurs de source API et leurs parcours API actifs sont exportés. La base source doit contenir au moins deux gardiens, quatre défenseurs, quatre milieux, deux attaquants et deux parcours avec trois clubs distincts.

## Sauvegardes et limites du mode navigateur

Les enchères et le quiz utilisent une sauvegarde locale commune, avec des identifiants de reprise séparés. Recharger la page conserve les parties. Le stockage est propre au navigateur et au domaine : les anciennes parties SQLite ne sont pas transférées automatiquement, et les parties sur localhost ne se retrouvent pas sur Netlify. La base historique reste conservée sur votre ordinateur.

Si le stockage navigateur est désactivé, une partie reste jouable pendant la session mais n'est pas conservée après rechargement. Si le stockage est plein, la décision est refusée avec un message et la dernière sauvegarde reste intacte. Les fenêtres sont coordonnées avec Web Locks lorsque le navigateur le prend en charge.

Le nom du joueur du quiz est masqué à l'écran jusqu'à la réponse. **Dans une application entièrement frontend, les réponses sont présentes dans les données téléchargées et peuvent être inspectées.** Cette version convient au jeu occasionnel sur le même appareil ; elle ne garantit pas l'intégrité d'une compétition et ne propose pas de multijoueur distant ni de comptes.

## Règles des enchères

- Deux participants commencent avec **$200 chacun**.
- Six manches : gardien, défenseur, défenseur, milieu, milieu, attaquant.
- Le premier enchérisseur alterne à chaque manche.
- Une offre est un entier supérieur d'au moins $1 à l'offre actuelle et dans le budget restant.
- Quand l'autre participant passe, le dernier enchérisseur reçoit le joueur et paie son offre.
- Le perdant reçoit gratuitement un autre joueur du même poste.
- Deux passages sans offre attribuent les deux joueurs gratuitement.
- Chaque équipe termine avec exactement six joueurs ; les douze footballeurs sont distincts.
- Le score reste la somme des prix payés ; le plus grand score gagne.

Les versions des parties empêchent l'application de décisions périmées. Les mises à jour du budget et des équipes sont enregistrées ensemble ; une décision invalide n'altère pas la partie.

## Parcours du joueur

Choisir une difficulté puis commencer une nouvelle partie. Le jeu utilise exclusivement les parcours API ayant au moins trois clubs distincts, un nom complet et un historique exploitable.

- **Facile** : clubs et dates connues.
- **Moyen** : clubs et années.
- **Difficile** : clubs seuls.

Une seule réponse est autorisée. La vérification ignore les accents, la casse et les espaces superflus, mais exige le nom complet. Une saisie vide ne consomme pas la tentative. Le résultat révèle le nom et la photo. Rejouer exclut le joueur précédent.

Les prêts et les retours sont conservés. Les transferts ambigus et les historiques avec des trous sont écartés ; les dates inconnues ne sont jamais inventées. Les anciennes parties conservent leur propre instantané si le catalogue est actualisé.

## Organisation du code

```text
frontend/src/games/       moteurs des jeux et sauvegarde navigateur
frontend/src/api.js       interface locale utilisée par React
frontend/src/pages/       écrans des deux jeux
frontend/public/players.json  catalogue public API
frontend/public/_redirects    navigation Netlify
scripts/buildNetlify.mjs      récupération API puis build statique
scripts/refreshCatalogue.mjs  import limité et conservation du catalogue
scripts/exportCatalogue.mjs   export facultatif depuis la SQLite historique
netlify.toml                  configuration du site statique
backend/                      outils historiques et serveur facultatif
```

Les mêmes moteurs servent au navigateur et aux tests du serveur historique, pour conserver une seule implémentation des règles.

## Ancien backend, facultatif

Express et SQLite restent dans le dépôt pour conserver vos données et les anciens outils de synchronisation. Ils ne sont pas démarrés par `npm run dev` et ne sont pas requis pour le déploiement Netlify.

```powershell
npm.cmd run start:backend
npm.cmd run sync:players
npm.cmd run sync:careers
npm.cmd run db:backup
npm.cmd run export:catalogue
```

Ces commandes historiques utilisent `backend/.env` et SQLite. En production Express exige un `DATABASE_PATH` absolu et désactive la synchronisation HTTP. Le fichier `render.yaml` reste disponible uniquement si vous choisissez ultérieurement de réutiliser ce serveur.

Les fichiers `.env`, SQLite, journaux et sauvegardes sont exclus de Git. **Le catalogue public players.json doit être enregistré dans le dépôt.**

## Vérification

Les tests couvrent les enchères, les quotas, les budgets, les parcours, les imports et l'ancien stockage SQLite. Les tests du mode statique vérifient aussi les six manches complètes, la reprise après rechargement, les décisions périmées, le stockage plein ou désactivé, la réponse unique, le changement de joueur et les erreurs de quota pendant le build.

Les tests d'import utilisent des réponses API simulées et ne consomment pas le quota réel. Les tests de rendu React et les builds sont automatisés ; une vérification visuelle dans votre navigateur reste utile avant publication.
