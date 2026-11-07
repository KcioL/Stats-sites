/* Suivi des visites — à copier à la racine de chaque site suivi par le tableau de bord.
 *
 * Installation dans un site : copier ce fichier à la racine du site, puis ajouter dans chaque page
 *   <script src="suivi.js" data-site="nom-du-site" data-base="https://….firebasedatabase.app" defer></script>
 * (avec le bon chemin, par exemple ../suivi.js dans un sous-dossier). « nom-du-site » : 2 à 30
 * caractères parmi a-z, 0-9 et « - ». data-base : adresse de la Realtime Database du site, où ranger
 * les chiffres. Cette base doit avoir les règles « stats » (voir regles-stats.txt du tableau de bord).
 *
 * Rien de personnel n'est envoyé : pas d'adresse IP enregistrée, pas d'identifiant. Chaque appareil
 * retient seulement (dans son navigateur) le jour et le mois où il a déjà été compté, pour compter
 * chaque visiteur une fois par jour et par mois. La base ne reçoit que des compteurs :
 *
 *   stats/<site>/jours/AAAA-MM-JJ   visiteurs, vues, nouveaux, appli, appareils/{mobile|ordi},
 *                                   pages/<page> (visiteurs du jour par page)
 *   stats/<site>/mois/AAAA-MM       visiteurs
 *   stats/<site>/total              visiteurs, vues
 *
 * <page> = premier dossier de l'adresse sous la racine du site (« uno » pour /uno/), ou « accueil ».
 * La racine du site est le dossier qui contient ce fichier. Pour un site d'une seule page à onglets :
 *   - data-page="carte" sur la balise donne le nom de la page affichée à l'ouverture ;
 *   - window.suivi.page('itineraires') compte le passage sur un autre onglet (une page vue de plus,
 *     et un visiteur de plus pour cet onglet s'il ne l'avait pas encore ouvert ce jour-là).
 *
 * Actions : window.suivi.action('parties-en-ligne', 'uno') ajoute 1 à
 *   stats/<site>/jours/AAAA-MM-JJ/actions/<action>/<page>   et   stats/<site>/total/actions/<action>/<page>
 * (une partie lancée, un formulaire envoyé…). Sans <page> : la page actuelle. Chaque action est aussi
 * notée dans stats/<site>/jours/AAAA-MM-JJ/journal/<id> = { a: action, p: page, t: heure du serveur }. Le tableau de bord affiche
 * les actions dont le nom commence par « parties » comme des parties jouées, avec le détail par mode.
 * Pour une partie en plusieurs manches : const ref = window.suivi.action('parties-telephone', 'skyjo', { m: 1 })
 * note m (nombre de manches) dans le journal, puis window.suivi.manches(ref, 3) le met à jour.
 * Joueurs : { j: '3+1' } (3 joueurs et 1 bot) à l'action, puis window.suivi.manches(ref, 2, '2+1') ajoute
 * ceux de la manche suivante : j devient « 3+1,2+1 » (un nombre par manche, « +bots » s'il y en a).
 *
 * Pas compté : localhost, hors connexion, et un appareil où l'on a ouvert le site avec ?suivi=off
 * (?suivi=on pour annuler).
 */
(() => {
  const FUSEAU = 'Europe/Paris';

  const script = document.currentScript;
  const site = script && script.dataset.site;
  if (!site || !/^[a-z0-9-]{2,30}$/.test(site)) return;
  const BASE = (script.dataset.base || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+\.(firebasedatabase\.app|firebaseio\.com)$/.test(BASE)) return;
  const racine = new URL('.', script.src).pathname;
  const CLE = `suivi:${site}`;
  const IGNORER = 'suivi:ignorer';

  function stockage() {
    try {
      const q = new URLSearchParams(location.search).get('suivi');
      if (q === 'off') localStorage.setItem(IGNORER, '1');
      if (q === 'on') localStorage.removeItem(IGNORER);
      if (localStorage.getItem(IGNORER) === '1') return null;
      return JSON.parse(localStorage.getItem(CLE) || '{}') || {};
    } catch (e) {
      return null; // stockage bloqué : on ne compte pas, plutôt que de compter chaque page comme un nouveau visiteur
    }
  }

  function jourDe(date) {
    const p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date).forEach((x) => { p[x.type] = x.value; });
    return `${p.year}-${p.month}-${p.day}`;
  }

  const nettoyer = (nom) => {
    const p = String(nom || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\.html?$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    return p.length >= 2 && p !== 'index' ? p : '';
  };

  function pageActuelle() {
    if (script.dataset.page) return nettoyer(script.dataset.page) || 'accueil';
    const chemin = location.pathname.startsWith(racine) ? location.pathname.slice(racine.length) : '';
    let premier = '';
    try { premier = decodeURIComponent(chemin.split('/')[0] || ''); } catch (e) { /* adresse mal formée */ }
    return nettoyer(premier) || 'accueil';
  }

  const horsJeu = () => location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname) || !navigator.onLine;
  const envoyer = (maj) => fetch(`${BASE}/.json`, { method: 'PATCH', body: JSON.stringify(maj), keepalive: true }).catch(() => {});
  const UN = { '.sv': { increment: 1 } };
  let pageCourante = pageActuelle();

  function compter(page) {
    pageCourante = page;
    if (horsJeu()) return;
    const memoire = stockage();
    if (!memoire) return;

    const jour = jourDe(new Date());
    const mois = jour.slice(0, 7);
    const s = `stats/${site}`;
    const d = `${s}/jours/${jour}`;
    const un = UN;
    const maj = { [`${d}/vues`]: un, [`${s}/total/vues`]: un };

    if (!memoire.vu) {
      maj[`${d}/nouveaux`] = un;
      maj[`${s}/total/visiteurs`] = un;
    }
    let pages = Array.isArray(memoire.pages) ? memoire.pages : [];
    if (memoire.jour !== jour) {
      const mobile = matchMedia('(pointer: coarse)').matches;
      const appli = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
      maj[`${d}/visiteurs`] = un;
      maj[`${d}/appareils/${mobile ? 'mobile' : 'ordi'}`] = un;
      if (appli) maj[`${d}/appli`] = un;
      pages = [];
    }
    if (memoire.mois !== mois) maj[`${s}/mois/${mois}/visiteurs`] = un;
    if (!pages.includes(page)) {
      maj[`${d}/pages/${page}`] = un;
      pages.push(page);
    }

    // Noté avant l'envoi : si l'envoi échoue, on perd une visite plutôt que d'en compter deux
    try {
      localStorage.setItem(CLE, JSON.stringify({ vu: true, jour, mois, pages }));
    } catch (e) { return; }

    envoyer(maj);
  }

  function action(nom, page, details) {
    const a = nettoyer(nom);
    const p = nettoyer(page) || pageCourante;
    if (!a || horsJeu() || !stockage()) return null;
    const s = `stats/${site}`;
    const jour = jourDe(new Date());
    envoyer({ [`${s}/jours/${jour}/actions/${a}/${p}`]: UN, [`${s}/total/actions/${a}/${p}`]: UN });
    // Journal : l'heure exacte de l'action (donnée par le serveur), pour le détail heure par heure.
    // Envoyé à part : si les règles de la base n'ont pas encore le journal, les compteurs marchent quand même.
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const entree = { a, p, t: { '.sv': 'timestamp' } };
    const m = details && Number(details.m);
    if (Number.isInteger(m) && m >= 1 && m <= 999) entree.m = m;
    const ref = { jour, id, m: entree.m || 0, j: '' }; // pour window.suivi.manches(ref, n, joueurs)
    const j = details && joueursValides(details.j);
    // les joueurs sont envoyés une fois la partie notée (leur règle demande que la partie existe)
    envoyer({ [`${s}/jours/${jour}/journal/${id}`]: entree }).then(() => { if (j) ajouterJoueurs(ref, j); });
    return ref;
  }

  const joueursValides = (j) => (typeof j === 'string' && /^[0-9]{1,2}(\+[0-9]{1,2})?$/.test(j) ? j : '');
  function ajouterJoueurs(ref, j) {
    const tout = ref.j ? `${ref.j},${j}` : j;
    if (tout.length > 3000) return;
    ref.j = tout;
    envoyer({ [`stats/${site}/jours/${ref.jour}/journal/${ref.id}/j`]: tout });
  }

  // Nombre de manches jouées d'une partie déjà notée au journal (seulement s'il augmente)
  // (et, en option, les joueurs de cette manche : '3' ou '3+1' avec un bot)
  function manches(ref, n, joueurs) {
    n = Number(n);
    if (!ref || !ref.id || !Number.isInteger(n) || n < 1 || n > 999 || n <= ref.m || horsJeu()) return;
    ref.m = n;
    envoyer({ [`stats/${site}/jours/${ref.jour}/journal/${ref.id}/m`]: n });
    const j = joueursValides(joueurs);
    if (j) ajouterJoueurs(ref, j);
  }

  // Première page : comptée un peu après l'ouverture, pour ne pas ralentir le site
  let pageInitiale = pageCourante;
  let lance = false;
  const lancer = () => setTimeout(() => { lance = true; compter(pageInitiale); }, 1500);
  if (document.readyState === 'complete') lancer();
  else addEventListener('load', lancer, { once: true });

  // Onglets d'un site d'une seule page : window.suivi.page('nom-de-l-onglet')
  window.suivi = {
    page(nom) {
      const page = nettoyer(nom);
      if (!page) return;
      if (!lance) { pageInitiale = page; pageCourante = page; return; } // pas encore compté : c'est cette page qui le sera
      compter(page);
    },
    action,
    manches,
  };
})();
