// Tableau de bord des visites de tous les sites qui utilisent suivi.js.
// Lit les compteurs rangés sous stats/<site>/ dans la Realtime Database de chaque site (voir config.js),
// par l'API REST de Firebase, sans bibliothèque,
// et va chercher les nouveaux chiffres toutes les ACTUALISATION secondes.
// Ajoute ?demo à l'adresse pour voir le tableau rempli de chiffres inventés.
import * as CONFIG from './config.js';

// Lecture tolérante de config.js : un réglage absent prend sa valeur par défaut
const SITES = CONFIG.SITES || {};
const ACTUALISATION = Number(CONFIG.ACTUALISATION) || 60;
if (CONFIG.FOND) document.documentElement.style.setProperty('--image-fond', `url("${String(CONFIG.FOND).replace(/"/g, '%22')}")`);

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
      for (const champ of ['visiteurs', 'vues', 'nouveaux', 'appli']) t[champ] += j[champ] || 0;
      for (const [a, nb] of Object.entries(j.appareils || {})) t.appareils[a] = (t.appareils[a] || 0) + nb;
      if (j.visiteurs) t.pages[id] = j.visiteurs;
    }
    for (const [cle, m] of Object.entries(d.mois || {})) {
      (mois[cle] || (mois[cle] = { visiteurs: 0 })).visiteurs += m.visiteurs || 0;
    }
    total.visiteurs += (d.total && d.total.visiteurs) || 0;
    total.vues += (d.total && d.total.vues) || 0;
  }
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
  const heure = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hour: 'numeric', hour12: false }).format(new Date()));
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
  spark('s-nouveaux', serie('nouveaux'));

  // Graphique principal
  if (periode === '12m') {
    graphe(moisCles.map((m, i) => ({
      cle: m, valeur: valMois(m), actuelle: i === 11,
      etiquette: fmt(m, { month: 'short' }).replace('.', ''),
      titre: fmt(m, { month: 'long', year: 'numeric' }),
      detail: `${nf.format(sommeMois(m, 'vues'))} pages vues`,
    })), 'mois');
  } else {
    graphe(cles.map((c, i) => ({
      cle: c, valeur: v(c, 'visiteurs'), actuelle: c === aujourdhui,
      etiquette: c === aujourdhui ? 'Auj.' : periode === '7' ? fmt(c, { weekday: 'short' }).replace('.', '')
        : ((n - 1 - i) % 5 === 0 ? fmt(c, { day: 'numeric' }) : ''),
      titre: c === aujourdhui ? "Aujourd'hui" : fmt(c, { weekday: 'long', day: 'numeric', month: 'long' }),
      detail: `${nf.format(v(c, 'vues'))} pages vues`,
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
    const top = tri.slice(0, 7);
    const reste = tri.length - top.length;
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
          <span class="jauge"><i style="--l:${Math.max(2, (nb / max) * 100)}%; --retard:${i * 70}ms"></i></span>
        </span></li>`;
    }).join('') + (reste ? `<li class="reste">et ${reste} autre${reste > 1 ? 's' : ''}</li>` : '');
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
  const meilleur = Object.keys(jours).reduce((m, c) => (v(c, 'visiteurs') > v(m, 'visiteurs') ? c : m), aujourdhui);
  $('t-record').innerHTML = v(meilleur, 'visiteurs')
    ? `${nf.format(v(meilleur, 'visiteurs'))}<small>${fmt(meilleur, { day: 'numeric', month: 'long', year: 'numeric' })}</small>` : '–';

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
      <div class="zone"><div class="barre-v"></div>${p.actuelle && !serre ? `<span class="etiquette-valeur">${nf.format(p.valeur)}</span>` : ''}</div>
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
    bulle.innerHTML = `<span>${p.titre}</span><strong>${nf.format(p.valeur)} ${p.valeur > 1 ? plusieurs : un}</strong>${p.detail ? `<span>${p.detail}</span>` : ''}`;
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
  });
}

$('fiche-fermer').addEventListener('click', () => $('fiche').close());
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

// Pilules du haut : la section visible est mise en avant
const pilules = [...document.querySelectorAll('.pilule[data-section]')];
const activerPilule = (nom) => pilules.forEach((p) => p.classList.toggle('actif', p.dataset.section === nom));
pilules.forEach((p) => p.addEventListener('click', () => activerPilule(p.dataset.section)));
if (typeof IntersectionObserver === 'function') {
  const io = new IntersectionObserver((entrees) => {
    const visible = entrees.filter((e) => e.isIntersecting).sort((x, y) => y.intersectionRatio - x.intersectionRatio)[0];
    if (visible) activerPilule(visible.target.id.replace('section-', ''));
  }, { threshold: [0.4, 0.7], rootMargin: '-80px 0px -30% 0px' });
  ['section-apercu', 'section-pages', 'section-appareils'].forEach((id) => io.observe($(id)));
}

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
        const [j, m, t] = await Promise.all([
          lire(base, `stats/${id}/jours`, { orderBy: '"$key"', startAt: `"${debut}"` }),
          lire(base, `stats/${id}/mois`, { orderBy: '"$key"', limitToLast: '24' }),
          lire(base, `stats/${id}/total`),
        ]);
        nouvelles[id] = { jours: j || {}, mois: m || {}, total: t || {} };
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

if (DEMO) {
  remplirDemo();
  trierSites();
  etat('ok', 'Démo');
  $('mode').textContent = "Mode démo : les chiffres sont inventés. Retire « ?demo » de l'adresse pour voir les vrais.";
  rendre();
} else {
  $('mode').textContent = `Actualisé toutes les ${ACTUALISATION} s · journées comptées à l'heure de Paris`;
  rendre();
  actualiser();
  setInterval(() => { if (!document.hidden) actualiser(); }, ACTUALISATION * 1000);
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
      j[c] = { visiteurs, vues: Math.round(visiteurs * (2.6 + alea() * 1.4)), nouveaux: Math.round(visiteurs * (0.3 + alea() * 0.2)),
        appli: Math.round(visiteurs * mod.appli * (0.8 + alea() * 0.4)), appareils: { mobile, ordi: visiteurs - mobile }, pages, actions };
    });
    const m = {};
    for (const mm of derniersMois(14)) m[mm] = { visiteurs: Math.round(Object.keys(j).filter((c) => c.startsWith(mm)).reduce((s, c) => s + j[c].visiteurs, 0) * 0.55) };
    const totActions = {};
    for (const c of tous) for (const [a, parPage] of Object.entries(j[c].actions || {})) for (const [p, nb] of Object.entries(parPage)) {
      ((totActions[a] = totActions[a] || {})[p] = (totActions[a][p] || 0) + nb);
    }
    donnees[id] = { jours: j, mois: m, total: { visiteurs: tous.reduce((s, c) => s + j[c].nouveaux, 0), vues: tous.reduce((s, c) => s + j[c].vues, 0), actions: totActions } };
  }
}
