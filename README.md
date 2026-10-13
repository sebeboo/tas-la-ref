# T'as la ref ? ✨

Application mobile HTML (PWA) de références cultes francophones : rose pétant, paillettes, recherche globale, catégories, favoris et quiz.

## Lancer
- **Le plus simple** : double-cliquer sur `index.html` (tout fonctionne, sauf l'installation sur l'écran d'accueil).
- **En mode application installable / hors-ligne** : servir le dossier en HTTP, par exemple `python -m http.server 8000` puis ouvrir `http://localhost:8000` sur le téléphone (même Wi-Fi) et « Ajouter à l'écran d'accueil ».

## GIF automatiques (Giphy)
Une clé Giphy est intégrée par défaut (`DEFAULT_GIPHY_KEY` dans `js/app.js`) : les GIF s'affichent sans rien configurer.
Pour utiliser une autre clé : catégorie **GIF cultes** → « changer la clé » (clé gratuite sur https://developers.giphy.com/dashboard/ → « Create an App » → **API**).

Chaque carte charge son GIF toute seule (🔄 pour passer au suivant, 💌 pour l'envoyer), et un champ permet de chercher n'importe quel GIF.

⚠️ La clé par défaut est visible dans le code source (c'est normal pour une clé Giphy côté navigateur). Une clé personnalisée, elle, reste dans le navigateur du téléphone (localStorage). Les résultats sont mis en cache pour économiser les appels. Une clé gratuite « beta » est limitée en nombre de recherches par heure ; pour une diffusion publique, demander une clé « production » à Giphy.

## Images libres de droits
Les vignettes viennent de **Wikipédia en français**, qui n'héberge que des images sous licence libre (Wikimedia Commons). Elles sont pré-calculées dans `data/images.js` avec l'auteur·rice et la licence, affichés dans « ☕ Le tea ». Une ref ajoutée plus tard va chercher son image en direct (une requête à la fois). Les films n'ont souvent pas d'image : leurs affiches ne sont pas libres.

## Favoris (« chouchoutes ») permanents
- Stockés dans le navigateur (localStorage) ; l'app demande au navigateur un **stockage persistant** dès le premier favori.
- Une ref corrigée garde ses favoris : `data/aliases.js` relie les anciens identifiants aux nouveaux (généré depuis l'historique git), et la citation + la source sont mémorisées pour retrouver la ref par ressemblance.
- Un favori introuvable n'est jamais effacé.
- Bouton **💾 Lien de sauvegarde** (page Chouchoutes) : un lien `#/import/…` qui restaure les favoris sur n'importe quel appareil.
- Sur iPhone, ajouter l'app à l'écran d'accueil empêche Safari d'effacer les données d'un site non visité depuis 7 jours.

Après avoir modifié des citations : `python tools/generer_alias.py .` (régénère `data/aliases.js` et préserve les favoris).

## Écriture inclusive
Les textes de l'interface et les explications utilisent le point médian (« censé·e », « un·e ami·e »). Les citations, elles, restent fidèles à l'original.

## Ajouter des références
Chaque catégorie est un fichier de `data/` :
```js
["citation", "source", "qui / contexte", année, "note facultative"]
```
- Une année inconnue s'écrit `""`.
- Une source contenant `(VF)` affiche automatiquement le badge VF et le filtre « VF cultes ».
- Catégorie GIF (`data/gifs.js`) : 6e champ = mots-clés de la recherche Giphy ouverte par le bouton « GIF ».
- Nouvelle catégorie : copier un fichier de `data/`, changer `id`, `nom`, `emoji`, `desc`, `couleur`, puis l'ajouter dans `index.html` et dans la liste `FILES` de `sw.js`.

⚠️ Après une modification, incrémenter `CACHE` dans `sw.js` (`talr-v1` → `talr-v2`) pour que les téléphones ayant installé l'app récupèrent la nouvelle version.

## Structure
```
index.html            page unique
css/styles.css        thème rose / paillettes
js/app.js             routage, recherche, favoris, quiz, paillettes
data/*.js             les références (8 catégories)
manifest.webmanifest  + sw.js + icons/   PWA
```
