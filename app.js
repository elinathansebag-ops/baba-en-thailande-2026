/* Avances Vacances — logique de l'application */
import { Cloud } from './sync.js';

export const VERSION = '1.1.0';

/* ---------------- Données ---------------- */
const KEY = 'avances-vacances-v1';
const CODE_KEY = 'avances-vacances-trip';
const DEFAULT = {
  trip: 'Vacances',
  base: 'EUR',
  currencies: { EUR: 1 },
  categories: ['🍽️ Restaurant', '🛒 Courses', '🏨 Logement', '🚕 Transport', '🎟️ Activités', '💸 Divers'],
  people: [],
  expenses: []
};

let S = load();
let edit = null, mode = 'equal', sel = new Set(), custom = {};
let cloudCode = null, cloudStatus = 'local';

function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) return normalize(JSON.parse(r));
  } catch (e) {}
  return structuredClone(DEFAULT);
}
function normalize(o) {
  const s = Object.assign(structuredClone(DEFAULT), o || {});
  if (!s.currencies || typeof s.currencies !== 'object') s.currencies = { EUR: 1 };
  if (!Array.isArray(s.categories)) s.categories = structuredClone(DEFAULT.categories);
  if (!Array.isArray(s.people)) s.people = [];
  if (!Array.isArray(s.expenses)) s.expenses = [];
  if (!s.currencies[s.base]) s.currencies[s.base] = 1;
  return s;
}
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const P = id => S.people.find(p => p.id === id);
const rate = c => S.currencies[c] || 1;
const toBase = (a, c) => a * rate(c);
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
function fmt(n, cur) {
  cur = cur || S.base;
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n); }
  catch (e) { return r2(n).toFixed(2) + ' ' + cur; }
}
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const metaOf = () => ({ trip: S.trip, base: S.base, currencies: S.currencies, categories: S.categories, people: S.people });

/* ---------------- Calculs ---------------- */
function sharesOf(e) {
  const out = {};
  if (e.mode === 'custom') {
    for (const k in (e.shares || {})) { const v = +e.shares[k]; if (v) out[k] = toBase(v, e.currency); }
  } else {
    const ps = (e.participants || []).filter(id => P(id));
    if (!ps.length) return out;
    const each = toBase(+e.amount || 0, e.currency) / ps.length;
    ps.forEach(id => out[id] = each);
  }
  return out;
}
function expTotalBase(e) {
  if (e.mode === 'custom') {
    let s = 0; for (const k in (e.shares || {})) s += +e.shares[k] || 0;
    return toBase(s, e.currency);
  }
  return toBase(+e.amount || 0, e.currency);
}
function balances() {
  const b = {}; S.people.forEach(p => b[p.id] = 0);
  S.expenses.forEach(e => {
    if (b[e.payer] !== undefined) b[e.payer] += expTotalBase(e);
    const sh = sharesOf(e);
    for (const k in sh) if (b[k] !== undefined) b[k] -= sh[k];
  });
  return b;
}
function settlements() {
  const b = balances(), cred = [], deb = [];
  for (const id in b) {
    const v = r2(b[id]);
    if (v > 0.009) cred.push({ id, v }); else if (v < -0.009) deb.push({ id, v: -v });
  }
  cred.sort((x, y) => y.v - x.v); deb.sort((x, y) => y.v - x.v);
  const out = []; let i = 0, j = 0;
  while (i < deb.length && j < cred.length) {
    const m = Math.min(deb[i].v, cred[j].v);
    if (m > 0.009) out.push({ from: deb[i].id, to: cred[j].id, amount: r2(m) });
    deb[i].v -= m; cred[j].v -= m;
    if (deb[i].v < 0.01) i++;
    if (cred[j].v < 0.01) j++;
  }
  return out;
}

/* ---------------- Persistance (local ou cloud) ---------------- */
function commitMeta() {
  saveLocal(); render();
  if (cloudCode) Cloud.pushMeta(metaOf()).catch(err => toast('Synchro impossible : ' + err.message));
}
function commitExpense(obj) {
  saveLocal(); render();
  if (cloudCode) Cloud.pushExpense(obj).catch(err => toast('Synchro impossible : ' + err.message));
}
function commitDelete(id) {
  saveLocal(); render();
  if (cloudCode) Cloud.removeExpense(id).catch(err => toast('Synchro impossible : ' + err.message));
}

/* ---------------- Rendu ---------------- */
function render() {
  const nameEl = document.getElementById('tripName');
  if (document.activeElement !== nameEl) nameEl.value = S.trip;
  const tot = S.expenses.reduce((s, e) => s + expTotalBase(e), 0);
  document.getElementById('totalAll').textContent = fmt(tot);
  document.getElementById('hdrTot').textContent = S.expenses.length ? fmt(tot) : '';
  document.getElementById('totalSub').textContent = S.expenses.length
    ? S.expenses.length + ' dépense' + (S.expenses.length > 1 ? 's' : '') + ' · ' + S.people.length + ' participant' + (S.people.length > 1 ? 's' : '')
    : 'Aucune dépense';
  document.getElementById('hdrSub').textContent = S.people.map(p => p.name).join(' · ') || 'Ajoute tes amis dans Réglages';
  document.getElementById('appVer').textContent = 'v' + VERSION;
  document.getElementById('dataHint').innerHTML = cloudCode
    ? 'Les données sont synchronisées avec tes amis. Une copie est gardée sur cet appareil pour le mode hors ligne.'
    : 'Tes données restent sur cet appareil. Fais une sauvegarde de temps en temps, ou active le partage ci-dessus.';
  renderExpenses(); renderBalances(); renderPeople(); renderCurrencies(); renderCats(); renderCloud();
  saveLocal();
}
function renderExpenses() {
  const el = document.getElementById('expList');
  if (!S.expenses.length) { el.innerHTML = '<div class="empty">Aucune dépense.<br>Appuie sur + pour commencer.</div>'; return; }
  const list = [...S.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0));
  el.innerHTML = list.map(e => {
    const ic = /^\p{Extended_Pictographic}/u.test(e.category || '') ? [...e.category][0] : '💰';
    const payer = P(e.payer);
    const n = e.mode === 'custom' ? Object.keys(e.shares || {}).filter(k => +e.shares[k]).length : (e.participants || []).length;
    const base = expTotalBase(e);
    const orig = e.currency !== S.base ? '<small>' + fmt(base / rate(e.currency), e.currency) + '</small>' : '';
    return `<div class="exp" data-id="${e.id}">
      <div class="ic">${ic}</div>
      <div class="mid">
        <div class="t">${esc(e.label || 'Dépense')}</div>
        <div class="d">${payer ? esc(payer.name) : '?'} a payé · ${n} pers. · ${esc(e.date || '')}</div>
      </div>
      <div class="amt">${fmt(base)}${orig}</div>
    </div>`;
  }).join('');
  el.querySelectorAll('.exp').forEach(n => n.onclick = () => openExpense(n.dataset.id));
}
function renderBalances() {
  const b = balances(), el = document.getElementById('balList');
  el.innerHTML = S.people.length ? S.people.map(p => {
    const v = r2(b[p.id] || 0);
    return `<div class="bal"><div class="avatar">${esc(initials(p.name))}</div>
      <div class="n">${esc(p.name)}</div>
      <div class="v ${v >= 0 ? 'pos' : 'neg'}">${v > 0 ? '+' : ''}${fmt(v)}</div></div>`;
  }).join('') : '<div class="empty">Ajoute tes amis dans Réglages.</div>';

  const st = settlements();
  document.getElementById('settleList').innerHTML = st.length
    ? st.map(s => `<div class="settle"><b>${esc(P(s.from).name)}</b><span class="arrow">→</span><b>${esc(P(s.to).name)}</b><span style="flex:1"></span><b>${fmt(s.amount)}</b></div>`).join('')
    : '<div class="empty">Tout est équilibré 🎉</div>';

  const cats = {};
  S.expenses.forEach(e => { const c = e.category || 'Divers'; cats[c] = (cats[c] || 0) + expTotalBase(e); });
  const ce = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  document.getElementById('catTable').innerHTML = ce.length
    ? ce.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${fmt(v)}</td></tr>`).join('') : '<tr><td class="muted">—</td></tr>';

  const pay = {};
  S.expenses.forEach(e => { pay[e.payer] = (pay[e.payer] || 0) + expTotalBase(e); });
  const pe = S.people.map(p => [p.name, pay[p.id] || 0]).sort((a, b) => b[1] - a[1]);
  document.getElementById('payTable').innerHTML = pe.length
    ? pe.map(([n, v]) => `<tr><td>${esc(n)}</td><td>${fmt(v)}</td></tr>`).join('') : '<tr><td class="muted">—</td></tr>';
}
function renderPeople() {
  const el = document.getElementById('peopleList');
  el.innerHTML = S.people.length ? S.people.map(p => `<div class="person">
      <div class="avatar">${esc(initials(p.name))}</div>
      <div style="flex:1">${esc(p.name)}</div>
      <button class="ghost mini" data-act="ren" data-id="${p.id}">Renommer</button>
      <button class="danger mini" data-act="del" data-id="${p.id}">✕</button>
    </div>`).join('') : '<div class="muted">Personne pour l\'instant.</div>';
  el.querySelectorAll('button').forEach(b => b.onclick = () =>
    b.dataset.act === 'ren' ? renamePerson(b.dataset.id) : delPerson(b.dataset.id));
}
function renderCurrencies() {
  const bs = document.getElementById('baseCur');
  bs.innerHTML = Object.keys(S.currencies).map(c => `<option ${c === S.base ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const el = document.getElementById('curList');
  el.innerHTML = Object.keys(S.currencies).map(c => c === S.base
    ? `<div class="person"><div style="flex:1"><b>${esc(c)}</b> <span class="muted">devise principale</span></div></div>`
    : `<div class="person"><div style="flex:1">1 <b>${esc(c)}</b> =</div>
        <input type="number" step="0.000001" value="${S.currencies[c]}" data-cur="${esc(c)}" style="width:110px;text-align:right">
        <span class="muted">${esc(S.base)}</span>
        <button class="danger mini" data-delcur="${esc(c)}">✕</button></div>`).join('');
  el.querySelectorAll('input[data-cur]').forEach(i => i.onchange = () => { S.currencies[i.dataset.cur] = +i.value || 1; commitMeta(); });
  el.querySelectorAll('button[data-delcur]').forEach(b => b.onclick = () => delCur(b.dataset.delcur));
}
function renderCats() {
  const el = document.getElementById('catChips');
  el.innerHTML = S.categories.map((c, i) => `<span class="chip on" data-i="${i}">${esc(c)} ✕</span>`).join('');
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => { S.categories.splice(+c.dataset.i, 1); commitMeta(); });
}
function renderCloud() {
  const box = document.getElementById('cloudBox');
  const dot = document.getElementById('syncDot'), txt = document.getElementById('syncTxt');
  dot.className = 'dot' + (cloudStatus === 'live' ? ' live' : cloudStatus === 'error' ? ' err' : '');
  txt.textContent = cloudStatus === 'live' ? 'Partagé · code ' + cloudCode
    : cloudStatus === 'connecting' ? 'Connexion…'
    : cloudStatus === 'error' ? 'Hors ligne — modifications gardées ici'
    : 'Mode local (non partagé)';

  if (!Cloud.isConfigured()) {
    box.innerHTML = `<div class="muted">Le partage en ligne n'est pas encore configuré.<br>
      Renseigne les clés Firebase dans <code>firebase-config.js</code> (voir le README) pour que tes amis puissent rejoindre le voyage.</div>`;
    return;
  }
  if (cloudCode) {
    box.innerHTML = `<div class="muted">Partage ce code (ou le lien) avec tes amis. Tout le monde voit les dépenses en direct.</div>
      <div class="code">${esc(cloudCode)}</div>
      <div class="row"><button id="btnInvite">Envoyer l'invitation</button>
        <button class="ghost" id="btnLeave" style="flex:0 0 auto">Quitter</button></div>`;
    document.getElementById('btnInvite').onclick = invite;
    document.getElementById('btnLeave').onclick = leaveTrip;
  } else {
    box.innerHTML = `<div class="muted">Crée un voyage partagé pour que tes amis voient les dépenses en direct sur leur téléphone.</div>
      <div class="row" style="margin-top:10px"><button id="btnCreate">Créer un voyage partagé</button></div>
      <div class="row" style="margin-top:8px">
        <input type="text" id="joinCode" placeholder="Code reçu" maxlength="8" autocomplete="off" style="text-transform:uppercase">
        <button class="ghost" id="btnJoin" style="flex:0 0 auto">Rejoindre</button></div>`;
    document.getElementById('btnCreate').onclick = createTrip;
    document.getElementById('btnJoin').onclick = () => joinTrip(document.getElementById('joinCode').value);
  }
}
let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ---------------- Navigation ---------------- */
function tab(t) {
  ['exp', 'bal', 'set'].forEach(x => {
    document.getElementById('v-' + x).classList.toggle('hidden', x !== t);
    document.getElementById('t-' + x).classList.toggle('on', x === t);
  });
  document.getElementById('fab').classList.toggle('hidden', t !== 'exp');
  window.scrollTo(0, 0);
}

/* ---------------- Participants / devises / catégories ---------------- */
function addPerson() {
  const i = document.getElementById('newPerson'), n = i.value.trim();
  if (!n) return;
  S.people.push({ id: uid(), name: n }); i.value = ''; commitMeta();
}
function renamePerson(id) {
  const p = P(id), n = prompt('Nouveau prénom', p.name);
  if (n && n.trim()) { p.name = n.trim(); commitMeta(); }
}
function delPerson(id) {
  const used = S.expenses.some(e => e.payer === id || (e.participants || []).includes(id) || (e.shares && e.shares[id]));
  if (used && !confirm('Cette personne apparaît dans des dépenses. La supprimer quand même ?')) return;
  S.people = S.people.filter(p => p.id !== id); commitMeta();
}
function setBase(c) {
  const f = S.currencies[c];
  if (!f) return;
  const nc = {};
  Object.keys(S.currencies).forEach(k => nc[k] = S.currencies[k] / f);
  nc[c] = 1; S.currencies = nc; S.base = c; commitMeta();
}
function addCur() {
  const c = document.getElementById('newCurCode').value.trim().toUpperCase();
  const r = parseFloat(document.getElementById('newCurRate').value);
  if (!/^[A-Z]{3,4}$/.test(c) || !r || r <= 0) { toast('Indique un code (ex. THB) et un taux valides.'); return; }
  S.currencies[c] = r;
  document.getElementById('newCurCode').value = ''; document.getElementById('newCurRate').value = '';
  commitMeta();
}
function delCur(c) {
  if (c === S.base) return;
  if (S.expenses.some(e => e.currency === c)) { toast('Des dépenses utilisent cette devise.'); return; }
  delete S.currencies[c]; commitMeta();
}
function addCat() {
  const i = document.getElementById('newCat'), v = i.value.trim();
  if (!v) return; S.categories.push(v); i.value = ''; commitMeta();
}

/* ---------------- Feuille dépense ---------------- */
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

function openExpense(id) {
  if (!S.people.length) { toast('Ajoute d\'abord tes amis dans Réglages.'); tab('set'); return; }
  if (!S.categories.length) S.categories = structuredClone(DEFAULT.categories);
  edit = id ? S.expenses.find(e => e.id === id) : null;
  document.getElementById('sheetTitle').textContent = edit ? 'Modifier la dépense' : 'Nouvelle dépense';
  document.getElementById('delBtn').classList.toggle('hidden', !edit);
  document.getElementById('fCur').innerHTML = Object.keys(S.currencies).map(c => `<option>${esc(c)}</option>`).join('');
  document.getElementById('fPayer').innerHTML = S.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  document.getElementById('fCat').innerHTML = S.categories.map(c => `<option>${esc(c)}</option>`).join('');

  if (edit) {
    document.getElementById('fLabel').value = edit.label || '';
    document.getElementById('fCur').value = S.currencies[edit.currency] ? edit.currency : S.base;
    document.getElementById('fPayer').value = P(edit.payer) ? edit.payer : S.people[0].id;
    document.getElementById('fDate').value = edit.date || today();
    document.getElementById('fCat').value = S.categories.includes(edit.category) ? edit.category : S.categories[0];
    mode = edit.mode || 'equal';
    sel = new Set(edit.participants || []);
    custom = Object.assign({}, edit.shares || {});
    document.getElementById('fAmount').value = mode === 'custom' ? '' : (edit.amount || '');
  } else {
    document.getElementById('fLabel').value = '';
    document.getElementById('fAmount').value = '';
    document.getElementById('fCur').value = S.base;
    document.getElementById('fPayer').value = S.people[0].id;
    document.getElementById('fDate').value = today();
    document.getElementById('fCat').value = S.categories[0];
    mode = 'equal'; sel = new Set(S.people.map(p => p.id)); custom = {};
  }
  setMode(mode);
  document.getElementById('sheet').classList.add('open');
}
function closeSheet() { document.getElementById('sheet').classList.remove('open'); edit = null; }
function setMode(m) {
  mode = m;
  document.getElementById('m-equal').classList.toggle('on', m === 'equal');
  document.getElementById('m-custom').classList.toggle('on', m === 'custom');
  document.getElementById('amountRow').style.display = m === 'custom' ? 'none' : 'flex';
  renderSplit();
}
function renderSplit() {
  const box = document.getElementById('splitBox');
  const cur = document.getElementById('fCur').value || S.base;
  if (mode === 'equal') {
    const amt = parseFloat(document.getElementById('fAmount').value) || 0;
    const n = [...sel].filter(id => P(id)).length;
    box.innerHTML = `<div class="hint">Coche qui participe à cette dépense.</div>
      <div class="chips">${S.people.map(p => `<span class="chip ${sel.has(p.id) ? 'on' : ''}" data-p="${p.id}">${esc(p.name)}</span>`).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="ghost mini" id="allOn">Tout cocher</button>
        <button class="ghost mini" id="allOff">Tout décocher</button>
      </div>
      <div class="tot"><span>${n} participant${n > 1 ? 's' : ''}</span><b>${fmt(n ? amt / n : 0, cur)} chacun</b></div>`;
    box.querySelectorAll('.chip').forEach(c => c.onclick = () => {
      sel.has(c.dataset.p) ? sel.delete(c.dataset.p) : sel.add(c.dataset.p); renderSplit();
    });
    box.querySelector('#allOn').onclick = () => { sel = new Set(S.people.map(p => p.id)); renderSplit(); };
    box.querySelector('#allOff').onclick = () => { sel = new Set(); renderSplit(); };
  } else {
    box.innerHTML = `<div class="hint">Entre ce que chacun a consommé (le prix de son plat par ex.). Laisse vide si la personne n'a rien pris.</div>
      ${S.people.map(p => `<div class="split-line"><div class="nm">${esc(p.name)}</div>
        <input type="number" step="0.01" inputmode="decimal" placeholder="0.00" data-p="${p.id}" value="${custom[p.id] || ''}"></div>`).join('')}
      <div class="tot"><span>Total de la note</span><b id="cusTot">—</b></div>
      <div class="row" style="margin-top:8px"><button class="ghost mini" id="clr">Remettre à zéro</button></div>`;
    box.querySelectorAll('input[data-p]').forEach(i => i.oninput = () => {
      custom[i.dataset.p] = parseFloat(i.value) || 0; updateCustomTotal();
    });
    box.querySelector('#clr').onclick = () => { custom = {}; renderSplit(); };
    updateCustomTotal();
  }
}
function updateCustomTotal() {
  const el = document.getElementById('cusTot'); if (!el) return;
  const cur = document.getElementById('fCur').value || S.base;
  let s = 0; for (const k in custom) s += +custom[k] || 0;
  el.textContent = fmt(s, cur);
}
function saveExpense() {
  const label = document.getElementById('fLabel').value.trim();
  const cur = document.getElementById('fCur').value;
  const payer = document.getElementById('fPayer').value;
  const date = document.getElementById('fDate').value || today();
  const cat = document.getElementById('fCat').value;
  let amount = 0, shares = {}, parts = [];

  if (mode === 'custom') {
    let s = 0;
    for (const k in custom) { const v = +custom[k] || 0; if (v > 0 && P(k)) { shares[k] = r2(v); s += v; } }
    if (!s) { toast('Entre au moins un montant.'); return; }
    amount = r2(s);
  } else {
    amount = parseFloat(document.getElementById('fAmount').value) || 0;
    if (amount <= 0) { toast('Entre un montant.'); return; }
    parts = [...sel].filter(id => P(id));
    if (!parts.length) { toast('Coche au moins un participant.'); return; }
  }
  const obj = {
    id: edit ? edit.id : uid(), created: edit ? (edit.created || Date.now()) : Date.now(),
    label: label || cat, amount, currency: cur, payer, date, category: cat, mode,
    participants: parts, shares
  };
  S.expenses = edit ? S.expenses.map(e => e.id === edit.id ? obj : e) : [...S.expenses, obj];
  closeSheet(); commitExpense(obj);
}
function deleteExpense() {
  if (!edit || !confirm('Supprimer cette dépense ?')) return;
  const id = edit.id;
  S.expenses = S.expenses.filter(e => e.id !== id);
  closeSheet(); commitDelete(id);
}

/* ---------------- Partage cloud ---------------- */
const newCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => A[b % A.length]).join('');
};
function tripLink(code) { return location.origin + location.pathname + '?t=' + code; }

async function createTrip() {
  cloudStatus = 'connecting'; renderCloud();
  try {
    const code = newCode();
    await Cloud.createTrip(code, metaOf(), S.expenses);
    await connect(code);
    toast('Voyage partagé créé : ' + code);
    invite();
  } catch (e) { cloudStatus = 'error'; renderCloud(); toast('Échec : ' + e.message); }
}
async function joinTrip(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (code.length < 4) { toast('Entre le code reçu.'); return; }
  cloudStatus = 'connecting'; renderCloud();
  try {
    if (!await Cloud.tripExists(code)) { cloudStatus = 'local'; renderCloud(); toast('Aucun voyage avec ce code.'); return; }
    await connect(code);
    toast('Voyage rejoint !');
  } catch (e) { cloudStatus = 'error'; renderCloud(); toast('Échec : ' + e.message); }
}
async function connect(code) {
  cloudCode = code;
  localStorage.setItem(CODE_KEY, code);
  await Cloud.watch(code, {
    onMeta: meta => { if (meta) { S = normalize(Object.assign({}, S, meta)); render(); } },
    onExpenses: list => { S.expenses = list; render(); },
    onStatus: st => { cloudStatus = st; renderCloud(); }
  });
  cloudStatus = 'live'; render();
}
function leaveTrip() {
  if (!confirm('Quitter le voyage partagé ? Les données restent sur cet appareil en mode local.')) return;
  Cloud.stop(); cloudCode = null; cloudStatus = 'local';
  localStorage.removeItem(CODE_KEY);
  render(); toast('Repassé en mode local.');
}
async function invite() {
  const txt = `Rejoins "${S.trip}" pour suivre nos dépenses 👇\n${tripLink(cloudCode)}\n\nCode : ${cloudCode}`;
  if (navigator.share) { try { await navigator.share({ title: S.trip, text: txt }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(txt); toast('Invitation copiée !'); }
  catch (e) { prompt('Copie ce lien :', tripLink(cloudCode)); }
}

/* ---------------- Export / partage ---------------- */
function summaryText() {
  const tot = S.expenses.reduce((s, e) => s + expTotalBase(e), 0);
  let t = `${S.trip} — bilan\nTotal dépensé : ${fmt(tot)}\n\n`;
  const b = balances();
  S.people.forEach(p => { const v = r2(b[p.id] || 0); t += `${p.name} : ${v > 0 ? '+' : ''}${fmt(v)}\n`; });
  const st = settlements();
  t += '\nRemboursements :\n';
  t += st.length ? st.map(s => `• ${P(s.from).name} → ${P(s.to).name} : ${fmt(s.amount)}`).join('\n') : '• Tout est équilibré 🎉';
  if (cloudCode) t += `\n\nSuivre en direct : ${tripLink(cloudCode)}`;
  return t;
}
async function shareSummary() {
  const t = summaryText();
  if (navigator.share) { try { await navigator.share({ title: S.trip, text: t }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(t); toast('Résumé copié !'); }
  catch (e) { prompt('Copie ce texte :', t); }
}
function dl(name, content, type) {
  const b = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCSV() {
  const head = ['Date', 'Description', 'Catégorie', 'Payé par', 'Montant', 'Devise', 'Montant ' + S.base, 'Répartition', 'Détail par personne'];
  const rows = S.expenses.map(e => {
    const sh = sharesOf(e);
    const det = Object.keys(sh).map(k => `${P(k) ? P(k).name : '?'}=${r2(sh[k]).toFixed(2)}`).join(' | ');
    return [e.date, e.label, e.category, P(e.payer) ? P(e.payer).name : '?',
      r2(expTotalBase(e) / rate(e.currency)).toFixed(2), e.currency, r2(expTotalBase(e)).toFixed(2),
      e.mode === 'custom' ? 'Montants personnalisés' : 'Parts égales', det];
  });
  const b = balances();
  rows.push([], ['SOLDES (en ' + S.base + ')']);
  S.people.forEach(p => rows.push([p.name, r2(b[p.id] || 0).toFixed(2)]));
  rows.push([], ['REMBOURSEMENTS']);
  settlements().forEach(s => rows.push([P(s.from).name, 'doit à', P(s.to).name, s.amount.toFixed(2), S.base]));
  const csv = '﻿' + [head, ...rows].map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\n');
  dl((S.trip || 'vacances').replace(/\s+/g, '_') + '.csv', csv, 'text/csv;charset=utf-8');
}
function exportJSON() { dl((S.trip || 'vacances').replace(/\s+/g, '_') + '-sauvegarde.json', JSON.stringify(S, null, 2), 'application/json'); }
function importJSON(input) {
  const f = input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const o = JSON.parse(rd.result);
      if (!o.people || !o.expenses) throw 0;
      S = normalize(o);
      if (cloudCode) { Cloud.pushMeta(metaOf()); S.expenses.forEach(e => Cloud.pushExpense(e)); }
      render(); toast('Sauvegarde restaurée.');
    } catch (e) { toast('Fichier invalide.'); }
    input.value = '';
  };
  rd.readAsText(f);
}
function resetAll() {
  if (!confirm('Effacer toutes les données de cet appareil ? Cette action est définitive.')) return;
  S = structuredClone(DEFAULT);
  if (cloudCode) leaveTrip(); else render();
  render();
}

/* ---------------- Init ---------------- */
Object.assign(window, {
  tab, openExpense, closeSheet, setMode, saveExpense, deleteExpense,
  addPerson, setBase, addCur, addCat, exportCSV, exportJSON, resetAll, shareSummary
});
document.getElementById('tripName').addEventListener('input', e => { S.trip = e.target.value; saveLocal(); });
document.getElementById('tripName').addEventListener('change', () => commitMeta());
document.getElementById('newPerson').addEventListener('keydown', e => { if (e.key === 'Enter') addPerson(); });
document.getElementById('newCat').addEventListener('keydown', e => { if (e.key === 'Enter') addCat(); });
document.getElementById('fAmount').addEventListener('input', renderSplit);
document.getElementById('fCur').addEventListener('change', renderSplit);
document.getElementById('importFile').addEventListener('change', e => importJSON(e.target));
document.getElementById('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

render();

(async () => {
  if (!Cloud.isConfigured()) return;
  const urlCode = new URLSearchParams(location.search).get('t');
  const saved = localStorage.getItem(CODE_KEY);
  const code = (urlCode || saved || '').toUpperCase();
  if (!code) return;
  cloudStatus = 'connecting'; renderCloud();
  try {
    if (urlCode && urlCode.toUpperCase() !== saved) {
      if (!await Cloud.tripExists(code)) { cloudStatus = 'local'; renderCloud(); toast('Ce lien de voyage n\'existe plus.'); return; }
    }
    await connect(code);
    history.replaceState({}, '', location.pathname);
  } catch (e) { cloudStatus = 'error'; renderCloud(); }
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
