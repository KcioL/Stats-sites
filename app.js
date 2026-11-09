// Tableau de bord des visites de tous les sites qui utilisent suivi.js.
// Lit les compteurs rangés sous stats/<site>/ dans la Realtime Database de chaque site (voir config.js),
// par l'API REST de Firebase, sans bibliothèque,
// et va chercher les nouveaux chiffres toutes les ACTUALISATION secondes.
// Ajoute ?demo à l'adresse pour voir le tableau rempli de chiffres inventés.
import * as CONFIG from './config.js';

// Lecture tolérante de config.js : un réglage absent prend sa valeur par défaut
const SITES = CONFIG.SITES || {};
const ACTUALISATION = Number(CONFIG.ACTUALISATION) || 60;
// Images de fond : une pour les écrans en largeur, une pour les écrans en hauteur (style.css choisit)
const urlFond = (f) => `url("${String(f).replace(/"/g, '%22')}")`;
const fondPc = CONFIG.FOND_PC || CONFIG.FOND; // FOND : ancien réglage, une seule image pour tout
const fondTel = CONFIG.FOND_TELEPHONE || fondPc;
if (fondPc) document.documentElement.style.setProperty('--image-fond', urlFond(fondPc));
if (fondTel) document.documentElement.style.setProperty('--image-fond-tel', urlFond(fondTel));

const sansSlash = (u) => String(u || '').trim().replace(/\/+$/, '');

const FUSEAU = 'Europe/Paris';
const DEMO = new URLSearchParams(location.search).has('demo');
// Couleurs des sites sans couleur dans config.js, dans cet ordre
const COULEURS = ['#F2B632', '#4F8DE0', '#3FBF7F', '#9B7BEA', '#F0697C', '#2EC4C4', '#E58A3A', '#C46FD8'];

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR');
const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Dates (jours à l'heure de Paris, au format AAAA-MM-JJ) ----------
function jourDe(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
// Heure (0 à 23) à Paris. formatToParts : en français, format() donne « 21 h », pas « 21 »
function heureParis(date = new Date()) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: FUSEAU, hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).find((x) => x.type === 'hour');
  return Number(h && h.value) % 24;
}
const versDate = (cle) => { const [a, m, j] = cle.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j || 1, 12)); };
const versCle = (d) => d.toISOString().slice(0, 10);
function decaler(cle, jours) { const d = versDate(cle); d.setUTCDate(d.getUTCDate() + jours); return versCle(d); }
function derniersJours(n, fin = jourDe()) { return Array.from({ length: n }, (_, i) => decaler(fin, i - n + 1)); }
function derniersMois(n, fin = jourDe().slice(0, 7)) {
  const [a, m] = fin.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1)).toISOString().slice(0, 7));
}
const fmt = (cle, options) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options }).format(versDate(cle));

// ---------- Sites ----------
let donnees = {};         // { site: { jours, mois, total } }
let ordreSites = [];      // sites triés par nombre de visiteurs
let selection = 'tous';   // 'tous' ou un identifiant de site
try { selection = localStorage.getItem('tdb:site') || 'tous'; } catch (e) { /* stockage bloqué */ }

const joli = (id) => { const t = String(id).replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const nomSite = (id) => (SITES[id] && SITES[id].nom) || joli(id);
const toutesLesIds = () => [...new Set([...Object.keys(SITES), ...Object.keys(donnees)])].sort();
const couleurSite = (id) => (SITES[id] && SITES[id].couleur) || COULEURS[toutesLesIds().indexOf(id) % COULEURS.length];
const nomPage = (cle) => (selection === 'tous' ? nomSite(cle)
  : (SITES[selection] && SITES[selection].pages && SITES[selection].pages[cle]) || joli(cle));

// ---------- Vue affichée (un site, ou tous additionnés) ----------
let jours = {};   // { 'AAAA-MM-JJ': { visiteurs, vues, nouveaux, appli, appareils: {}, pages: {} } }
let mois = {};    // { 'AAAA-MM': { visiteurs } }
let total = {};   // { visiteurs, vues }

function preparerVue() {
  if (selection !== 'tous') {
    // un site déclaré dans config.js mais sans chiffres pour l'instant : tout à zéro
    ({ jours, mois, total } = donnees[selection] || { jours: {}, mois: {}, total: {} });
    return;
  }
  // Tous les sites : on additionne. Dans le classement, chaque « page » est un site.
  jours = {}; mois = {}; total = { visiteurs: 0, vues: 0 };
  for (const [id, d] of Object.entries(donnees)) {
    for (const [cle, j] of Object.entries(d.jours || {})) {
      const t = jours[cle] || (jours[cle] = { visiteurs: 0, vues: 0, nouveaux: 0, appli: 0, appareils: {}, pages: {} });
      // tous les compteurs s'additionnent (sauf les pages, remplacées par les sites, et les listes)
      additionner(t, j, ['pages', 'journal', 'bugs', 'contenus', 'temps', 'actions', 'erreurs']);
      if (j.visiteurs) t.pages[id] = j.visiteurs;
      // temps passé et erreurs : par site
      const tp = Object.values(j.temps || {}).reduce((a, x) => ({ s: a.s + ((x && x.s) || 0), n: a.n + ((x && x.n) || 0) }), { s: 0, n: 0 });
      if (tp.n) (t.temps || (t.temps = {}))[id] = tp;
      const er = Object.values(j.erreurs || {}).reduce((a, x) => a + (Number(x) || 0), 0);
      if (er) (t.erreurs || (t.erreurs = {}))[id] = er;
    }
    for (const [cle, m] of Object.entries(d.mois || {})) {
      (mois[cle] || (mois[cle] = { visiteurs: 0 })).visiteurs += m.visiteurs || 0;
    }
    total.visiteurs += (d.total && d.total.visiteurs) || 0;
    total.vues += (d.total && d.total.vues) || 0;
  }
}

// Additionne les compteurs de src dans cible (objets imbriqués), sauf les clés ignorées
function additionner(cible, src, ignorer = []) {
  for (const [k, x] of Object.entries(src || {})) {
    if (ignorer.includes(k)) continue;
    if (typeof x === 'number') cible[k] = (cible[k] || 0) + x;
    else if (x && typeof x === 'object') additionner(cible[k] && typeof cible[k] === 'object' ? cible[k] : (cible[k] = {}), x);
  }
  return cible;
}

const v = (cle, champ) => (jours[cle] && jours[cle][champ]) || 0;
const somme = (cles, champ) => cles.reduce((s, c) => s + v(c, champ), 0);
const sommeMois = (m, champ) => Object.keys(jours).filter((c) => c.startsWith(m)).reduce((s, c) => s + v(c, champ), 0);

// ---------- Rendu ----------
let periode = '7';
let animer = true;

function rendre() {
  preparerVue();
  const aujourdhui = jourDe();
  const n = periode === '12m' ? 365 : Number(periode);
  const cles = derniersJours(n);
  const avant = derniersJours(n, decaler(aujourdhui, -n));
  const moisCles = derniersMois(12);
  const tous = selection === 'tous';

  // En-tête
  const heure = heureParis();
  $('salut').textContent = heure >= 5 && heure < 18 ? 'Bonjour 👋' : 'Bonsoir 👋';
  const date = fmt(aujourdhui, { weekday: 'long', day: 'numeric', month: 'long' });
  const nbSites = Object.keys(donnees).length;
  $('sous-titre').textContent = !nbSites ? `Aucun site n'a encore envoyé de visites · ${date}`
    : tous ? `Voici ce qui se passe sur ${nbSites > 1 ? `tes ${nbSites} sites` : 'ton site'} · ${date}`
      : donnees[selection] ? `Voici ce qui se passe sur ${nomSite(selection)} · ${date}`
        : `${nomSite(selection)} n'a pas encore envoyé de visites · ${date}`;
  const adresse = !tous && SITES[selection] && SITES[selection].adresse;
  $('ouvrir').hidden = !adresse;
  if (adresse) $('ouvrir').href = adresse;
  rendreSites();

  // Chiffres clés
  chiffre('k-aujourdhui', v(aujourdhui, 'visiteurs'));
  texteEcart('e-aujourdhui', `hier : ${nf.format(v(decaler(aujourdhui, -1), 'visiteurs'))}`);
  spark('s-aujourdhui', derniersJours(periode === '7' ? 7 : 30).map((c) => v(c, 'visiteurs')));

  const valMois = (m) => (mois[m] && mois[m].visiteurs) || 0;
  chiffre('k-mois', valMois(moisCles[11]));
  texteEcart('e-mois', `${fmt(moisCles[10], { month: 'long' })} : ${nf.format(valMois(moisCles[10]))}`);
  spark('s-mois', moisCles.map(valMois));

  const serie = (champ) => (periode === '12m' ? moisCles.map((m) => sommeMois(m, champ)) : cles.map((c) => v(c, champ)));
  const comparable = periode !== '12m';
  const libPeriode = periode === '12m' ? '12 mois' : `${periode} jours`;
  $('h-vues').textContent = `Pages vues · ${libPeriode}`;
  $('h-nouveaux').textContent = `Nouveaux · ${libPeriode}`;
  chiffre('k-vues', somme(cles, 'vues'));
  ecart('e-vues', somme(cles, 'vues'), comparable ? somme(avant, 'vues') : null);
  spark('s-vues', serie('vues'));
  chiffre('k-nouveaux', somme(cles, 'nouveaux'));
  ecart('e-nouveaux', somme(cles, 'nouveaux'), comparable ? somme(avant, 'nouveaux') : null);
  const privesP = somme(cles, 'prives');
  $('e-nouveaux').title = privesP ? `Sans les ${privesP} visiteurs en navigation privée (leur navigateur oublie qu'ils sont déjà venus)` : '';
  spark('s-nouveaux', serie('nouveaux'));

  // Graphique principal
  if (periode === '12m') {
    graphe(moisCles.map((m, i) => ({
      cle: m, valeur: valMois(m), actuelle: i === 11,
      etiquette: fmt(m, { month: 'short' }).replace('.', ''),
      titre: fmt(m, { month: 'long', year: 'numeric' }),
      detail: `${nf.format(sommeMois(m, 'vues'))} pages vues`, clic: true, note: notesDe(m).join(' · '),
    })), 'mois');
  } else {
    graphe(cles.map((c, i) => ({
      cle: c, valeur: v(c, 'visiteurs'), actuelle: c === aujourdhui,
      etiquette: c === aujourdhui ? 'Auj.' : periode === '7' ? fmt(c, { weekday: 'short' }).replace('.', '')
        : ((n - 1 - i) % 5 === 0 ? fmt(c, { day: 'numeric' }) : ''),
      titre: c === aujourdhui ? "Aujourd'hui" : fmt(c, { weekday: 'long', day: 'numeric', month: 'long' }),
      detail: `${nf.format(v(c, 'vues'))} pages vues`, clic: true, note: notesDe(c).join(' · '),
    })), 'jour');
  }

  // Badge du graphique : visiteurs de la période comparés à la période d'avant
  const badge = $('badge-graphe');
  const visPeriode = somme(cles, 'visiteurs');
  const visAvant = somme(avant, 'visiteurs');
  if (comparable && visAvant) {
    const p = Math.round(((visPeriode - visAvant) / visAvant) * 100);
    badge.hidden = false;
    badge.className = `badge${p < 0 ? ' baisse' : ''}`;
    badge.textContent = `${p >= 0 ? '↗ +' : '↘ '}${p} % vs période d'avant`;
  } else {
    badge.hidden = true;
  }

  // Classement : pages du site, ou sites entre eux. Pour un site de jeux : par visiteurs ou par parties.
  const parCle = {};
  for (const c of cles) for (const [cle, nb] of Object.entries((jours[c] && jours[c].pages) || {})) parCle[cle] = (parCle[cle] || 0) + nb;
  const jeuxDuSite = avecParties(selection);
  $('choix-classement').hidden = !jeuxDuSite;
  $('choix-classement').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tri === triClassement)));
  const parParties = jeuxDuSite && triClassement === 'parties';
  const partiesDe = (cle) => cles.reduce((t, j) => t + parties(j, cle), 0);
  let tri;
  if (parParties) {
    // tous les jeux qui ont eu des visiteurs ou des parties (sauf la page d'accueil)
    const toutes = new Set(Object.keys(parCle));
    for (const c of cles) for (const parPage of Object.values((jours[c] && jours[c].actions) || {})) Object.keys(parPage || {}).forEach((pg) => toutes.add(pg));
    tri = [...toutes].filter((cle) => cle !== 'accueil').map((cle) => [cle, partiesDe(cle)]).sort((a, b) => b[1] - a[1] || (parCle[b[0]] || 0) - (parCle[a[0]] || 0));
  } else {
    // les pages qui n'ont que des actions (un PDF téléchargé sans ouvrir la page…) apparaissent aussi
    const avecActions = {};
    if (!tous) for (const c of cles) for (const parPage of Object.values((jours[c] && jours[c].actions) || {})) {
      for (const [pg, n] of Object.entries(parPage || {})) avecActions[pg] = (avecActions[pg] || 0) + n;
    }
    const toutes = new Set([...Object.keys(parCle), ...Object.keys(avecActions)]);
    tri = [...toutes].map((cle) => [cle, parCle[cle] || 0])
      .sort((a, b) => b[1] - a[1] || (avecActions[b[0]] || 0) - (avecActions[a[0]] || 0));
  }
  $('titre-classement').textContent = tous ? 'Sites les plus visités' : parParties ? 'Jeux les plus joués' : jeuxDuSite ? 'Jeux les plus ouverts' : 'Pages les plus vues';
  $('note-classement').textContent = tous ? `Visiteurs uniques par jour, cumulés sur ${libPeriode}`
    : parParties ? `Parties lancées sur ${libPeriode}` : `Visiteurs par page, cumulés sur ${libPeriode}`;
  const liste = $('classement');
  if (!tri.length) {
    liste.innerHTML = '<li class="vide" style="display:block">Pas encore de visites sur cette période.</li>';
  } else {
    const max = Math.max(1, tri[0][1]);
    const top = tri; // toute la liste : elle défile dans la carte
    const ACCENTS = ['#4F8DFF', '#F2B632', '#F0697C', '#9B7BEA', '#3FBF7F', '#2EC4C4', '#E58A3A'];
    liste.innerHTML = top.map(([cle, nb], i) => {
      const accent = tous ? couleurSite(cle) : ACCENTS[i % ACCENTS.length];
      const nbParties = tous ? 0 : partiesDe(cle);
      const nbVisiteurs = parParties ? (parCle[cle] || 0) : nb;
      const titre = tous ? `Voir ${nomSite(cle)}` : `Détail : ${nomPage(cle)}`;
      const txtParties = `<span class="parties">${nf.format(nbParties)} partie${nbParties > 1 ? 's' : ''}</span>`;
      const txtVisiteurs = `${nf.format(nbVisiteurs)} visiteur${nbVisiteurs > 1 ? 's' : ''}`;
      // sur un site de jeux, chaque jeu affiche toujours ses parties (même 0)
      const autres = tous ? {} : autresActions(cles, cle);
      const txtAutres = Object.entries(autres).map(([a, n]) => ` · <span class="parties">${nf.format(n)} ${echapper(nomAction(a, n))}</span>`).join('');
      const sous = (parParties ? txtVisiteurs : `${txtVisiteurs}${(nbParties || (jeuxDuSite && cle !== 'accueil')) ? ` · ${txtParties}` : ''}`) + txtAutres;
      return `<li data-cle="${echapper(cle)}" tabindex="0" role="button" title="${echapper(titre)}" style="--accent:${accent}">
        <span class="rang">${String(i + 1).padStart(2, '0')}</span>
        <span class="element">
          <span class="nom">${echapper(nomPage(cle))}</span>
          <span class="nombre">${nf.format(nb)}<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>
          <span class="sous">${sous}</span>
          <span class="jauge"><i style="--l:${Math.max(2, (nb / max) * 100)}%; --retard:${Math.min(i, 10) * 70}ms"></i></span>
        </span></li>`;
    }).join('');
    liste.scrollTop = 0;
    requestAnimationFrame(majFondusListe);
  }

  // Appareils
  let mobile = 0, ordi = 0;
  for (const c of cles) { const a = (jours[c] && jours[c].appareils) || {}; mobile += a.mobile || 0; ordi += a.ordi || 0; }
  const tot = mobile + ordi;
  const pct = (x) => (tot ? Math.round((x / tot) * 100) : 0);
  $('repartition').innerHTML = tot ? `<i class="mobile" style="width:${(mobile / tot) * 100}%"></i><i class="ordi" style="width:${(ordi / tot) * 100}%"></i>` : '';
  $('legende-appareils').innerHTML = [
    ['Téléphone ou tablette', 'var(--bleu)', mobile],
    ['Ordinateur', 'var(--violet)', ordi],
  ].map(([lib, coul, nb]) => `<li><span class="puce" style="background:${coul}"></span><span class="lib">${lib}</span><span class="pct">${pct(nb)} %</span><span class="nb">${nf.format(nb)}</span></li>`).join('');

  // Appli installée
  const visites = somme(cles, 'visiteurs');
  const appli = somme(cles, 'appli');
  const part = visites ? appli / visites : 0;
  $('pct-appli').textContent = visites ? `${Math.round(part * 100)} %` : '–';
  $('arc-appli').style.strokeDashoffset = String(314.16 * (1 - part));
  $('note-appli').textContent = visites ? `${nf.format(appli)} sur ${nf.format(visites)} ont ouvert le site depuis l'écran d'accueil` : 'Pas encore de visites sur cette période.';

  // Depuis le début
  $('t-visiteurs').textContent = nf.format(total.visiteurs || 0);
  $('t-vues').textContent = nf.format(total.vues || 0);
  const nbTotalParties = tous ? 0 : totalParties();
  $('t-parties-ligne').hidden = !nbTotalParties && !avecParties(selection);
  $('t-parties').textContent = nf.format(nbTotalParties);
  rendreFiche();
  rendreJour();
  const meilleur = Object.keys(jours).reduce((m, c) => (v(c, 'visiteurs') > v(m, 'visiteurs') ? c : m), aujourdhui);
  $('t-record').innerHTML = v(meilleur, 'visiteurs')
    ? `${nf.format(v(meilleur, 'visiteurs'))}<small>${fmt(meilleur, { day: 'numeric', month: 'long', year: 'numeric' })}</small>` : '–';

  rendreExtras(cles, libPeriode);
  montrerOnglet(onglet, false);

  // Liens pour ne pas se compter soi-même
  const avecAdresse = toutesLesIds().filter((id) => SITES[id] && SITES[id].adresse);
  $('moi').innerHTML = avecAdresse.length
    ? `<span>Ne pas compter tes visites (à ouvrir sur chaque appareil) :</span>${avecAdresse.map((id) =>
      `<a href="${echapper(SITES[id].adresse)}?suivi=off" target="_blank" rel="noopener">${echapper(nomSite(id))}</a>`).join('')}`
    : '<span>Pour ne pas compter tes visites : ouvre chaque site une fois avec <code>?suivi=off</code> à la fin de l\'adresse.</span>';

  if (animer) {
    animer = false;
    document.body.classList.add('anime');
    setTimeout(() => document.body.classList.remove('anime'), 1600);
    const grille = document.querySelector('.grille');
    grille.classList.remove('apparait');
    void grille.offsetWidth; // relance l'animation
    grille.classList.add('apparait');
    clearTimeout(grille._fin);
    grille._fin = setTimeout(() => grille.classList.remove('apparait'), 1200);
  }
}

// Liste des pages qui défile : fondu en haut / en bas tant qu'il reste des lignes à voir
function majFondusListe() {
  const l = $('classement');
  l.classList.toggle('suite-haut', l.scrollTop > 4);
  l.classList.toggle('suite-bas', l.scrollTop + l.clientHeight < l.scrollHeight - 4);
}
$('classement').addEventListener('scroll', majFondusListe, { passive: true });

// Barre des sites, à gauche
const ICONE_TOUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></svg>';
const lettreSite = (id) => (SITES[id] && SITES[id].icone) || nomSite(id).charAt(0).toUpperCase();
const logoSite = (id) => SITES[id] && SITES[id].logo;
// Logo du site (ou sa lettre si pas de logo, ou si l'image ne se charge pas)
const visuelSite = (id) => (logoSite(id)
  ? `<img class="logo" src="${echapper(logoSite(id))}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'lettre', textContent: this.dataset.lettre }))" data-lettre="${echapper(lettreSite(id))}">`
  : `<span class="lettre">${echapper(lettreSite(id))}</span>`);
// Petite phrase sous le nom du site, dans l'étiquette de la barre de gauche
function etatSite(id) {
  if (problemes.some((p) => p.base === baseDuSite(id))) return 'base inaccessible';
  if (!donnees[id]) return 'pas encore de visites';
  return `${nf.format(((donnees[id].jours || {})[jourDe()] || {}).visiteurs || 0)} aujourd'hui`;
}
function rendreSites() {
  const nav = $('sites');
  const ids = ordreSites;
  nav.hidden = ids.length < 1;
  const bouton = (id, contenu, nom, detail, couleur, classe = '') => `<button type="button" class="${classe}" data-site="${echapper(id)}" aria-pressed="${selection === id}" aria-label="${echapper(nom)}"${couleur ? ` style="--c:${couleur}"` : ''}>
      ${contenu}${couleur ? '<span class="point"></span>' : ''}<span class="info">${echapper(nom)}${detail ? `<small>${detail}</small>` : ''}</span></button>`;
  nav.innerHTML = (ids.length > 1 ? bouton('tous', ICONE_TOUS, 'Tous les sites', '', '') + '<span class="separateur"></span>' : '')
    + ids.map((id) => bouton(id, visuelSite(id), nomSite(id), etatSite(id), couleurSite(id), `${logoSite(id) ? 'avec-logo' : ''}${donnees[id] ? '' : ' sans-chiffres'}`)).join('');
  // Pastille ronde en haut à droite : le site affiché
  const av = $('avatar');
  av.classList.toggle('avec-logo', selection !== 'tous' && !!logoSite(selection));
  if (selection === 'tous') { av.textContent = '∑'; av.style.setProperty('--c', '#F2B632'); }
  else { av.innerHTML = visuelSite(selection); av.style.setProperty('--c', couleurSite(selection)); }
}
$('sites').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-site]');
  if (!b) return;
  selection = b.dataset.site;
  try { localStorage.setItem('tdb:site', selection); } catch (err) { /* stockage bloqué */ }
  animer = true;
  rendre();
});

// Nombre, avec un petit décompte quand la vue change
function chiffre(id, valeur) {
  const el = $(id);
  const jeton = (el._jeton = (el._jeton || 0) + 1); // un nouveau chiffre arrête le décompte en cours
  if (!animer || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = nf.format(valeur); return; }
  const debut = performance.now();
  const pas = (t) => {
    if (el._jeton !== jeton) return;
    const k = Math.min(1, (t - debut) / 900);
    el.textContent = nf.format(Math.round(valeur * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

function texteEcart(id, texte) { const el = $(id); el.className = 'ecart'; el.textContent = texte; }
function ecart(id, actuel, precedent) {
  const el = $(id);
  el.className = 'ecart';
  el.title = '';
  if (precedent === null) { el.textContent = ''; return; }
  if (!precedent) { el.textContent = actuel ? 'nouveau' : ''; return; }
  const p = Math.round(((actuel - precedent) / precedent) * 100);
  el.classList.add(p > 0 ? 'hausse' : p < 0 ? 'baisse' : 'egal');
  el.innerHTML = `${p > 0 ? '▲ +' : p < 0 ? '▼ ' : ''}${p} %<span class="suffixe"> vs période d'avant</span>`;
  el.title = `Période d'avant : ${nf.format(precedent)}`;
}

// Petite courbe en bas des cartes de chiffres clés
function spark(id, valeurs) {
  const svg = $(id);
  const max = Math.max(1, ...valeurs);
  const pts = valeurs.map((x, i) => [valeurs.length === 1 ? 50 : (i / (valeurs.length - 1)) * 100, 30 - (x / max) * 24]);
  const ligne = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  svg.innerHTML = `<defs><linearGradient id="deg-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <path class="aire" d="${ligne} L100,32 L0,32 Z" fill="url(#deg-${id})"/>
    <path class="ligne" d="${ligne}"/>`;
  svg.style.color = 'var(--teinte)';
}

// Graduation « ronde » au-dessus du maximum (4 lignes)
function maxRond(max) {
  if (max <= 4) return 4;
  const brut = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= brut) * 4;
}

// Graphique principal : visiteurs uniques par jour ou par mois
function graphe(points, unite) {
  $('titre-graphe').textContent = unite === 'mois' ? 'Visiteurs uniques par mois' : 'Visiteurs uniques par jour';
  const totalVal = points.reduce((s, p) => s + p.valeur, 0);
  $('note-graphe').textContent = `Moyenne : ${nf.format(Math.round(totalVal / points.length))} par ${unite}`;
  const rec = points.reduce((m, p) => (p.valeur > m.valeur ? p : m), points[0]);
  $('record').textContent = rec.valeur ? `Record : ${nf.format(rec.valeur)} · ${unite === 'mois' ? fmt(rec.cle, { month: 'short', year: 'numeric' }) : fmt(rec.cle, { day: 'numeric', month: 'short' })}` : '';
  dessinerBarres($('graphe'), points);
  $('tableau-corps').innerHTML = points.slice().reverse().map((p) => `<tr><td>${p.titre}</td><td>${nf.format(p.valeur)}</td></tr>`).join('');
}

// Barres dans un bloc .graphe (qui contient .axe, .barres et .bulle).
// Chaque point : { cle, valeur, actuelle, etiquette, titre, unite: ['visiteur', 'visiteurs'], detail }
function dessinerBarres(zone, points) {
  zone._derniers = points;
  zone._hauteur = zone.clientHeight;
  const max = maxRond(Math.max(0, ...points.map((p) => p.valeur)));
  const zoneHaut = zone.clientHeight - 26;
  zone.querySelector('.axe').innerHTML = [0, 1, 2, 3, 4].map((k) => `<div class="graduation${k ? '' : ' zero'}" style="top:${zoneHaut * (1 - k / 4)}px"><span>${nf.format((max / 4) * k)}</span></div>`).join('');
  const barres = zone.querySelector('.barres');
  const serre = points.length > 14;
  barres.classList.toggle('fin', serre);
  barres.style.setProperty('--ecart-barres', serre ? (innerWidth < 640 ? '2px' : '5px') : (innerWidth < 640 ? '8px' : '14px'));
  barres.innerHTML = points.map((p, i) => `
    <div class="colonne${p.actuelle ? ' actuelle' : ''}" data-i="${i}" style="--h:${(p.valeur / max) * zoneHaut}px; --retard:${i * (serre ? 18 : 60)}ms">
      <div class="zone"><div class="barre-v"></div>${p.actuelle && !serre ? `<span class="etiquette-valeur">${nf.format(p.valeur)}</span>` : ''}${p.note ? '<span class="repere" aria-hidden="true"></span>' : ''}</div>
      <span class="etiquette">${p.etiquette}</span>
    </div>`).join('');
  barres._points = points;
  zone.querySelector('.bulle').hidden = true;
}

// Si le bloc change de hauteur après coup (la carte voisine s'allonge…), on redessine les barres
const surveillance = typeof ResizeObserver === 'function' ? new ResizeObserver((entrees) => {
  for (const { target: zone } of entrees) {
    if (zone._derniers && zone.clientHeight && zone.clientHeight !== zone._hauteur) dessinerBarres(zone, zone._derniers);
  }
}) : null;

// Bulle au survol (ou au toucher) des barres d'un bloc .graphe
function brancherBulle(zone) {
  if (surveillance) surveillance.observe(zone);
  const bulle = zone.querySelector('.bulle');
  const montrer = (col) => {
    const p = zone.querySelector('.barres')._points[Number(col.dataset.i)];
    const [un, plusieurs] = p.unite || ['visiteur', 'visiteurs'];
    zone.querySelectorAll('.colonne.active').forEach((c) => c.classList.remove('active'));
    col.classList.add('active');
    bulle.innerHTML = `<span>${p.titre}</span><strong>${nf.format(p.valeur)} ${p.valeur > 1 ? plusieurs : un}</strong>${p.detail ? `<span>${p.detail}</span>` : ''}${p.note ? `<span class="note-bulle">📌 ${echapper(p.note)}</span>` : ''}${p.clic ? '<em>Clique pour le détail</em>' : ''}`;
    bulle.hidden = false;
    const rz = zone.getBoundingClientRect();
    const rb = col.querySelector('.barre-v').getBoundingClientRect();
    const x = Math.min(Math.max(rb.left + rb.width / 2 - rz.left, bulle.offsetWidth / 2), rz.width - bulle.offsetWidth / 2);
    bulle.style.left = `${x}px`;
    bulle.style.top = `${Math.max(rb.top - rz.top - 10, bulle.offsetHeight)}px`;
  };
  const cacher = () => { bulle.hidden = true; zone.querySelectorAll('.colonne.active').forEach((c) => c.classList.remove('active')); };
  zone.addEventListener('pointerover', (e) => { const col = e.target.closest('.colonne'); if (col) montrer(col); });
  zone.addEventListener('pointerdown', (e) => { const col = e.target.closest('.colonne'); if (col) montrer(col); });
  zone.addEventListener('pointerleave', cacher);
}

// ---------- Actions (parties jouées) ----------
// Les actions dont le nom commence par « parties » sont des parties : « parties-en-ligne », « parties-telephone »…
const MODES = { 'parties-en-ligne': 'En ligne', 'parties-telephone': 'Sur un seul téléphone' };
const nomMode = (a) => MODES[a] || joli(a.replace(/^parties-?/, '') || 'autres');
const estPartie = (a) => a.startsWith('parties');
// Parties d'une page un jour donné, en tout ou pour un mode
function parties(cle, page, mode = null) {
  const actions = (jours[cle] && jours[cle].actions) || {};
  let n = 0;
  for (const [a, parPage] of Object.entries(actions)) if (estPartie(a) && (!mode || a === mode)) n += (parPage && parPage[page]) || 0;
  return n;
}
const partiesMois = (m, page) => Object.keys(jours).filter((c) => c.startsWith(m)).reduce((s, c) => s + parties(c, page), 0);
const visiteursPage = (cle, page) => (jours[cle] && jours[cle].pages && jours[cle].pages[page]) || 0;
const visiteursPageMois = (m, page) => Object.keys(jours).filter((c) => c.startsWith(m)).reduce((s, c) => s + visiteursPage(c, page), 0);
// Autres actions (téléchargements…) : total par action pour une page, sur des jours donnés
function autresActions(cles, page) {
  const res = {};
  for (const c of cles) for (const [a, parPage] of Object.entries((jours[c] && jours[c].actions) || {})) {
    if (!estPartie(a) && parPage && parPage[page]) res[a] = (res[a] || 0) + parPage[page];
  }
  return res;
}
function nomAction(a, nb) {
  const n = SITES[selection] && SITES[selection].actions && SITES[selection].actions[a];
  if (Array.isArray(n)) return nb > 1 ? n[1] : n[0];
  return n || a.replace(/-/g, ' ');
}

// Site qui compte des parties : « parties: true » dans config.js, ou des parties déjà dans ses chiffres
function avecParties(id) {
  if (!id || id === 'tous') return false;
  if (SITES[id] && SITES[id].parties) return true;
  const actions = (donnees[id] && donnees[id].total && donnees[id].total.actions) || {};
  return Object.keys(actions).some(estPartie);
}
let triClassement = 'visiteurs';
$('choix-classement').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tri]');
  if (!b) return;
  triClassement = b.dataset.tri;
  animer = true;
  rendre();
});

function totalParties() {
  let n = 0;
  for (const [a, parPage] of Object.entries((total && total.actions) || {})) if (estPartie(a)) for (const nb of Object.values(parPage || {})) n += nb;
  return n;
}

// ---------- Fiche d'une page (clic dans le classement) ----------
let pageOuverte = null;
let serieFiche = 'parties';

function ouvrirFiche(page) {
  if (page !== pageOuverte) partieChoisie = null;
  pageOuverte = page;
  const fiche = $('fiche');
  serieFiche = null;
  rendreFiche(true);
  if (!fiche.open) fiche.showModal();
}

function rendreFiche(animerFiche = false) {
  const fiche = $('fiche');
  if (!pageOuverte || (!fiche.open && !animerFiche)) return;
  const page = pageOuverte;
  const aujourdhui = jourDe();
  const n = periode === '12m' ? 365 : Number(periode);
  const cles = derniersJours(n);
  const moisCles = derniersMois(12);
  const libPeriode = periode === '12m' ? '12 mois' : `${periode} jours`;

  const nbParties = cles.reduce((s, c) => s + parties(c, page), 0);
  const aDesParties = (avecParties(selection) && page !== 'accueil') || nbParties > 0 || Object.keys(jours).some((c) => parties(c, page) > 0);
  if (!serieFiche) serieFiche = aDesParties ? 'parties' : 'visiteurs';

  $('fiche-site').textContent = nomSite(selection);
  $('fiche-titre').textContent = nomPage(page);
  $('fiche-periode').textContent = `Sur ${libPeriode}`;

  const visiteurs = cles.reduce((s, c) => s + visiteursPage(c, page), 0);
  const stats = [
    ['Visiteurs', visiteurs, 'cumulés par jour'],
    ...(aDesParties ? [
      ['Parties jouées', nbParties, ''],
      ["Parties aujourd'hui", parties(aujourdhui, page), `hier : ${nf.format(parties(decaler(aujourdhui, -1), page))}`],
    ] : []),
  ];
  for (const [a, n] of Object.entries(autresActions(cles, page))) {
    const auj = autresActions([aujourdhui], page)[a] || 0;
    const lib = nomAction(a, 2);
    stats.push([lib.charAt(0).toUpperCase() + lib.slice(1), n, `aujourd'hui : ${nf.format(auj)}`]);
  }
  $('fiche-chiffres').innerHTML = stats.map(([lib, val, note]) => `<div class="mini"><span>${lib}</span><strong>${nf.format(val)}</strong>${note ? `<small>${note}</small>` : ''}</div>`).join('');

  // Répartition par mode (en ligne / sur un seul téléphone)
  const parMode = {};
  for (const c of cles) for (const [a, parPage] of Object.entries((jours[c] && jours[c].actions) || {})) {
    if (estPartie(a) && parPage && parPage[page]) parMode[a] = (parMode[a] || 0) + parPage[page];
  }
  const modes = Object.entries(parMode).sort((x, y) => y[1] - x[1]);
  const couleurs = { 'parties-en-ligne': 'var(--or)', 'parties-telephone': 'var(--bleu)' };
  const totModes = modes.reduce((s, [, nb]) => s + nb, 0);
  $('fiche-modes').hidden = !totModes;
  if (totModes) {
    $('fiche-modes').innerHTML = `<div class="repartition">${modes.map(([a, nb]) => `<i style="width:${(nb / totModes) * 100}%;background:${couleurs[a] || 'var(--violet)'}"></i>`).join('')}</div>
      <ul class="legende">${modes.map(([a, nb]) => `<li><span class="puce" style="background:${couleurs[a] || 'var(--violet)'}"></span><span class="lib">${echapper(nomMode(a))}</span><span class="pct">${Math.round((nb / totModes) * 100)} %</span><span class="nb">${nf.format(nb)}</span></li>`).join('')}</ul>`;
  }

  // Choix de la courbe
  $('fiche-choix').hidden = !aDesParties;
  $('fiche-choix').querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.serie === serieFiche)));
  const enParties = serieFiche === 'parties';
  const unite = enParties ? ['partie', 'parties'] : ['visiteur', 'visiteurs'];
  $('fiche-titre-graphe').textContent = `${enParties ? 'Parties jouées' : 'Visiteurs'} par ${periode === '12m' ? 'mois' : 'jour'}`;

  let points;
  if (periode === '12m') {
    points = moisCles.map((m, i) => ({
      cle: m, actuelle: i === 11, unite,
      valeur: enParties ? partiesMois(m, page) : visiteursPageMois(m, page),
      etiquette: fmt(m, { month: 'short' }).replace('.', ''),
      titre: fmt(m, { month: 'long', year: 'numeric' }),
    }));
  } else {
    points = cles.map((c, i) => {
      const detail = enParties
        ? Object.keys(MODES).map((a) => [a, parties(c, page, a)]).filter(([, nb]) => nb).map(([a, nb]) => `${nomMode(a)} : ${nf.format(nb)}`).join(' · ')
        : '';
      return {
        cle: c, actuelle: c === aujourdhui, unite, detail,
        valeur: enParties ? parties(c, page) : visiteursPage(c, page),
        etiquette: c === aujourdhui ? 'Auj.' : periode === '7' ? fmt(c, { weekday: 'short' }).replace('.', '')
          : ((n - 1 - i) % 5 === 0 ? fmt(c, { day: 'numeric' }) : ''),
        titre: c === aujourdhui ? "Aujourd'hui" : fmt(c, { weekday: 'long', day: 'numeric', month: 'long' }),
      };
    });
  }
  // Le graphique se dessine une fois la fenêtre affichée (il a besoin de sa hauteur)
  requestAnimationFrame(() => {
    if (animerFiche) { fiche.classList.add('anime'); setTimeout(() => fiche.classList.remove('anime'), 1400); }
    dessinerBarres($('fiche-graphe'), points);
    // Heures des parties (ou des téléchargements) de cette page, sur la période
    const entrees = journal(jours, cles, (e) => e.p === page);
    // Visible dès qu'il y a des heures, et toujours pour un jeu (avec un message tant qu'il n'y en a pas)
    const jeu = avecParties(selection) && page !== 'accueil';
    $('fiche-heures-bloc').hidden = !entrees.length && !jeu;
    $('fiche-heures').hidden = !entrees.length;
    $('fiche-journal-bloc').hidden = !entrees.length;
    if (!entrees.length && jeu) {
      $('fiche-heures-titre').textContent = 'À quelle heure on joue';
      $('fiche-heures-note').textContent = `Aucune heure enregistrée sur ${libPeriode} : l'heure est notée pour les parties lancées depuis la mise à jour du site de jeux (suivi.js et règles Firebase).`;
    }
    if (entrees.length) {
      const toutesParties = entrees.every((e) => estPartie(e.a));
      const unite = toutesParties ? ['partie', 'parties'] : [libAction(entrees[0].a, 1), libAction(entrees[0].a, 2)];
      $('fiche-heures-titre').textContent = toutesParties ? 'À quelle heure on joue' : `Heures des ${unite[1]}`;
      const pointe = dessinerHeures($('fiche-heures'), entrees, unite);
      $('fiche-heures-note').textContent = `${nf.format(entrees.length)} ${entrees.length > 1 ? unite[1] : unite[0]} sur ${libPeriode}${pointe !== null ? ` · heure de pointe : ${pointe}h – ${pointe + 1}h` : ''}`;
      // moyenne des manches, sur les parties où elles sont notées
      const unitM = toutesParties ? uniteManches(selection, page) : null;
      const avecM = unitM ? entrees.filter((e) => e.m) : [];
      const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
      if (avecM.length) {
        const moy = avecM.reduce((s, e) => s + e.m, 0) / avecM.length;
        $('fiche-heures-note').textContent += ` · ${nf1.format(moy)} ${unitM[1]} par partie en moyenne`;
      }
      const avecJ = toutesParties ? entrees.filter((e) => e.j) : [];
      if (avecJ.length) {
        const moy = avecJ.reduce((s, e) => { const c = lireJoueurs(e.j)[0]; return s + c.h + c.b; }, 0) / avecJ.length;
        $('fiche-heures-note').textContent += ` · ${nf1.format(moy)} joueurs par partie`;
      }
      entreesFiche = entrees;
      $('fiche-journal-titre').textContent = toutesParties ? 'Une par une · touche une partie' : 'Une par une';
      $('fiche-journal').innerHTML = pastillesJournal(entrees, true); // toutes les parties (liste qui défile)
    } else entreesFiche = [];
    rendrePartie();
  });
}

$('fiche-fermer').addEventListener('click', () => $('fiche').close());

// ---------- Journal : heure exacte de chaque partie (ou action) ----------
const fmtHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit' });
const fmtSeconde = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', second: '2-digit' });
// Heures à la suite, celles de la même minute regroupées : « 13:44 ×3, 14:02 »
function heuresGroupees(entrees) {
  const res = [];
  for (const e of entrees) {
    const h = fmtHeure.format(new Date(e.t));
    if (res.length && res[res.length - 1].h === h) res[res.length - 1].n++;
    else res.push({ h, n: 1 });
  }
  return res.map((x) => (x.n > 1 ? `${x.h} ×${x.n}` : x.h)).join(', ');
}
const heureDe = (t) => heureParis(new Date(t));
// Entrées du journal sur des jours donnés : [{ jour, a, p, t }], de la plus récente à la plus ancienne
function journal(objJours, cles, filtre = () => true) {
  const res = [];
  for (const c of cles) for (const [id, e] of Object.entries((objJours[c] && objJours[c].journal) || {})) {
    if (e && typeof e.t === 'number' && filtre(e)) res.push({ id, jour: c, a: e.a, p: e.p, t: e.t, m: typeof e.m === 'number' ? e.m : 0, j: typeof e.j === 'string' ? e.j : '', d: typeof e.d === 'number' ? e.d : 0, x: e.x === true });
  }
  return res.sort((x, y) => y.t - x.t);
}
const libAction = (a, n = 1) => (estPartie(a) ? (n > 1 ? 'parties' : 'partie') : nomAction(a, n));
// Histogramme sur 24 heures dans un bloc .graphe ; renvoie l'heure de pointe
function dessinerHeures(zone, entrees, unite) {
  const parHeure = Array(24).fill(0);
  for (const e of entrees) parHeure[heureDe(e.t)]++;
  const pointe = parHeure.indexOf(Math.max(...parHeure));
  dessinerBarres(zone, parHeure.map((n, h) => ({
    cle: String(h), valeur: n, actuelle: n > 0 && h === pointe, unite,
    etiquette: h % 3 === 0 ? `${h}h` : '',
    titre: `De ${h}h à ${h + 1}h`,
  })));
  return parHeure[pointe] ? pointe : null;
}
// Petites pastilles d'heures : « 14:32 · en ligne »
function pastillesJournal(entrees, avecJour) {
  const auj = jourDe();
  return entrees.map((e) => {
    const jour = !avecJour ? '' : e.jour === auj ? "aujourd'hui · " : e.jour === decaler(auj, -1) ? 'hier · ' : `${fmt(e.jour, { weekday: 'short', day: 'numeric' })} · `;
    const mode = estPartie(e.a) ? (MODES[e.a] ? nomMode(e.a).toLowerCase() : '') : nomAction(e.a, 1);
    const choisie = e.id === partieChoisie ? ' choisie' : '';
    return `<li><button type="button" class="pastille${choisie}" data-id="${echapper(e.id)}" title="${fmtSeconde.format(new Date(e.t))}"><span class="heure">${fmtHeure.format(new Date(e.t))}</span><span>${echapper(jour)}${echapper(mode)}</span></button></li>`;
  }).join('');
}

// ---------- Détail d'une partie : clic sur une heure dans la fiche d'un jeu ----------
let partieChoisie = null;   // id de l'entrée du journal affichée
let entreesFiche = [];      // entrées affichées dans la fiche
// Jeux en plusieurs manches (config.js : manches / mains du site) : [singulier, pluriel], ou null
function uniteManches(site, page) {
  const cfg = SITES[site] || {};
  if ((cfg.mains || []).includes(page)) return ['main', 'mains'];
  if ((cfg.manches || []).includes(page)) return ['manche', 'manches'];
  return null;
}
// Joueurs notés pour une partie : '4+1,3+1' → [{ h: 4, b: 1 }, { h: 3, b: 1 }] (une entrée par manche)
function lireJoueurs(j) {
  return String(j || '').split(',').filter(Boolean).map((x) => { const [h, b] = x.split('+').map(Number); return { h: h || 0, b: b || 0 }; });
}
const texteJoueurs = (c) => {
  const n = c.h + c.b;
  return `${nf.format(n)} joueur${n > 1 ? 's' : ''}${c.b ? ` (dont ${nf.format(c.b)} bot${c.b > 1 ? 's' : ''})` : ''}`;
};
// Joueurs manche par manche, les manches à la suite avec les mêmes joueurs regroupées : « Manches 1 à 12 : 4 joueurs »
function joueursParManche(liste, unite) {
  const groupes = [];
  liste.forEach((c, i) => {
    const g = groupes[groupes.length - 1];
    if (g && g.c.h === c.h && g.c.b === c.b) g.fin = i + 1;
    else groupes.push({ debut: i + 1, fin: i + 1, c });
  });
  const nom = (pl) => (pl ? unite[1] : unite[0]).replace(/^./, (x) => x.toUpperCase());
  return groupes.map((g) => `<li><span class="manches-plage">${g.debut === g.fin ? `${nom(false)} ${g.debut}` : `${nom(true)} ${g.debut} à ${g.fin}`}</span><span>${texteJoueurs(g.c)}</span></li>`).join('');
}
function rendrePartie() {
  const zone = $('fiche-partie');
  const e = entreesFiche.find((x) => x.id === partieChoisie);
  if (!e) { zone.hidden = true; return; }
  const partie = estPartie(e.a);
  const unite = partie ? uniteManches(selection, e.p) : null;
  // numéro de la partie dans la journée (de ce jeu)
  const duJour = entreesFiche.filter((x) => x.jour === e.jour && estPartie(x.a) === partie).sort((x, y) => x.t - y.t);
  const rang = duJour.findIndex((x) => x.id === e.id) + 1;
  const lignes = [
    ['Jour', fmt(e.jour, { weekday: 'long', day: 'numeric', month: 'long' })],
    ['Heure', fmtSeconde.format(new Date(e.t))],
  ];
  if (partie && MODES[e.a]) lignes.push(['Mode', nomMode(e.a)]);
  const joueurs = lireJoueurs(e.j);
  if (joueurs.length) {
    lignes.push([joueurs.length > 1 ? 'Joueurs au départ' : 'Joueurs', texteJoueurs(joueurs[0])]);
    const der = joueurs[joueurs.length - 1];
    if (joueurs.length > 1 && (der.h !== joueurs[0].h || der.b !== joueurs[0].b)) lignes.push([`Joueurs à la dernière ${unite ? unite[0] : 'manche'}`, texteJoueurs(der)]);
  } else if (partie) lignes.push(['Joueurs', 'pas noté (partie d’avant la mise à jour)']);
  if (partie && e.d) lignes.push(['Durée', dureeTexte(e.d)]);
  if (partie && (e.d || e.x)) lignes.push(['Fin', e.x ? 'allée jusqu’au bout' : 'abandonnée en cours de route']);
  if (partie) lignes.push(['Partie du jour', `${nf.format(rang)}${rang === 1 ? 're' : 'e'} sur ${nf.format(duJour.length)}`]);
  let grand = '';
  if (unite) {
    grand = e.m
      ? `<div class="partie-chiffre"><strong>${nf.format(e.m)}</strong><span>${e.m > 1 ? unite[1] : unite[0]} jouée${e.m > 1 ? 's' : ''}</span></div>`
      : `<p class="note">Nombre de ${unite[1]} pas noté : partie lancée avant la mise à jour du site de jeux.</p>`;
  } else if (partie) {
    grand = '<p class="note">Jeu sans manches : une partie se joue d’une traite.</p>';
  }
  zone.innerHTML = `<div class="partie-entete"><h4>${partie ? 'Partie' : echapper(joli(nomAction(e.a, 1)))} de ${fmtHeure.format(new Date(e.t))}</h4>`
    + `<button type="button" class="rond verre petit-rond" id="partie-fermer" aria-label="Fermer le détail">×</button></div>`
    + grand
    + `<dl class="partie-infos">${lignes.map(([k, v]) => `<div><dt>${k}</dt><dd>${echapper(v)}</dd></div>`).join('')}</dl>`
    + (joueurs.length > 1 && unite ? `<h5 class="titre-manches">Joueurs ${unite[0] === 'main' ? 'main' : 'manche'} par ${unite[0]}</h5><ul class="manches-joueurs">${joueursParManche(joueurs, unite)}</ul>` : '');
  zone.hidden = false;
}
$('fiche-journal').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-id]');
  if (!b) return;
  partieChoisie = partieChoisie === b.dataset.id ? null : b.dataset.id;
  $('fiche-journal').querySelectorAll('.pastille').forEach((x) => x.classList.toggle('choisie', x.dataset.id === partieChoisie));
  rendrePartie();
  if (partieChoisie) $('fiche-partie').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
$('fiche-partie').addEventListener('click', (ev) => {
  if (!ev.target.closest('#partie-fermer')) return;
  partieChoisie = null;
  $('fiche-journal').querySelectorAll('.pastille.choisie').forEach((x) => x.classList.remove('choisie'));
  rendrePartie();
});

// ---------- Détail d'un jour (ou d'un mois) : clic sur une barre du graphique principal ----------
let jourOuvert = null;   // 'AAAA-MM-JJ' ou 'AAAA-MM'

function ouvrirJour(cle) {
  jourOuvert = cle;
  rendreJour(true);
  if (!$('jour').open) $('jour').showModal();
}

// Totaux d'actions sur des jours donnés, dans un objet « jours » (d'un site, ou de la vue)
function actionsDans(objJours, cles) {
  const parties = {}; const autres = {}; let nbParties = 0; const modes = {};
  for (const c of cles) for (const [a, parPage] of Object.entries((objJours[c] && objJours[c].actions) || {})) {
    for (const [pg, n] of Object.entries(parPage || {})) {
      if (estPartie(a)) { parties[pg] = (parties[pg] || 0) + n; nbParties += n; modes[a] = (modes[a] || 0) + n; }
      else { (autres[a] = autres[a] || {})[pg] = (autres[a][pg] || 0) + n; }
    }
  }
  return { parties, autres, nbParties, modes };
}

function rendreJour(forcer = false) {
  const dlg = $('jour');
  if (!jourOuvert || (!dlg.open && !forcer)) return;
  const cle = jourOuvert;
  const enMois = cle.length === 7;
  const aujourdhui = jourDe();
  const cles = enMois ? Object.keys(jours).filter((c) => c.startsWith(cle)) : [cle];
  const tous = selection === 'tous';

  $('jour-site').textContent = `${tous ? 'Tous les sites' : nomSite(selection)} · ${enMois ? 'détail du mois' : 'détail du jour'}`;
  const notesJour = notesDe(cle);
  $('jour-note').hidden = !notesJour.length;
  $('jour-note').textContent = notesJour.length ? `📌 ${notesJour.join(' · ')}` : '';
  $('jour-titre').textContent = enMois ? fmt(cle, { month: 'long', year: 'numeric' })
    : cle === aujourdhui ? `Aujourd'hui · ${fmt(cle, { day: 'numeric', month: 'long' })}` : fmt(cle, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  // flèches : pas après aujourd'hui / ce mois-ci
  const [an, mo] = cle.split('-').map(Number);
  const suivant = enMois ? new Date(Date.UTC(an, mo, 1)).toISOString().slice(0, 7) : decaler(cle, 1);
  $('jour-apres').disabled = enMois ? suivant > aujourdhui.slice(0, 7) : suivant > aujourdhui;

  // Chiffres du jour
  const visiteurs = enMois ? ((mois[cle] && mois[cle].visiteurs) || 0) : v(cle, 'visiteurs');
  const somme2 = (champ) => cles.reduce((t, c) => t + v(c, champ), 0);
  const stats = [
    [enMois ? 'Visiteurs uniques du mois' : 'Visiteurs uniques', visiteurs, ''],
    ['Pages vues', somme2('vues'), ''],
    ['Nouveaux visiteurs', somme2('nouveaux'), ''],
  ];
  let act = { parties: {}, autres: {}, nbParties: 0, modes: {} };
  if (tous) {
    for (const d of Object.values(donnees)) {
      const a = actionsDans(d.jours || {}, cles);
      act.nbParties += a.nbParties;
      for (const [m, n] of Object.entries(a.modes)) act.modes[m] = (act.modes[m] || 0) + n;
      for (const [nom, parPage] of Object.entries(a.autres)) for (const [pg, n] of Object.entries(parPage)) ((act.autres[nom] = act.autres[nom] || {})[pg] = (act.autres[nom][pg] || 0) + n);
    }
  } else {
    act = actionsDans(jours, cles);
  }
  if (act.nbParties || avecParties(selection)) {
    const COURT = { 'parties-en-ligne': 'en ligne', 'parties-telephone': 'téléphone' };
    const detailModes = Object.entries(act.modes).sort((x, y) => y[1] - x[1]).map(([m, n]) => `${COURT[m] || nomMode(m).toLowerCase()} : ${nf.format(n)}`).join(' · ');
    stats.push(['Parties jouées', act.nbParties, detailModes]);
  }
  for (const [nom, parPage] of Object.entries(act.autres)) {
    const n = Object.values(parPage).reduce((t, x) => t + x, 0);
    const lib = nomAction(nom, 2);
    stats.push([lib.charAt(0).toUpperCase() + lib.slice(1), n, '']);
  }
  $('jour-chiffres').innerHTML = stats.map(([lib, val, note]) => `<div class="mini"><span>${lib}</span><strong>${nf.format(val)}</strong>${note ? `<small>${note}</small>` : ''}</div>`).join('');

  // Détail : pages du site (ou sites, dans la vue « Tous les sites »)
  let lignes;
  if (tous) {
    $('jour-titre-liste').textContent = 'Par site';
    lignes = Object.entries(donnees).map(([id, d]) => {
      const vis = cles.reduce((t, c) => t + ((d.jours && d.jours[c] && d.jours[c].visiteurs) || 0), 0);
      const a = actionsDans(d.jours || {}, cles);
      const sous = [];
      if (a.nbParties) sous.push(`<span class="parties">${nf.format(a.nbParties)} partie${a.nbParties > 1 ? 's' : ''}</span>`);
      return { cle: id, nom: nomSite(id), valeur: vis, sous, accent: couleurSite(id), poids: a.nbParties };
    });
  } else {
    $('jour-titre-liste').textContent = avecParties(selection) ? 'Par jeu' : 'Par page';
    const parPage = {};
    for (const c of cles) for (const [pg, n] of Object.entries((jours[c] && jours[c].pages) || {})) parPage[pg] = (parPage[pg] || 0) + n;
    const toutes = new Set([...Object.keys(parPage), ...Object.keys(act.parties), ...Object.values(act.autres).flatMap((o) => Object.keys(o))]);
    lignes = [...toutes].map((pg) => {
      const sous = [];
      const np = act.parties[pg] || 0;
      if (np || (avecParties(selection) && pg !== 'accueil')) sous.push(`<span class="parties">${nf.format(np)} partie${np > 1 ? 's' : ''}</span>`);
      let poids = np;
      for (const [nom, pp] of Object.entries(act.autres)) if (pp[pg]) { sous.push(`<span class="parties">${nf.format(pp[pg])} ${echapper(nomAction(nom, pp[pg]))}</span>`); poids += pp[pg]; }
      // heures des parties / actions de cette page ce jour-là
      if (!enMois) {
        const heures = journal(jours, cles, (e) => e.p === pg).reverse();
        if (heures.length) sous.push(`<span class="heures">à ${heuresGroupees(heures)}</span>`);
      }
      return { cle: pg, nom: nomPage(pg), valeur: parPage[pg] || 0, sous, poids };
    });
  }
  lignes.sort((a, b) => b.valeur - a.valeur || b.poids - a.poids);
  const ACCENTS_J = ['#4F8DFF', '#F2B632', '#F0697C', '#9B7BEA', '#3FBF7F', '#2EC4C4', '#E58A3A'];
  lignes.forEach((l, i) => { if (!tous) l.accent = ACCENTS_J[i % ACCENTS_J.length]; });
  const max = Math.max(1, ...lignes.map((l) => l.valeur));
  const liste = $('jour-liste');
  // Heure par heure : toutes les parties / actions de la journée (ou du mois)
  const entreesJour = tous
    ? Object.values(donnees).flatMap((d) => journal(d.jours || {}, cles))
    : journal(jours, cles);
  $('jour-heures-bloc').hidden = !entreesJour.length;
  if (entreesJour.length) {
    const toutesParties = entreesJour.every((e) => estPartie(e.a));
    const unite = toutesParties ? ['partie', 'parties'] : ['action', 'actions'];
    const pointe = dessinerHeures($('jour-heures'), entreesJour, unite);
    $('jour-heures-titre').textContent = toutesParties ? 'Heure par heure' : 'Heure par heure (parties et téléchargements)';
    $('jour-heures-note').textContent = pointe !== null ? `Heure de pointe : ${pointe}h – ${pointe + 1}h` : '';
  }
  liste.innerHTML = lignes.filter((l) => l.valeur || l.poids).length ? lignes.filter((l) => l.valeur || l.poids).map((l, i) => `
    <li data-cle="${echapper(l.cle)}" tabindex="0" role="button" style="--accent:${l.accent}">
      <span class="rang">${String(i + 1).padStart(2, '0')}</span>
      <span class="element">
        <span class="nom">${echapper(l.nom)}</span>
        <span class="nombre">${nf.format(l.valeur)}<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>
        <span class="sous">${nf.format(l.valeur)} visiteur${l.valeur > 1 ? 's' : ''}${l.sous.map((x) => ` · ${x}`).join('')}</span>
        <span class="jauge"><i style="--l:${Math.max(2, (l.valeur / max) * 100)}%"></i></span>
      </span></li>`).join('') : '<li class="vide" style="display:block">Aucune visite ce jour-là.</li>';
  liste.scrollTop = 0;
  requestAnimationFrame(() => {
    liste.classList.toggle('suite-bas', liste.scrollTop + liste.clientHeight < liste.scrollHeight - 4);
    liste.classList.remove('suite-haut');
  });
}

function decalerJour(sens) {
  if (!jourOuvert) return;
  if (jourOuvert.length === 7) {
    const [a, m] = jourOuvert.split('-').map(Number);
    jourOuvert = new Date(Date.UTC(a, m - 1 + sens, 1)).toISOString().slice(0, 7);
  } else {
    jourOuvert = decaler(jourOuvert, sens);
  }
  rendreJour(true);
}
$('jour-avant').addEventListener('click', () => decalerJour(-1));
$('jour-apres').addEventListener('click', () => decalerJour(1));
$('jour-fermer').addEventListener('click', () => $('jour').close());
$('jour').addEventListener('click', (e) => { if (e.target === $('jour')) $('jour').close(); });
$('jour').addEventListener('close', () => { jourOuvert = null; });
$('jour').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') decalerJour(-1);
  if (e.key === 'ArrowRight' && !$('jour-apres').disabled) decalerJour(1);
});
$('jour-liste').addEventListener('scroll', (e) => {
  const l = e.currentTarget;
  l.classList.toggle('suite-haut', l.scrollTop > 4);
  l.classList.toggle('suite-bas', l.scrollTop + l.clientHeight < l.scrollHeight - 4);
}, { passive: true });
// Clic sur une ligne : fiche de la page (ou, dans la vue « Tous les sites », ce site)
$('jour-liste').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-cle]');
  if (!li) return;
  $('jour').close();
  if (selection === 'tous') {
    selection = li.dataset.cle;
    try { localStorage.setItem('tdb:site', selection); } catch (err) { /* stockage bloqué */ }
    animer = true;
    rendre();
  } else {
    ouvrirFiche(li.dataset.cle);
  }
});
// Clic sur une barre du graphique principal
$('graphe').addEventListener('click', (e) => {
  const col = e.target.closest('.colonne');
  if (!col) return;
  const p = $('graphe').querySelector('.barres')._points[Number(col.dataset.i)];
  if (p && p.clic) ouvrirJour(p.cle);
});
$('fiche').addEventListener('click', (e) => { if (e.target === $('fiche')) $('fiche').close(); }); // clic à côté
$('fiche').addEventListener('close', () => { pageOuverte = null; });
$('fiche-choix').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-serie]');
  if (!b) return;
  serieFiche = b.dataset.serie;
  rendreFiche(true);
});

$('classement').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('li[data-cle]')) { e.preventDefault(); e.target.click(); }
});

// Clic dans le classement : fiche de la page, ou (vue « Tous les sites ») passage sur le site
$('classement').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-cle]');
  if (!li) return;
  if (selection === 'tous') {
    selection = li.dataset.cle;
    try { localStorage.setItem('tdb:site', selection); } catch (err) { /* stockage bloqué */ }
    animer = true;
    rendre();
    scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    ouvrirFiche(li.dataset.cle);
  }
});

// ---------- Période ----------
document.querySelectorAll('[data-periode]').forEach((b) => b.addEventListener('click', () => {
  periode = b.dataset.periode;
  document.querySelectorAll('[data-periode]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  animer = true;
  rendre();
}));
let attente;
addEventListener('resize', () => { clearTimeout(attente); attente = setTimeout(rendre, 150); });

// ---------- Boutons du haut ----------
$('actualiser').addEventListener('click', async () => {
  if (DEMO) { animer = true; rendre(); return; }
  const b = $('actualiser');
  b.classList.add('tourne');
  await actualiser();
  b.classList.remove('tourne');
});

// Exporter : les chiffres de la vue affichée, en CSV (s'ouvre dans Excel ou Numbers)
$('exporter').addEventListener('click', () => {
  preparerVue();
  const enMois = periode === '12m';
  const lignes = enMois
    ? derniersMois(12).map((m) => [m, (mois[m] && mois[m].visiteurs) || 0, sommeMois(m, 'vues'), sommeMois(m, 'nouveaux'),
      Object.keys(jours).filter((c) => c.startsWith(m)).reduce((t, c) => t + Object.keys((jours[c] && jours[c].pages) || {}).reduce((u, pg) => u + parties(c, pg), 0), 0)])
    : derniersJours(Number(periode)).map((c) => [c, v(c, 'visiteurs'), v(c, 'vues'), v(c, 'nouveaux'),
      Object.keys((jours[c] && jours[c].pages) || {}).reduce((u, pg) => u + parties(c, pg), 0)]);
  const entete = [enMois ? 'Mois' : 'Jour', 'Visiteurs uniques', 'Pages vues', 'Nouveaux visiteurs', 'Parties jouées'];
  const csv = '\ufeff' + [entete, ...lignes].map((l) => l.join(';')).join('\r\n');
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  lien.download = `stats-${selection === 'tous' ? 'tous-les-sites' : selection}-${periode === '12m' ? '12-mois' : `${periode}-jours`}-${jourDe()}.csv`;
  document.body.appendChild(lien);
  lien.click();
  setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
});

// Barre du haut : fond en verre dès qu'on a fait défiler la page
const barreHaut = document.querySelector('.haut');
const majBarreHaut = () => barreHaut.classList.toggle('defile', scrollY > 8);
addEventListener('scroll', majBarreHaut, { passive: true });
majBarreHaut();

// ======================================================================
// Nouveaux onglets : audience, contenus, appareils en détail, santé
// ======================================================================
const PALETTE = ['#4F8DFF', '#F2B632', '#F0697C', '#9B7BEA', '#3FBF7F', '#2EC4C4', '#E58A3A', '#C46FD8', '#8FA3B8'];
const NOMS_SOURCES = {
  direct: 'Accès direct', appli: "Appli (écran d'accueil)", google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo',
  qwant: 'Qwant', ecosia: 'Ecosia', yahoo: 'Yahoo', brave: 'Brave', instagram: 'Instagram', messenger: 'Messenger',
  facebook: 'Facebook', whatsapp: 'WhatsApp', x: 'X (Twitter)', linkedin: 'LinkedIn', github: 'GitHub', youtube: 'YouTube',
  tiktok: 'TikTok', reddit: 'Reddit', discord: 'Discord', snapchat: 'Snapchat', pinterest: 'Pinterest', telegram: 'Telegram',
  chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', 'e-mail': 'E-mail',
};
const NOMS_SYSTEMES = { ios: 'iPhone / iPad', android: 'Android', windows: 'Windows', macos: 'Mac', linux: 'Linux', chromeos: 'ChromeOS', autre: 'Autre' };
const NOMS_NAVIGATEURS = {
  chrome: 'Chrome', safari: 'Safari', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung Internet', opera: 'Opera',
  instagram: "Dans l'appli Instagram", facebook: "Dans l'appli Facebook", autre: 'Autre',
};
const NOMS_RETOURS = [['veille', 'Le lendemain'], ['semaine', 'Dans la semaine'], ['mois', 'Dans le mois'], ['plus', 'Plus d’un mois après']];
const NOMS_TYPES = {
  serie: ['série', 'Séries'], manga: ['manga', 'Mangas'], anime: ['anime', 'Animes'], recherche: ['recherche', 'Recherches'],
  projet: ['projet', 'Projets'], itineraire: ['itinéraire', 'Itinéraires'], col: ['col', 'Cols'], ajout: ['ajout', 'Ajoutés'],
};
const JOURS_SEMAINE = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

// Le nom d'une source : « lien-portfolio » → « Lien depuis Portfolio », « exemple-com » → « exemple.com »
function nomSource(s) {
  if (NOMS_SOURCES[s]) return NOMS_SOURCES[s];
  if (s.startsWith('lien-')) {
    const depot = s.slice(5);
    const id = Object.keys(SITES).find((k) => {
      const a = SITES[k].adresse || '';
      try { return new URL(a).pathname.split('/').filter(Boolean)[0]?.toLowerCase() === depot; } catch (e) { return k === depot; }
    }) || (SITES[depot] ? depot : null);
    return `Lien depuis ${id ? nomSite(id) : joli(depot)}`;
  }
  return /-[a-z]{2,6}$/.test(s) ? s.replace(/-([a-z]{2,6})$/, '.$1') : joli(s);
}
const dureeTexte = (sec) => {
  sec = Math.round(sec);
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s && m < 10 ? `${m} min ${String(s).padStart(2, '0')}` : `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
// Somme sur des jours d'un compteur imbriqué : sommeObjet(cles, 'sources') → { instagram: 12, … }
function sommeObjet(cles, champ, sousChamp = null) {
  const res = {};
  for (const c of cles) {
    let o = jours[c] && jours[c][champ];
    if (sousChamp && o) o = o[sousChamp];
    for (const [k, n] of Object.entries(o || {})) {
      if (typeof n === 'number') res[k] = (res[k] || 0) + n;
      else if (n && typeof n === 'object') additionner(res[k] || (res[k] = {}), n);
    }
  }
  return res;
}
// Barre de répartition + légende (comme la carte Appareils)
function repartition(idBarre, idLegende, entrees, { max = 7, noms = {}, unite = '' } = {}) {
  const tri = Object.entries(entrees).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const tot = tri.reduce((s, [, n]) => s + n, 0);
  let lignes = tri.slice(0, max);
  if (tri.length > max) lignes = [...lignes.slice(0, max - 1), ['__autres', tri.slice(max - 1).reduce((s, [, n]) => s + n, 0)]];
  const nom = (k) => (k === '__autres' ? 'Autres' : typeof noms === 'function' ? noms(k) : (noms[k] || joli(k)));
  $(idBarre).innerHTML = tot ? lignes.map(([, n], i) => `<i style="width:${(n / tot) * 100}%;background:${PALETTE[i % PALETTE.length]}"></i>`).join('') : '';
  $(idLegende).innerHTML = tot ? lignes.map(([k, n], i) => `<li><span class="puce" style="background:${PALETTE[i % PALETTE.length]}"></span><span class="lib">${echapper(nom(k))}</span><span class="pct">${Math.round((n / tot) * 100)} %</span><span class="nb">${nf.format(n)}${unite}</span></li>`).join('')
    : '<li class="vide-doux">Pas encore de chiffres sur cette période.</li>';
  return tot;
}
// Liste avec barres : [{ nom, valeur, texte, sous, couleur }]
function barresListe(id, lignes, vide = 'Pas encore de chiffres sur cette période.') {
  const max = Math.max(1, ...lignes.map((l) => l.valeur));
  $(id).innerHTML = lignes.length ? lignes.map((l, i) => `<li style="--accent:${l.couleur || PALETTE[i % PALETTE.length]}">
      <span class="lib">${echapper(l.nom)}${l.sous ? `<small>${l.sous}</small>` : ''}</span>
      <span class="val">${l.texte}</span>
      <span class="jauge"><i style="--l:${Math.max(2, (l.valeur / max) * 100)}%"></i></span></li>`).join('')
    : `<li class="vide-doux">${vide}</li>`;
}
const carteVide = (classe, vide) => { const c = document.querySelector(`.grille > .${classe}`); if (c) c.dataset.vide = vide ? '1' : ''; };

// ---------- Notes sur le graphique (config.js : NOTES) ----------
const NOTES = Array.isArray(CONFIG.NOTES) ? CONFIG.NOTES.filter((n) => n && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && n.texte) : [];
if (DEMO && !NOTES.length) NOTES.push({ date: decaler(jourDe(), -5), texte: 'Yam’s en ligne', site: 'jeux' }, { date: decaler(jourDe(), -12), texte: 'Publication Instagram' });
// Notes d'un jour (ou d'un mois 'AAAA-MM') pour la vue affichée
function notesDe(cle) {
  return NOTES.filter((n) => n.date.startsWith(cle) && (selection === 'tous' || !n.site || n.site === selection)).map((n) => n.texte);
}

function rendreExtras(cles, libPeriode) {
  const tous = selection === 'tous';
  const visiteurs = somme(cles, 'visiteurs');
  const visites = somme(cles, 'visites');

  // --- D'où ils viennent ---
  const nbSources = repartition('repartition-sources', 'legende-sources', sommeObjet(cles, 'sources'), { noms: nomSource });
  $('note-sources').textContent = nbSources ? `${nf.format(nbSources)} visites sur ${libPeriode}` : `Visites sur ${libPeriode}`;

  // --- Quand ils viennent : jour de la semaine × heure ---
  const grille = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cles) {
    const js = (versDate(c).getUTCDay() + 6) % 7;
    for (const [h, n] of Object.entries((jours[c] && jours[c].heures) || {})) if (grille[js][Number(h)] !== undefined) grille[js][Number(h)] += n;
  }
  const maxC = Math.max(0, ...grille.flat());
  let pic = null;
  grille.forEach((l, j) => l.forEach((n, h) => { if (n && n === maxC && !pic) pic = [j, h]; }));
  $('grille-chaleur').innerHTML = `<span></span>${Array.from({ length: 24 }, (_, h) => `<span class="h">${h % 3 === 0 ? `${h}h` : ''}</span>`).join('')}`
    + grille.map((l, j) => `<span class="j">${JOURS_SEMAINE[j]}</span>${l.map((n, h) => `<i style="--a:${maxC ? (n / maxC) : 0}" title="${JOURS_SEMAINE[j]} ${h}h–${h + 1}h : ${nf.format(n)} visite${n > 1 ? 's' : ''}"></i>`).join('')}`).join('');
  $('note-chaleur').textContent = pic ? `Visites sur ${libPeriode} · le plus de monde : le ${['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'][pic[0]]} vers ${pic[1]}h` : `Pas encore de visites notées sur ${libPeriode}`;

  // --- Fidélité ---
  const revenus = somme(cles, 'revenus');
  const nouveaux = somme(cles, 'nouveaux');
  const chiffres = [
    ['Visiteurs qui reviennent', visiteurs && revenus ? `${Math.round((revenus / visiteurs) * 100)} %` : '–', revenus ? `${nf.format(revenus)} sur ${nf.format(visiteurs)}` : ''],
    ['Visites par visiteur', visiteurs && visites ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(visites / visiteurs) : '–', 'par jour'],
    ['Nouveaux', visiteurs ? `${Math.round((nouveaux / visiteurs) * 100)} %` : '–', `${nf.format(nouveaux)} jamais venus`],
  ];
  const prives = somme(cles, 'prives');
  if (prives) chiffres.push(['Navigation privée', `${Math.round((prives / visiteurs) * 100)} %`, `${nf.format(prives)} visiteur${prives > 1 ? 's' : ''}, pas comptés comme nouveaux`]);
  $('chiffres-fidelite').innerHTML = chiffres.map(([l, v, s]) => `<div class="mini"><span>${l}</span><strong>${v}</strong><small>${s}</small></div>`).join('');
  const retours = sommeObjet(cles, 'retours');
  const totR = Object.values(retours).reduce((s, n) => s + n, 0);
  $('legende-retours').innerHTML = totR ? NOMS_RETOURS.map(([k, l], i) => `<li><span class="puce" style="background:${PALETTE[i]}"></span><span class="lib">${l}</span><span class="pct">${Math.round(((retours[k] || 0) / totR) * 100)} %</span><span class="nb">${nf.format(retours[k] || 0)}</span></li>`).join('')
    : '<li class="vide-doux">Pas encore de visiteurs revenus sur cette période.</li>';
  $('note-fidelite').textContent = `Sur ${libPeriode}`;

  // --- Systèmes et navigateurs ---
  repartition('repartition-systemes', 'legende-systemes', sommeObjet(cles, 'systemes'), { noms: NOMS_SYSTEMES });
  repartition('repartition-navigateurs', 'legende-navigateurs', sommeObjet(cles, 'navigateurs'), { noms: NOMS_NAVIGATEURS });

  // --- Temps passé ---
  const temps = sommeObjet(cles, 'temps');
  const lignesT = Object.entries(temps).filter(([, x]) => x && x.n).map(([k, x]) => ({ k, moy: x.s / x.n, n: x.n }))
    .sort((a, b) => b.n - a.n).slice(0, 40);
  barresListe('liste-temps', lignesT.map((l) => ({ nom: nomPage(l.k), valeur: l.moy, texte: dureeTexte(l.moy), sous: `${nf.format(l.n)} affichage${l.n > 1 ? 's' : ''}`, couleur: tous ? couleurSite(l.k) : null })));
  const totS = Object.values(temps).reduce((s, x) => s + ((x && x.s) || 0), 0);
  $('badge-temps').hidden = !(totS && visites);
  if (totS && visites) $('badge-temps').textContent = `${dureeTexte(totS / visites)} par visite`;
  $('note-temps').textContent = tous ? `Temps moyen par page, par site, sur ${libPeriode}` : `Temps moyen à l'écran par page, sur ${libPeriode}`;

  // --- Les plus consultés (séries, recherches…) ---
  const contenus = tous ? {} : sommeObjet(cles, 'contenus');
  const types = Object.keys(contenus).sort((a, b) => (a === 'recherche') - (b === 'recherche') || a.localeCompare(b));
  carteVide('contenus', !types.length);
  if (types.length) {
    if (!types.includes(typeContenu)) typeContenu = types[0];
    $('choix-contenus').hidden = types.length < 2;
    $('choix-contenus').innerHTML = types.map((ty) => `<button role="tab" data-type="${echapper(ty)}" aria-selected="${ty === typeContenu}">${echapper((NOMS_TYPES[ty] || [ty, joli(ty)])[1])}</button>`).join('');
    const noms = (donnees[selection] && donnees[selection].noms && donnees[selection].noms[typeContenu]) || {};
    const lignes = Object.entries(contenus[typeContenu] || {}).sort((a, b) => b[1] - a[1]).slice(0, 50);
    barresListe('liste-contenus', lignes.map(([id, n]) => ({ nom: noms[id] || joli(id), valeur: n, texte: nf.format(n) })));
    $('titre-contenus').textContent = typeContenu === 'recherche' ? 'Les plus recherchés' : typeContenu === 'ajout' ? 'Les plus ajoutés' : 'Les plus consultés';
    $('note-contenus').textContent = typeContenu === 'recherche' ? `Recherches faites sur ${libPeriode}` : typeContenu === 'ajout' ? `Ajouts aux collections et listes, sur ${libPeriode}` : `Consultations sur ${libPeriode} (une par visite)`;
  }

  // --- Parties en détail (site de jeux) ---
  const jeuxSite = !tous && avecParties(selection);
  carteVide('jeux', !jeuxSite);
  if (jeuxSite) rendreCarteJeux(cles, libPeriode);

  // --- Santé : erreurs ---
  const bugs = [];
  for (const id of tous ? Object.keys(donnees) : [selection]) {
    const dj = (donnees[id] && donnees[id].jours) || {};
    for (const c of cles) for (const [k, b] of Object.entries((dj[c] && dj[c].bugs) || {})) if (b && b.m) bugs.push({ ...b, id: k, site: id, jour: c });
  }
  bugs.sort((a, b) => (b.t || 0) - (a.t || 0));
  const nbErr = somme(cles, 'erreurs') || Object.values(sommeObjet(cles, 'erreurs')).reduce((s, n) => s + n, 0);
  const errParPage = sommeObjet(cles, 'erreurs');
  const totErr = Object.values(errParPage).reduce((s, n) => s + n, 0) || nbErr;
  // le même message regroupé
  const groupes = new Map();
  for (const b of bugs) {
    const cle = `${b.site}|${b.m}`;
    const g = groupes.get(cle);
    if (g) { g.n++; g.pages.add(b.p); } else groupes.set(cle, { ...b, n: 1, pages: new Set([b.p]) });
  }
  const fmtQuand = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  $('liste-bugs').innerHTML = groupes.size ? [...groupes.values()].slice(0, 60).map((g) => `<li>
      <span class="bug-message">${echapper(g.m)}</span>
      <span class="bug-infos">${tous ? `<b style="color:${couleurSite(g.site)}">${echapper(nomSite(g.site))}</b> · ` : ''}${[...g.pages].map((p) => echapper(tous ? (SITES[g.site] && SITES[g.site].pages && SITES[g.site].pages[p]) || joli(p) : nomPage(p))).join(', ')}${g.f && g.f !== '-' ? ` · <code>${echapper(g.f)}</code>` : ''} · dernière fois ${g.t ? fmtQuand.format(new Date(g.t)) : fmt(g.jour, { day: 'numeric', month: 'short' })}</span>
      ${g.n > 1 ? `<span class="bug-nb">×${nf.format(g.n)}</span>` : ''}</li>`).join('')
    : `<li class="vide-doux">${totErr ? 'Le détail des erreurs n’a pas été noté.' : `Aucune erreur sur ${libPeriode} 🎉`}</li>`;
  $('note-erreurs').textContent = `Erreurs JavaScript chez les visiteurs, sur ${libPeriode}`;
  $('badge-erreurs').hidden = !totErr;
  $('badge-erreurs').className = 'badge baisse';
  $('badge-erreurs').textContent = `${nf.format(totErr)} erreur${totErr > 1 ? 's' : ''}`;
  const alerte = $('alerte-sante');
  const errAuj = Object.values(sommeObjet([jourDe()], 'erreurs')).reduce((s, n) => s + n, 0);
  alerte.hidden = !errAuj;
  alerte.textContent = errAuj > 9 ? '9+' : String(errAuj);
  alerte.title = `${errAuj} erreur${errAuj > 1 ? 's' : ''} aujourd'hui`;
  barresListe('liste-erreurs-pages', Object.entries(errParPage).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([k, n]) => ({ nom: nomPage(k), valeur: n, texte: nf.format(n), couleur: tous ? couleurSite(k) : '#F0697C' })), `Aucune page touchée sur ${libPeriode}.`);
  $('note-erreurs-pages').textContent = tous ? 'Erreurs par site' : 'Erreurs par page';
  // jours sans erreur
  let sansErreur = 0;
  for (let c = jourDe(); sansErreur < 400; c = decaler(c, -1)) {
    if (!jours[c]) { if (sansErreur > 0 || c < Object.keys(jours).sort()[0]) break; }
    if (Object.values((jours[c] && jours[c].erreurs) || {}).reduce((s, n) => s + n, 0)) break;
    sansErreur++;
  }
  $('note-erreurs-pages').textContent += totErr ? '' : sansErreur > 1 ? ` · aucune depuis ${sansErreur} jours` : '';

  // --- Santé : temps de chargement ---
  const charge = sommeObjet(cles, 'chargement');
  $('nb-chargement').textContent = charge.n ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(charge.ms / charge.n / 1000)} s` : '–';
  $('note-chargement').textContent = charge.n ? `En moyenne, sur ${nf.format(charge.n)} ouvertures (${libPeriode})` : `Pas encore mesuré sur ${libPeriode}`;
  spark('s-chargement', cles.slice(-30).map((c) => { const x = (jours[c] && jours[c].chargement) || {}; return x.n ? x.ms / x.n : 0; }));
  const parSite = tous ? Object.keys(donnees).map((id) => {
    const x = cles.reduce((a, c) => { const y = (donnees[id].jours[c] && donnees[id].jours[c].chargement) || {}; return { ms: a.ms + (y.ms || 0), n: a.n + (y.n || 0) }; }, { ms: 0, n: 0 });
    return [id, x];
  }).filter(([, x]) => x.n) : [];
  $('legende-chargement').innerHTML = parSite.sort((a, b) => b[1].ms / b[1].n - a[1].ms / a[1].n).map(([id, x]) => {
    const s = x.ms / x.n / 1000;
    return `<li><span class="puce" style="background:${couleurSite(id)}"></span><span class="lib">${echapper(nomSite(id))}</span><span class="pct">${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(s)} s</span><span class="nb">${s < 1.5 ? 'rapide' : s < 3 ? 'correct' : 'lent'}</span></li>`;
  }).join('');

  // --- Records ---
  const semaines = {};
  for (const c of Object.keys(jours)) {
    const d = versDate(c); const lundi = decaler(c, -((d.getUTCDay() + 6) % 7));
    semaines[lundi] = (semaines[lundi] || 0) + v(c, 'visiteurs');
  }
  const mSem = Object.entries(semaines).sort((a, b) => b[1] - a[1])[0];
  $('t-semaine').innerHTML = mSem && mSem[1] ? `${nf.format(mSem[1])}<small>semaine du ${fmt(mSem[0], { day: 'numeric', month: 'long' })}</small>` : '–';
  const mMois = Object.entries(mois).map(([k, x]) => [k, (x && x.visiteurs) || 0]).sort((a, b) => b[1] - a[1])[0];
  $('t-mois').innerHTML = mMois && mMois[1] ? `${nf.format(mMois[1])}<small>${fmt(mMois[0], { month: 'long', year: 'numeric' })}</small>` : '–';
  let serie = 0;
  for (let c = v(jourDe(), 'visiteurs') ? jourDe() : decaler(jourDe(), -1); v(c, 'visiteurs') > 0 && serie < 999; c = decaler(c, -1)) serie++;
  $('t-serie').innerHTML = serie ? `${nf.format(serie)}<small>jour${serie > 1 ? 's' : ''}${v(jourDe(), 'visiteurs') ? ', aujourd’hui compris' : ''}</small>` : '–';

  rendreDirect();
  rendreEtatSuivi();
}
// ---------- État du suivi : chaque site envoie-t-il les nouveaux chiffres ? ----------
let testRegles = {};   // { base: 'ok' | 'refus' | 'erreur' | 'en-cours' }
function rendreEtatSuivi() {
  const auj = jourDe();
  const lignes = Object.keys(SITES).map((id) => {
    const dj = (donnees[id] && donnees[id].jours) || {};
    const avecVisites = Object.keys(dj).filter((c) => dj[c] && dj[c].visiteurs).sort();
    const dernier = avecVisites[avecVisites.length - 1];
    const recents = avecVisites.filter((c) => c >= decaler(auj, -2));
    const nouveau = recents.some((c) => dj[c].visites || dj[c].sources || dj[c].heures);
    const base = baseDuSite(id);
    const regle = testRegles[base];
    let etatS, texte;
    if (regle === 'refus') { etatS = 'ko'; texte = 'Règles « stats » pas à jour sur sa base : colle le bloc de regles-stats.txt dans la console Firebase, puis Publier.'; }
    else if (!dernier) { etatS = 'attente'; texte = 'Aucune visite pour l’instant.'; }
    else if (!recents.length) { etatS = 'attente'; texte = `Pas de visite depuis le ${fmt(dernier, { day: 'numeric', month: 'long' })}.`; }
    else if (nouveau) { etatS = 'ok'; texte = 'À jour : visites, sources, temps passé, direct…'; }
    else { etatS = 'ko'; texte = regle === 'ok' ? 'Les visites arrivent avec l’ancien suivi.js : remplace-le sur le site (ou attends 10 min que GitHub Pages et le cache se mettent à jour).' : 'Seules les visites arrivent : l’ancien suivi.js est encore en ligne, ou les règles ne sont pas publiées. Clique sur « Vérifier les règles ».'; }
    const regleTxt = regle === 'ok' ? '✓ règles publiées' : regle === 'refus' ? '✗ règles pas publiées' : regle === 'en-cours' ? 'vérification…' : regle === 'erreur' ? 'base injoignable' : '';
    return `<li class="etat-${etatS}"><i></i><span class="lib"><b>${echapper(nomSite(id))}</b><small>${echapper(texte)}</small></span>${regleTxt ? `<span class="regle">${regleTxt}</span>` : ''}</li>`;
  });
  $('liste-etat').innerHTML = lignes.join('');
}
// Vérifie que chaque base accepte les nouveaux chiffres : on y écrit une « visite en cours » de test,
// effacée aussitôt (rien ne s'ajoute aux compteurs).
async function verifierRegles() {
  if (DEMO) { Object.keys(SITES).forEach((id) => { testRegles[baseDuSite(id)] = 'ok'; }); rendreEtatSuivi(); return; }
  const parBase = {};
  Object.keys(SITES).forEach((id) => { const b = baseDuSite(id); if (b && !parBase[b]) parBase[b] = id; });
  Object.keys(parBase).forEach((b) => { testRegles[b] = 'en-cours'; });
  rendreEtatSuivi();
  await Promise.all(Object.entries(parBase).map(async ([base, id]) => {
    const chemin = `${base}/stats/${id}/direct/test${Date.now().toString(36)}`;
    try {
      const r = await fetch(`${chemin}.json`, { method: 'PUT', body: JSON.stringify({ p: 'test-regles', t: { '.sv': 'timestamp' } }) });
      testRegles[base] = r.ok ? 'ok' : (r.status === 401 || r.status === 403) ? 'refus' : 'erreur';
      if (r.ok) fetch(`${chemin}.json`, { method: 'DELETE' }).catch(() => {});
    } catch (e) { testRegles[base] = 'erreur'; }
  }));
  rendreEtatSuivi();
}
$('verifier-regles').addEventListener('click', verifierRegles);
let reglesVerifiees = false;

let typeContenu = '';
$('choix-contenus').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (!b || b.dataset.type === typeContenu) return;
  typeContenu = b.dataset.type;
  rendre();
});

// ---------- Parties en détail : durée, parties finies, rejouées ----------
function rendreCarteJeux(cles, libPeriode) {
  const entrees = journal(jours, cles, (e) => estPartie(e.a)).map((e) => {
    const brut = jours[e.jour].journal[e.id] || {};
    return { ...e, d: typeof brut.d === 'number' ? brut.d : 0, x: brut.x === true };
  });
  const notees = entrees.filter((e) => e.d || e.x);
  const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  // rejouées : une partie du même jeu lancée moins de 5 min après la fin de la précédente
  const parJeu = {};
  entrees.slice().sort((a, b) => a.t - b.t).forEach((e) => (parJeu[e.p] = parJeu[e.p] || []).push(e));
  let rejouees = 0, possibles = 0;
  const stats = Object.entries(parJeu).map(([p, l]) => {
    let rj = 0;
    l.forEach((e, i) => {
      if (!e.d || i === l.length - 1) return;
      possibles++;
      if (l[i + 1].t - (e.t + e.d * 1000) < 5 * 60000) { rj++; rejouees++; }
    });
    const avecD = l.filter((e) => e.d);
    const fin = l.filter((e) => e.d || e.x);
    return { p, n: l.length, moy: avecD.length ? avecD.reduce((s, e) => s + e.d, 0) / avecD.length : 0, finies: fin.length ? fin.filter((e) => e.x).length / fin.length : null, rj };
  }).sort((a, b) => b.n - a.n);
  const avecD = notees.filter((e) => e.d);
  const moyD = avecD.length ? avecD.reduce((s, e) => s + e.d, 0) / avecD.length : 0;
  const finies = notees.length ? notees.filter((e) => e.x).length / notees.length : null;
  $('chiffres-jeux').innerHTML = [
    ['Durée moyenne', moyD ? dureeTexte(moyD) : '–', avecD.length ? `sur ${nf.format(avecD.length)} partie${avecD.length > 1 ? 's' : ''}` : 'pas encore notée'],
    ['Allées jusqu’au bout', finies !== null ? `${Math.round(finies * 100)} %` : '–', finies !== null ? `${Math.round((1 - finies) * 100)} % abandonnées` : ''],
    ['Rejouées aussitôt', possibles ? `${Math.round((rejouees / possibles) * 100)} %` : '–', possibles ? 'nouvelle partie dans les 5 min' : ''],
  ].map(([l, v, s]) => `<div class="mini"><span>${l}</span><strong>${v}</strong><small>${s}</small></div>`).join('');
  $('note-jeux').textContent = notees.length ? `Parties de ${libPeriode} (durée et fin notées depuis la mise à jour du site de jeux)` : `Durée et fin des parties : notées pour les parties lancées depuis la mise à jour du site de jeux`;
  $('tableau-jeux').innerHTML = stats.length ? `<table><thead><tr><th>Jeu</th><th>Parties</th><th>Durée moy.</th><th>Finies</th><th>Rejouées</th></tr></thead><tbody>${stats.map((s) => `<tr><td>${echapper(nomPage(s.p))}</td><td>${nf.format(s.n)}</td><td>${s.moy ? dureeTexte(s.moy) : '–'}</td><td>${s.finies !== null ? `${Math.round(s.finies * 100)} %` : '–'}</td><td>${nf.format(s.rj)}</td></tr>`).join('')}</tbody></table>` : '';
  void nf1;
}

// ---------- En direct : les visites en cours (lues toutes les 20 secondes) ----------
let enDirect = {};   // { site: [{ p, t }] }
async function chargerDirect() {
  if (DEMO) return;
  const res = {};
  await Promise.all(Object.keys(SITES).map(async (id) => {
    const base = baseDuSite(id);
    if (!base) return;
    try {
      const d = (await lire(base, `stats/${id}/direct`)) || {};
      const limite = Date.now() - 2 * 60000;
      res[id] = Object.values(d).filter((x) => x && typeof x.t === 'number' && x.t > limite && x.p !== 'test-regles');
    } catch (e) { /* base sans les nouvelles règles : rien */ }
  }));
  enDirect = res;
  rendreDirect();
}
function rendreDirect() {
  const ids = selection === 'tous' ? Object.keys(enDirect) : [selection];
  const lignes = [];
  for (const id of ids) for (const x of enDirect[id] || []) lignes.push({ id, p: x.p });
  $('nb-direct').textContent = nf.format(lignes.length);
  $('nb-direct').classList.toggle('actif', lignes.length > 0);
  $('note-direct').textContent = lignes.length
    ? `${lignes.length > 1 ? 'Personnes' : 'Personne'} sur ${selection === 'tous' ? 'tes sites' : nomSite(selection)} en ce moment`
    : `Personne sur ${selection === 'tous' ? 'tes sites' : nomSite(selection)} en ce moment`;
  const compte = {};
  for (const l of lignes) { const k = `${l.id}|${l.p}`; compte[k] = (compte[k] || 0) + 1; }
  $('liste-direct').innerHTML = Object.entries(compte).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => {
    const [id, p] = k.split('|');
    const nomP = (SITES[id] && SITES[id].pages && SITES[id].pages[p]) || joli(p);
    return `<li><i style="background:${couleurSite(id)}"></i><span>${selection === 'tous' ? `${echapper(nomSite(id))} · ` : ''}${echapper(nomP)}</span><b>${n}</b></li>`;
  }).join('');
}

// ---------- Onglets ----------
const ONGLETS = ['apercu', 'pages', 'audience', 'appareils', 'sante'];
let onglet = 'apercu';
try { const o = (location.hash || '').slice(1) || localStorage.getItem('tdb:onglet'); if (ONGLETS.includes(o)) onglet = o; } catch (e) { /* rien */ }
function montrerOnglet(nom, animer = true) {
  onglet = nom;
  // en ouvrant Santé : on vérifie une fois que chaque base accepte les nouveaux chiffres
  if (nom === 'sante' && !reglesVerifiees) { reglesVerifiees = true; setTimeout(verifierRegles, 0); }
  document.body.dataset.onglet = nom;
  document.querySelectorAll('.pilule[data-onglet]').forEach((p) => {
    p.classList.toggle('actif', p.dataset.onglet === nom);
    p.setAttribute('aria-selected', String(p.dataset.onglet === nom));
    // téléphone : l'onglet choisi reste visible dans la barre qui défile
    if (p.dataset.onglet === nom && animer && p.parentElement.scrollWidth > p.parentElement.clientWidth) p.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  });
  document.querySelectorAll('.grille > [data-onglets]').forEach((c) => {
    c.hidden = !c.dataset.onglets.split(' ').includes(nom) || c.dataset.vide === '1';
  });
  try { localStorage.setItem('tdb:onglet', nom); history.replaceState(null, '', `#${nom}`); } catch (e) { /* rien */ }
  if (animer) {
    const grille = document.querySelector('.grille');
    grille.classList.remove('apparait'); void grille.offsetWidth; grille.classList.add('apparait');
    clearTimeout(grille._fin); grille._fin = setTimeout(() => grille.classList.remove('apparait'), 1200);
  }
}
document.querySelectorAll('.pilule[data-onglet]').forEach((p) => p.addEventListener('click', () => {
  if (p.dataset.onglet !== onglet) { montrerOnglet(p.dataset.onglet); scrollTo({ top: 0, behavior: 'smooth' }); }
}));
montrerOnglet(onglet, false);

// ---------- Chargement ----------
function etat(classe, texte) { const el = $('etat'); el.className = `direct verre ${classe}`; el.querySelector('span').textContent = texte; }

class Refus extends Error {}
async function lire(base, chemin, params = {}) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${base}/${chemin}.json${q ? `?${q}` : ''}`, { cache: 'no-store' });
  if (r.status === 401 || r.status === 403) throw new Refus();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Les bases à lire : celle de chaque site de config.js (plusieurs sites peuvent partager une base)
const baseDuSite = (id) => sansSlash(SITES[id] && SITES[id].base);
const BASES = [...new Set(Object.values(SITES).map((s) => sansSlash(s.base)).filter(Boolean))];
let problemes = [];   // bases qui n'ont pas répondu : [{ base, refus }]

async function charger() {
  const debut = decaler(jourDe(), -400);
  const nouvelles = {};
  problemes = [];
  await Promise.all(BASES.map(async (base) => {
    try {
      const liste = (await lire(base, 'stats', { shallow: 'true' })) || {};
      // Les sites rangés dans cette base (un site déclaré avec une autre base n'est pas compté deux fois)
      const ids = Object.keys(liste).filter((id) => !SITES[id] || baseDuSite(id) === base);
      await Promise.all(ids.map(async (id) => {
        const [j, m, t, noms] = await Promise.all([
          lire(base, `stats/${id}/jours`, { orderBy: '"$key"', startAt: `"${debut}"` }),
          lire(base, `stats/${id}/mois`, { orderBy: '"$key"', limitToLast: '24' }),
          lire(base, `stats/${id}/total`),
          lire(base, `stats/${id}/noms`).catch(() => ({})),
        ]);
        nouvelles[id] = { jours: j || {}, mois: m || {}, total: t || {}, noms: noms || {} };
      }));
    } catch (e) {
      problemes.push({ base, refus: e instanceof Refus });
    }
  }));
  if (BASES.length && problemes.length === BASES.length) throw problemes.some((p) => p.refus) ? new Refus() : new Error('hors ligne');
  donnees = nouvelles;
}

// Ordre de la barre de gauche : celui de config.js, puis les sites trouvés dans les bases sans y être déclarés.
// Un site déclaré apparaît même s'il n'a encore envoyé aucune visite.
function trierSites() {
  ordreSites = [...new Set([...Object.keys(SITES), ...Object.keys(donnees)])];
  if (selection !== 'tous' && !ordreSites.includes(selection)) selection = 'tous';
  if (ordreSites.length === 1) selection = ordreSites[0];
}

let enCours = false;
let dejaCharge = false;
async function actualiser() {
  if (enCours) return;
  enCours = true;
  try {
    await charger();
    trierSites();
    if (!dejaCharge) { dejaCharge = true; animer = true; }
    rendre();
    const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    if (problemes.length) {
      etat('erreur', `${problemes.length} base${problemes.length > 1 ? 's' : ''} sans réponse · ${heure}`);
      $('etat').title = problemes.map((p) => `${p.base} : ${p.refus ? 'accès refusé (règles stats pas publiées ?)' : 'pas de réponse'}`).join('\n');
    } else {
      etat('ok', `À jour · ${heure}`);
      $('etat').title = '';
    }
  } catch (e) {
    etat('erreur', e instanceof Refus ? 'Accès refusé : publie les règles stats' : 'Hors ligne');
  } finally {
    enCours = false;
  }
}

brancherBulle($('graphe'));
brancherBulle($('fiche-graphe'));
brancherBulle($('fiche-heures'));
brancherBulle($('jour-heures'));

// Démo des nouveaux compteurs : visites, heures, sources, fidélité, systèmes, temps passé, erreurs, contenus
const DEMO_CONTENUS = {
  mangazone: { manga: { 'one-piece': 'One Piece', 'jujutsu-kaisen': 'Jujutsu Kaisen', 'chainsaw-man': 'Chainsaw Man', 'blue-lock': 'Blue Lock', berserk: 'Berserk', 'vinland-saga': 'Vinland Saga', 'dandadan': 'Dandadan', 'death-note': 'Death Note' },
    recherche: { 'one-piece': 'one piece', 'frieren': 'frieren', 'kagurabachi': 'kagurabachi', 'naruto': 'naruto' } },
  animezone: { anime: { '21': 'One Piece', '52991': 'Frieren', '40748': 'Jujutsu Kaisen', '57334': 'Dandadan', '16498': 'L’Attaque des Titans', '38000': 'Demon Slayer', '51009': 'Solo Leveling' },
    recherche: { 'solo-leveling': 'solo leveling', 'frieren': 'frieren', 'chainsaw': 'chainsaw', 'spy-x-family': 'spy x family' } },
  portfolio: { projet: { 'projet-r': 'Clustering R', 'projet-vba': 'Reporting RH VBA', 'projet-twitch': 'Analyse Data Twitch', 'projet-cook': 'App Cook & Save' } },
};
const DEMO_SOURCES = {
  jeux: { direct: 40, whatsapp: 22, appli: 18, instagram: 10, google: 6, discord: 4 },
  pyrolos: { direct: 30, google: 25, instagram: 18, facebook: 10, whatsapp: 9, appli: 4 },
  mangazone: { direct: 30, appli: 25, google: 22, reddit: 8, instagram: 8, discord: 4 },
  animezone: { direct: 28, appli: 24, google: 26, tiktok: 10, x: 6, discord: 4 },
  portfolio: { linkedin: 38, direct: 24, google: 18, github: 12, 'e-mail': 6, 'lien-jeux-vol': 2 },
};
function completerDemo(id, j, c, visiteurs, mobile, alea, pages, mod) {
  const tirer = (poids) => { const tot = Object.values(poids).reduce((s, x) => s + x, 0); let r = alea() * tot; for (const [k, x] of Object.entries(poids)) { r -= x; if (r <= 0) return k; } return Object.keys(poids)[0]; };
  const ajouter = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  j.visites = Math.round(visiteurs * (1.15 + alea() * 0.35));
  j.heures = {}; j.sources = {};
  const we = [0, 6].includes(versDate(c).getUTCDay());
  for (let k = 0; k < j.visites; k++) {
    const h = alea() < 0.55 ? 18 + Math.floor(alea() * 5) : (we ? 10 : 12) + Math.floor(alea() * 7);
    ajouter(j.heures, h % 24);
    ajouter(j.sources, tirer(DEMO_SOURCES[id] || { direct: 1 }));
  }
  j.revenus = Math.round((visiteurs - j.nouveaux) * (0.8 + alea() * 0.2));
  j.retours = {};
  for (let k = 0; k < j.revenus; k++) ajouter(j.retours, tirer({ veille: 40, semaine: 35, mois: 18, plus: 7 }));
  j.systemes = {}; j.navigateurs = {};
  for (let k = 0; k < mobile; k++) { const ios = alea() < 0.58; ajouter(j.systemes, ios ? 'ios' : 'android'); ajouter(j.navigateurs, ios ? (alea() < 0.85 ? 'safari' : 'instagram') : (alea() < 0.75 ? 'chrome' : 'samsung')); }
  for (let k = 0; k < visiteurs - mobile; k++) { ajouter(j.systemes, tirer({ windows: 70, macos: 22, linux: 8 })); ajouter(j.navigateurs, tirer({ chrome: 60, edge: 18, firefox: 12, safari: 10 })); }
  j.temps = {};
  const base = { jeux: 520, pyrolos: 140, mangazone: 210, animezone: 240, portfolio: 75 }[id] || 120;
  for (const [p, n] of Object.entries(pages)) j.temps[p] = { n: Math.round(n * 1.3), s: Math.round(n * 1.3 * base * (p === 'accueil' ? 0.25 : 0.6 + alea() * 0.9)) };
  const n = Math.max(1, Math.round(j.visites * 0.9));
  j.chargement = { n, ms: Math.round(n * ({ jeux: 1100, pyrolos: 2300, mangazone: 1500, animezone: 1700, portfolio: 800 }[id] || 1200) * (0.8 + alea() * 0.4)) };
  if (alea() < (id === 'pyrolos' ? 0.25 : 0.08)) {
    const p = Object.keys(pages)[Math.floor(alea() * Object.keys(pages).length)] || 'accueil';
    const msg = id === 'pyrolos' ? "Cannot read properties of undefined (reading 'lat')" : id === 'animezone' ? 'Failed to fetch' : 'Promesse rejetée : Permission denied';
    j.erreurs = { [p]: 1 + Math.floor(alea() * 2) };
    const [ay, am, ad] = c.split('-').map(Number);
    j.bugs = { [`demo${c.replace(/-/g, '')}${id}`]: { m: msg, f: id === 'pyrolos' ? 'script.js:2481' : 'app.js:912', p, t: Date.UTC(ay, am - 1, ad, 17, Math.floor(alea() * 59)) } };
  }
  if (DEMO_CONTENUS[id]) {
    j.contenus = {};
    for (const [ty, liste] of Object.entries(DEMO_CONTENUS[id])) {
      const ids = Object.keys(liste);
      j.contenus[ty] = {};
      for (let k = 0; k < Math.round(visiteurs * (ty === 'recherche' ? 0.5 : 1.2)); k++) ajouter(j.contenus[ty], ids[Math.min(ids.length - 1, Math.floor(alea() * alea() * ids.length * 1.4))]);
    }
  }
  void mod;
}

if (DEMO) {
  remplirDemo();
  enDirect = { jeux: [{ p: 'uno' }, { p: 'uno' }, { p: 'skyjo' }], mangazone: [{ p: 'collection' }], portfolio: [{ p: 'projets' }] };
  trierSites();
  etat('ok', 'Démo');
  $('mode').textContent = "Mode démo : les chiffres sont inventés. Retire « ?demo » de l'adresse pour voir les vrais.";
  rendre();
} else {
  $('mode').textContent = `Actualisé toutes les ${ACTUALISATION} s · journées comptées à l'heure de Paris`;
  rendre();
  actualiser();
  setInterval(() => { if (!document.hidden) actualiser(); }, ACTUALISATION * 1000);
  chargerDirect();
  setInterval(() => { if (!document.hidden) chargerDirect(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) actualiser(); });
}

// Chiffres inventés mais plausibles (toujours les mêmes, pour pouvoir comparer)
function remplirDemo() {
  let graine = 7;
  const alea = () => ((graine = (graine * 16807) % 2147483647) / 2147483647);
  const modeles = {
    jeux: { base: 8, pente: 0.09, weekend: 1.6, appli: 0.22, mobile: 0.72, parties: true,
      pages: { accueil: 12, uno: 9, skyjo: 7, loupgarou: 6, undercover: 5, president: 5, petitbac: 4, poker: 4, cranes: 3, bataille: 3, puissance4: 3, tokyo: 2, kassen: 2, cluedo: 2, chevaux: 2, blackjack: 2, demineur: 1.5, mastermind: 1, yams: 3 } },
    pyrolos: { base: 6, pente: 0.03, weekend: 1.8, appli: 0.05, mobile: 0.6,
      pages: { carte: 10, itineraires: 6, meteo: 5, classement: 3, riders: 2, messages: 2, succes: 1.5 } },
    mangazone: { base: 4, pente: 0.02, weekend: 1.3, appli: 0.35, mobile: 0.8,
      pages: { discover: 8, collection: 6, series: 5, succes: 2 } },
    portfolio: { base: 3, pente: 0.01, weekend: 0.5, appli: 0, mobile: 0.4, telechargements: { cv: 0.5, 'projet-r': 0.3, 'projet-vba': 0.3, 'projet-twitch': 0.25 },
      pages: { accueil: 10, 'a-propos': 7, projets: 6, cv: 4, contact: 2, 'projet-r': 2, 'projet-vba': 1.5, 'projet-twitch': 1.5, 'projet-web': 1 } },
    animezone: { base: 5, pente: 0.04, weekend: 1.4, appli: 0.3, mobile: 0.78,
      pages: { avenir: 8, decouvrir: 6, liste: 5, fiche: 5, profils: 2, succes: 2, profil: 1 } },
  };
  const tous = derniersJours(400);
  const aujourdhui = jourDe();
  for (const [id, mod] of Object.entries(modeles)) {
    const j = {};
    const listePages = Object.entries(mod.pages);
    const somPoids = listePages.reduce((s, [, p]) => s + p, 0);
    tous.forEach((c, i) => {
      const js = versDate(c).getUTCDay();
      const facteur = js === 0 || js === 5 || js === 6 ? mod.weekend : 1;
      let visiteurs = Math.round((mod.base + i * mod.pente) * facteur * (0.75 + alea() * 0.5));
      if (c === aujourdhui) visiteurs = Math.round(visiteurs * 0.8);
      const mobile = Math.round(visiteurs * (mod.mobile + (alea() - 0.5) * 0.14));
      const pages = {};
      for (const [p, w] of listePages) { const nb = Math.round(visiteurs * 1.4 * (w / somPoids) * (0.6 + alea() * 0.8)); if (nb) pages[p] = nb; }
      // Parties jouées (site de jeux) : environ 1,5 partie par visiteur d'un jeu, plutôt en ligne le week-end
      let actions;
      if (mod.parties) {
        actions = { 'parties-en-ligne': {}, 'parties-telephone': {} };
        for (const [p, nb] of Object.entries(pages)) {
          if (p === 'accueil') continue;
          const tot = Math.round(nb * (1 + alea()));
          const enLigne = Math.round(tot * (facteur > 1 ? 0.6 : 0.4) * (0.8 + alea() * 0.4));
          if (enLigne) actions['parties-en-ligne'][p] = enLigne;
          if (tot - enLigne > 0) actions['parties-telephone'][p] = tot - enLigne;
        }
      }
      if (mod.telechargements) {
        actions = { telechargements: {} };
        for (const [p, taux] of Object.entries(mod.telechargements)) { const nb = Math.round((pages[p] || 0) * taux * (0.5 + alea())); if (nb) actions.telechargements[p] = nb; }
      }
      // journal : une heure pour chaque partie / téléchargement, plutôt le soir
      const journalDemo = {};
      const [ay, am, ad] = c.split('-').map(Number);
      for (const [a, parPage] of Object.entries(actions || {})) for (const [pg, nb] of Object.entries(parPage)) {
        for (let k = 0; k < nb; k++) {
          const h = Math.min(23, Math.floor(alea() < 0.6 ? 17 + alea() * 7 : 8 + alea() * 9));
          journalDemo[`demo-${c}-${a}-${pg}-${k}`] = { a, p: pg, t: Date.UTC(ay, am - 1, ad, h - 1, Math.floor(alea() * 60)) };
          const ed = journalDemo[`demo-${c}-${a}-${pg}-${k}`];
          if (mod.parties) {
            ed.d = Math.round((pg === 'demineur' ? 90 : pg === 'tokyo' ? 2400 : 300 + alea() * 900) * (0.5 + alea()));
            if (alea() < 0.82) ed.x = true;
            let h = 2 + Math.floor(alea() * 4), b = pg === 'poker' ? Math.floor(alea() * 3) : 0;
            if (uniteManches(id, pg)) {
              ed.m = 1 + Math.floor(alea() * 8);
              ed.j = Array.from({ length: ed.m }, (_, i) => { if (i && alea() < 0.2 && h + b > 2) { if (b && alea() < 0.5) b--; else h--; } return b ? `${h}+${b}` : `${h}`; }).join(',');
            } else ed.j = String(h);
          }
        }
      }
      j[c] = { journal: journalDemo, visiteurs, vues: Math.round(visiteurs * (2.6 + alea() * 1.4)), nouveaux: Math.round(visiteurs * (0.3 + alea() * 0.2)),
        appli: Math.round(visiteurs * mod.appli * (0.8 + alea() * 0.4)), appareils: { mobile, ordi: visiteurs - mobile }, pages, actions };
      completerDemo(id, j[c], c, visiteurs, mobile, alea, pages, mod);
    });
    const m = {};
    for (const mm of derniersMois(14)) m[mm] = { visiteurs: Math.round(Object.keys(j).filter((c) => c.startsWith(mm)).reduce((s, c) => s + j[c].visiteurs, 0) * 0.55) };
    const totActions = {};
    for (const c of tous) for (const [a, parPage] of Object.entries(j[c].actions || {})) for (const [p, nb] of Object.entries(parPage)) {
      ((totActions[a] = totActions[a] || {})[p] = (totActions[a][p] || 0) + nb);
    }
    donnees[id] = { noms: DEMO_CONTENUS[id] || {}, jours: j, mois: m, total: { visiteurs: tous.reduce((s, c) => s + j[c].nouveaux, 0), vues: tous.reduce((s, c) => s + j[c].vues, 0), actions: totActions } };
  }
}
