
// Toutes les combien de secondes le tableau va chercher les nouveaux chiffres
export const ACTUALISATION = 60;

// Noms affichés pour chaque site (la clé = le data-site mis dans la balise de suivi.js).
// Un site qui n'est pas listé ici apparaît quand même, avec son identifiant comme nom.
//   base     : adresse de la Realtime Database du site, s'il range ses chiffres dans sa propre base
//              (la même que data-base dans sa balise de suivi.js). Sans « base » : la base commune.
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
  // Exemple pour un autre site qui a sa propre base :
  // portfolio: {
  //   nom: 'Portfolio',
  //   base: 'https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app',
  //   adresse: 'https://ton-pseudo.github.io/portfolio/',
  // },
};
