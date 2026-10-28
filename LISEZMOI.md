# Tableau de bord

Tableau de bord des visites de tous mes sites : visiteurs uniques par jour et par mois, pages vues,
nouveaux visiteurs, pages les plus vues, téléphone ou ordinateur, part des visites depuis l'appli installée.
Une vue par site, et une vue « Tous les sites ».

Site statique (aucune bibliothèque, aucune compilation) : il suffit de le publier avec GitHub Pages.
`index.html?demo` montre le tableau avec des chiffres inventés.

## Fichiers

```
index.html        la page
style.css         le style (cartes en verre dépoli)
app.js            lit les chiffres dans les bases et dessine le tableau
config.js         bases à lire, noms et adresses des sites, noms des pages   ← à modifier
suivi.js          le script de comptage, à copier dans chaque site suivi
regles-stats.txt  le bloc de règles « stats » à ajouter dans chaque base qui reçoit des chiffres
regles.json       règles complètes, pour une base qui ne servirait qu'aux statistiques
```

## Comment ça marche

Chaque site suivi contient une copie de `suivi.js`. À chaque visite, il ajoute 1 à quelques compteurs
dans **la Realtime Database du site** (indiquée par `data-base`), sous `stats/<site>/` :

```
stats/<site>/jours/AAAA-MM-JJ   visiteurs, vues, nouveaux, appli, appareils/{mobile|ordi}, pages/<page>
stats/<site>/mois/AAAA-MM       visiteurs
stats/<site>/total              visiteurs, vues
```

Rien de personnel n'est envoyé : chaque appareil retient seulement, dans son navigateur, le jour et le
mois où il a déjà été compté, pour compter chaque visiteur une fois par jour et par mois. Les journées
sont comptées à l'heure de Paris.

Le tableau de bord lit les compteurs de chaque base listée dans `config.js` (API REST de Firebase) et
va chercher les nouveaux chiffres toutes les minutes. Une base qui ne répond pas n'empêche pas
d'afficher les autres (le voyant en haut à droite passe au rouge, le détail s'affiche au survol).

Un site sans base à lui peut aussi envoyer ses chiffres dans une **base commune** (`BASE` dans
`config.js` et `BASE_COMMUNE` dans `suivi.js`, aujourd'hui celle du site de jeux) : il suffit
d'omettre `data-base`.

## Ajouter un site

1. **Règles de sa base (une fois)** : dans la console Firebase du site, Realtime Database → Règles,
   ajouter le bloc de `regles-stats.txt` à côté des règles existantes, puis Publier. Si le site a un
   fichier de règles dans son dépôt, y ajouter aussi le bloc.
2. **Comptage** : copier `suivi.js` à la racine du site, et dans chaque page, avant `</body>` :
   ```html
   <script src="suivi.js" data-site="mon-site"
           data-base="https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app" defer></script>
   ```
   (`../suivi.js` dans un sous-dossier). `mon-site` : 2 à 30 caractères parmi a-z, 0-9 et « - ».
   `data-base` : l'adresse de la base du site (console Firebase → Realtime Database → onglet Données,
   en haut). Sans `data-base`, les chiffres vont dans la base commune.
3. **Tableau de bord** : dans `config.js`, ajouter le site avec sa `base` (le tableau ne lit que les
   bases qu'il connaît), et si tu veux son nom, son adresse, sa couleur et le nom de ses pages.

Les « pages » sont le premier dossier de l'adresse sous la racine du site : `/uno/` → `uno`,
`/projets.html` → `projets`, la page d'accueil → `accueil`.

Les règles « stats » autorisent seulement à ajouter 1 à un compteur, et à tout lire sous `stats/`.
Les chiffres sont donc lisibles par quiconque connaît l'adresse de la base (ce ne sont que des
compteurs). Elles ne touchent pas aux autres données de la base.

## Ne pas compter ses propres visites

Ouvrir chaque site une fois avec `?suivi=off` à la fin de l'adresse, sur chaque appareil
(`?suivi=on` pour annuler). Si l'adresse des sites est remplie dans `config.js`, le bas du tableau de
bord propose directement ces liens.

Pas comptés non plus : les visites hors connexion et en local (`localhost`). Un visiteur qui efface les
données de son navigateur est recompté comme nouveau.
