// Réglages du tableau de bord.

// Toutes les combien de secondes le tableau va chercher les nouveaux chiffres
export const ACTUALISATION = 60;

// Les sites affichés (la clé = le data-site mis dans la balise de suivi.js du site).
// Le tableau va lire les chiffres de chaque site dans sa base, puis les additionne lui-même
// pour la vue « Tous les sites ».
//   base     : adresse de la Realtime Database du site (la même que data-base dans sa balise
//              de suivi.js)   ← obligatoire
//   nom      : nom affiché
//   adresse  : adresse du site (facultatif) : sert au lien « Ouvrir » et au lien « Ne pas me compter »
//   couleur  : couleur du site dans la vue « Tous les sites » (facultatif)
//   pages    : noms affichés des pages (clé = premier dossier de l'adresse, « accueil » pour la page d'accueil)
export const SITES = {
  jeux: {
    nom: 'Jeux',
    base: 'https://games-12f19-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/Games/', // par exemple 'https://ton-pseudo.github.io/jeux-vol/'
    couleur: '#F2B632',
    pages: {
      accueil: 'Menu', uno: 'UNO', skyjo: 'Skyjo', blackjack: 'Blackjack', poker: 'Poker',
      president: 'Le Président', cranes: 'Skull King', kassen: 'Gwynt · Kassen',
      bataille: 'Bataille navale', chevaux: 'Petits chevaux', puissance4: 'Puissance 4',
      tokyo: 'Monopoly', cluedo: 'Cluedo', mastermind: 'Mastermind', demineur: 'Démineur',
      loupgarou: 'Loup-Garou', undercover: 'Undercover', petitbac: 'Petit bac',
    },
  },
  pyrolos: {
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
    nom: 'MangaZone',
    base: 'https://manga-2a40b-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/MangaZone/', // par exemple 'https://ton-pseudo.github.io/MangaZone/'
    couleur: '#F0697C',
    pages: { discover: 'Découvrir', collection: 'Collection', succes: 'Succès', series: 'Fiche d’une série' },
  },
  animezone: {
    nom: 'AnimeZone',
    base: 'https://animezone-8d2f5-default-rtdb.europe-west1.firebasedatabase.app',
    adresse: 'https://kciol.github.io/AnimeZone/', // par exemple 'https://ton-pseudo.github.io/AnimeZone/'
    couleur: '#9B7BEA',
    pages: {
      avenir: 'À venir', decouvrir: 'Découvrir', succes: 'Succès', profils: 'Profils', liste: 'Ma liste',
      fiche: 'Fiche d’un anime', profil: 'Profil d’un membre',
    },
  },
  // Exemple pour un autre site qui a sa propre base :
  // portfolio: {
  //   nom: 'Portfolio',
  //   base: 'https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app',
  //   adresse: 'https://ton-pseudo.github.io/portfolio/',
  // },
};
