// Tableau de bord des visites de tous les sites qui utilisent suivi.js.
// Lit les compteurs rangés sous stats/<site>/ dans la Realtime Database de chaque site (voir config.js),
// par l'API REST de Firebase, sans bibliothèque,
// et va chercher les nouveaux chiffres toutes les ACTUALISATION secondes.
// Ajoute ?demo à l'adresse pour voir le tableau rempli de chiffres inventés.
import { ACTUALISATION, SITES } from './config.js';

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
  if (selection !== 'tous' && donnees[selection]) {
    ({ jours, mois, total } = donnees[selection]);
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
      : `Voici ce qui se passe sur ${nomSite(selection)} · ${date}`;
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

  // Classement : pages du site, ou sites entre eux
  const parCle = {};
  for (const c of cles) for (const [cle, nb] of Object.entries((jours[c] && jours[c].pages) || {})) parCle[cle] = (parCle[cle] || 0) + nb;
  const tri = Object.entries(parCle).sort((a, b) => b[1] - a[1]);
  $('titre-classement').textContent = tous ? 'Sites les plus visités' : 'Pages les plus vues';
  $('note-classement').textContent = tous ? `Visiteurs uniques par jour, cumulés sur ${libPeriode}` : `Visiteurs par page, cumulés sur ${libPeriode}`;
  const liste = $('classement');
  if (!tri.length) {
    liste.innerHTML = '<li class="vide" style="display:block">Pas encore de visites sur cette période.</li>';
  } else {
    const max = tri[0][1];
    const top = tri.slice(0, 7);
    const reste = tri.length - top.length;
    liste.innerHTML = top.map(([cle, nb], i) => {
      const c = tous ? ` style="--c:${couleurSite(cle)}"` : '';
      return `<li${c}><span class="rang">${i + 1}</span>
        <span class="nom">${tous ? '<span class="point"></span>' : ''}${echapper(nomPage(cle))}</span>
        <span class="nombre">${nf.format(nb)}</span>
        <span class="jauge"><i style="--l:${Math.max(2, (nb / max) * 100)}%; --retard:${i * 70}ms"></i></span></li>`;
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
  }
}

// Pastilles de choix du site
function rendreSites() {
  const nav = $('sites');
  const ids = ordreSites;
  if (ids.length < 1) { nav.innerHTML = ''; return; }
  const bouton = (id, nom, nb, couleur) => `<button type="button" data-site="${id}" aria-pressed="${selection === id}"${couleur ? ` style="--c:${couleur}"` : ''}>
      <span class="point"></span>${echapper(nom)}${nb !== null ? `<span class="nb" title="visiteurs aujourd'hui">${nf.format(nb)}</span>` : ''}</button>`;
  const auj = jourDe();
  const visiteursAuj = (id) => ((donnees[id].jours || {})[auj] || {}).visiteurs || 0;
  nav.innerHTML = (ids.length > 1 ? bouton('tous', 'Tous les sites', null, 'var(--texte)') : '')
    + ids.map((id) => bouton(id, nomSite(id), visiteursAuj(id), couleurSite(id))).join('');
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

function graphe(points, unite) {
  const max = maxRond(Math.max(0, ...points.map((p) => p.valeur)));
  const zoneHaut = $('graphe').clientHeight - 26;
  $('titre-graphe').textContent = unite === 'mois' ? 'Visiteurs uniques par mois' : 'Visiteurs uniques par jour';
  const totalVal = points.reduce((s, p) => s + p.valeur, 0);
  $('note-graphe').textContent = `Moyenne : ${nf.format(Math.round(totalVal / points.length))} par ${unite}`;
  const rec = points.reduce((m, p) => (p.valeur > m.valeur ? p : m), points[0]);
  $('record').textContent = rec.valeur ? `Record : ${nf.format(rec.valeur)} · ${unite === 'mois' ? fmt(rec.cle, { month: 'short', year: 'numeric' }) : fmt(rec.cle, { day: 'numeric', month: 'short' })}` : '';

  $('axe').innerHTML = [0, 1, 2, 3, 4].map((k) => `<div class="graduation${k ? '' : ' zero'}" style="top:${zoneHaut * (1 - k / 4)}px"><span>${nf.format((max / 4) * k)}</span></div>`).join('');

  const barres = $('barres');
  const serre = points.length > 14;
  barres.classList.toggle('fin', serre);
  barres.style.setProperty('--ecart-barres', serre ? (innerWidth < 640 ? '2px' : '5px') : (innerWidth < 640 ? '8px' : '14px'));
  barres.innerHTML = points.map((p, i) => `
    <div class="colonne${p.actuelle ? ' actuelle' : ''}" data-i="${i}" style="--h:${(p.valeur / max) * zoneHaut}px; --retard:${i * (serre ? 18 : 60)}ms">
      <div class="zone"><div class="barre-v"></div>${p.actuelle && !serre ? `<span class="etiquette-valeur">${nf.format(p.valeur)}</span>` : ''}</div>
      <span class="etiquette">${p.etiquette}</span>
    </div>`).join('');
  barres._points = points;

  $('tableau-corps').innerHTML = points.slice().reverse().map((p) => `<tr><td>${p.titre}</td><td>${nf.format(p.valeur)}</td></tr>`).join('');
}

// Bulle au survol (ou au toucher) des barres
function brancherBulle() {
  const zone = $('graphe');
  const bulle = $('bulle');
  const montrer = (col) => {
    const p = $('barres')._points[Number(col.dataset.i)];
    zone.querySelectorAll('.colonne.active').forEach((c) => c.classList.remove('active'));
    col.classList.add('active');
    bulle.innerHTML = `<span>${p.titre}</span><strong>${nf.format(p.valeur)} visiteur${p.valeur > 1 ? 's' : ''}</strong><span>${p.detail}</span>`;
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

// ---------- Période ----------
document.querySelectorAll('.periodes button').forEach((b) => b.addEventListener('click', () => {
  periode = b.dataset.periode;
  document.querySelectorAll('.periodes button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  animer = true;
  rendre();
}));
let attente;
addEventListener('resize', () => { clearTimeout(attente); attente = setTimeout(rendre, 150); });

// ---------- Chargement ----------
function etat(classe, texte) { const el = $('etat'); el.className = `direct ${classe}`; el.querySelector('span').textContent = texte; }

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

function trierSites() {
  const visiteurs = (id) => (donnees[id].total && donnees[id].total.visiteurs) || 0;
  ordreSites = Object.keys(donnees).sort((a, b) => visiteurs(b) - visiteurs(a) || a.localeCompare(b));
  if (selection !== 'tous' && !donnees[selection]) selection = 'tous';
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

brancherBulle();

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
    jeux: { base: 8, pente: 0.09, weekend: 1.6, appli: 0.22, mobile: 0.72,
      pages: { accueil: 12, uno: 9, skyjo: 7, loupgarou: 6, undercover: 5, president: 5, petitbac: 4, poker: 4, cranes: 3, bataille: 3, puissance4: 3, tokyo: 2, kassen: 2, cluedo: 2, chevaux: 2, blackjack: 2, demineur: 1.5, mastermind: 1 } },
    portfolio: { base: 5, pente: 0.02, weekend: 0.6, appli: 0, mobile: 0.45,
      pages: { accueil: 10, projets: 6, 'a-propos': 3, contact: 2 } },
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
      j[c] = { visiteurs, vues: Math.round(visiteurs * (2.6 + alea() * 1.4)), nouveaux: Math.round(visiteurs * (0.3 + alea() * 0.2)),
        appli: Math.round(visiteurs * mod.appli * (0.8 + alea() * 0.4)), appareils: { mobile, ordi: visiteurs - mobile }, pages };
    });
    const m = {};
    for (const mm of derniersMois(14)) m[mm] = { visiteurs: Math.round(Object.keys(j).filter((c) => c.startsWith(mm)).reduce((s, c) => s + j[c].visiteurs, 0) * 0.55) };
    donnees[id] = { jours: j, mois: m, total: { visiteurs: tous.reduce((s, c) => s + j[c].nouveaux, 0), vues: tous.reduce((s, c) => s + j[c].vues, 0) } };
  }
}
