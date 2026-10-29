// Réglages du tableau de bord.

// Toutes les combien de secondes le tableau va chercher les nouveaux chiffres
export const ACTUALISATION = 60;

// Image de fond : un fichier du dépôt (par exemple 'fond.jpg', à mettre à côté de index.html)
// ou une adresse https://… Laisser vide pour le dégradé par défaut.
export const FOND = 'fond.jpg';

// Les sites affichés (la clé = le data-site mis dans la balise de suivi.js du site).
// Le tableau va lire les chiffres de chaque site dans sa base, puis les additionne lui-même
// pour la vue « Tous les sites ».
//   base     : adresse de la Realtime Database du site (la même que data-base dans sa balise
//              de suivi.js)   ← obligatoire
//   nom      : nom affiché
//   adresse  : adresse du site (facultatif) : sert au lien « Ouvrir » et au lien « Ne pas me compter »
//   couleur  : couleur du site (point dans la barre de gauche, vue « Tous les sites ») (facultatif)
//   logo     : image ronde affichée dans la barre de gauche (fichier du dossier logos/, ou adresse https://)
//   icone    : lettre ou emoji affiché à la place, s'il n'y a pas de logo (facultatif : 1re lettre du nom)
//   parties  : true pour un site de jeux : le classement peut trier les jeux par parties jouées
//   actions  : noms affichés des autres actions comptées par le site, au singulier et au pluriel
//              (ex. téléchargements) ; les « parties » ont déjà leur affichage
//   pages    : noms affichés des pages (clé = premier dossier de l'adresse, « accueil » pour la page d'accueil)
export const SITES = {
  jeux: {
    logo: 'logos/jeux.png',
    nom: 'Jeux',
    parties: true,
    base: 'https://games-12f19-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/Games/', // par exemple 'https://ton-pseudo.github.io/jeux-vol/'
    couleur: '#F2B632',
    pages: {
      accueil: 'Menu', uno: 'UNO', skyjo: 'Skyjo', blackjack: 'Blackjack', poker: 'Poker',
      president: 'Le Président', cranes: 'Skull King', kassen: 'Gwynt · Kassen',
      bataille: 'Bataille navale', chevaux: 'Petits chevaux', puissance4: 'Puissance 4',
      tokyo: 'Monopoly', cluedo: 'Cluedo', mastermind: 'Mastermind', demineur: 'Démineur',
      loupgarou: 'Loup-Garou', undercover: 'Undercover', petitbac: 'Petit bac',
      yams: 'Yam’s',
    },
  },
  pyrolos: {
    logo: 'logos/pyrolos.png',
    nom: 'Pyrolos',
    base: 'https://pyrolos-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/Pyrolos/', // par exemple 'https://ton-pseudo.github.io/Pyrolos/'
    couleur: '#4F8DE0',
    pages: {
      carte: 'Carte', itineraires: 'Itinéraires', riders: 'Rouler ensemble', messages: 'Messages',
      meteo: 'Météo', classement: 'Classement', succes: 'Succès',
    },
  },
  mangazone: {
    logo: 'logos/mangazone.png',
    nom: 'MangaZone',
    base: 'https://manga-2a40b-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/MangaZone/', // par exemple 'https://ton-pseudo.github.io/MangaZone/'
    couleur: '#F0697C',
    pages: { discover: 'Découvrir', collection: 'Collection', succes: 'Succès', series: 'Fiche d’une série' },
  },
  animezone: {
    logo: 'logos/animezone.png',
    nom: 'AnimeZone',
    base: 'https://animezone-8d2f5-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/AnimeZone/', // par exemple 'https://ton-pseudo.github.io/AnimeZone/'
    couleur: '#9B7BEA',
    pages: {
      avenir: 'À venir', decouvrir: 'Découvrir', succes: 'Succès', profils: 'Profils', liste: 'Ma liste',
      fiche: 'Fiche d’un anime', profil: 'Profil d’un membre',
    },
  },
  portfolio: {
    logo: 'logos/portfolio.png',
    nom: 'Portfolio',
    // pas de base à lui : ses chiffres sont rangés dans celle du site de jeux
    base: 'https://games-12f19-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/Portfolio/', // par exemple 'https://ton-pseudo.github.io/Portfolio/'
    couleur: '#00EEFF',
    pages: {
      accueil: 'Accueil', 'a-propos': 'À propos', projets: 'Projets', cv: 'CV', contact: 'Contact',
      'projet-vba': 'Projet · Reporting RH VBA', 'projet-r': 'Projet · Clustering R',
      'projet-twitch': 'Projet · Analyse Data Twitch', 'projet-cook': 'Projet · App Cook & Save',
      'projet-nutri': 'Projet · Analyse nutritionnelle', 'projet-web': 'Projet · Projet Web', stage: 'Projet · Stage',
    },
    actions: { telechargements: ['téléchargement', 'téléchargements'] },
  },
  // Exemple pour un nouveau site qui a sa propre base :
  // monsite: {
  //   nom: 'Mon site',
  //   base: 'https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app',
  //   adresse: 'https://ton-pseudo.github.io/monsite/',
  // },
};
