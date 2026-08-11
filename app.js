/* Avances Vacances — logique de l'application */
import { Cloud } from './sync.js';

export const VERSION = '5.1.0';

/* ---------------- Données ----------------
   S = état du voyage, partagé avec tout le groupe.
   ME = identité de l'utilisateur sur CET appareil. Volontairement gardée
   en dehors de S : chacun déclare qui il est sur son propre téléphone,
   sans écraser le choix des autres.
------------------------------------------- */
const KEY = 'avances-vacances-v1';
const CODE_KEY = 'avances-vacances-trip';
const ME_KEY = 'avances-vacances-me';
// Le groupe est pré-rempli avec des identifiants FIXES : tout le monde
// désigne ainsi les mêmes personnes, même avant la première synchronisation.
const GROUPE = ['Odelia', 'Sacha', 'Ornella', 'Alexandre', 'David', 'Rachel', 'Saskia', 'Elinathan']
  .map(n => ({ id: 'p-' + n.toLowerCase(), name: n }));

const DEFAULT = {
  trip: 'Thaïlande 2026',
  base: 'THB',                         // les comptes sont tenus en baht
  // 1 € = 37,05 ฿ — modifiable dans Réglages → Devises
  currencies: { THB: 1, EUR: 37.05 },
  categories: ['🍽️ Restaurant', '🛒 Courses', '🏨 Logement', '🚕 Transport', '🎟️ Activités', '💸 Divers'],
  people: structuredClone(GROUPE),
  expenses: [],
  payments: [],
  disputes: []
};

let S = load();
let ME = localStorage.getItem(ME_KEY) || null;
let edit = null, editPay = null, mode = 'equal', sel = new Set(), custom = {};
let fCur = 'THB';                 // devise de saisie (on paie en baht sur place)
let cloudCode = null, cloudStatus = 'local', curTab = 'acc';

function load() {
  try { const r = localStorage.getItem(KEY); if (r) return normalize(JSON.parse(r)); } catch (e) {}
  return structuredClone(DEFAULT);
}
function normalize(o) {
  const s = Object.assign(structuredClone(DEFAULT), o || {});
  delete s.me;                                     // « moi » n'est jamais partagé
  if (!s.currencies || typeof s.currencies !== 'object') s.currencies = { EUR: 1 };
  ['categories', 'people', 'expenses', 'payments', 'disputes'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
  if (!s.categories.length) s.categories = structuredClone(DEFAULT.categories);
  if (!s.currencies[s.base]) s.currencies[s.base] = 1;
  s.payments.forEach(p => { if (!p.status) p.status = 'confirmed'; });
  return s;
}
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
function setMe(id) {
  ME = id || null;
  if (ME) localStorage.setItem(ME_KEY, ME); else localStorage.removeItem(ME_KEY);
  render();
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const P = id => S.people.find(p => p.id === id);
const nameOf = id => (P(id) || {}).name || '?';
const meId = () => (ME && P(ME)) ? ME : null;
const rate = c => S.currencies[c] || 1;
const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const cents = n => Math.round((+n || 0) * 100);
// Unité la plus fine de la devise principale : 1 centime pour l'euro,
// 1 baht pour le THB (les satangs n'ont plus cours). C'est sur cette unité
// que se fait la répartition, donc les montants affichés tombent toujours juste.
const F = () => (S.base === 'THB' ? 1 : 100);
const toU = (x, cur) => Math.round((+x || 0) * rate(cur || S.base) * F());
const fromU = u => u / F();
function fmt(n, cur) {
  cur = cur || S.base;
  const dec = cur === 'THB' ? 0 : 2;          // les satangs n'existent plus en pratique
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: dec, maximumFractionDigits: dec
    }).format(n);
  } catch (e) {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur, maximumFractionDigits: dec }).format(n); }
    catch (e2) { return n.toFixed(dec) + ' ' + cur; }
  }
}
const signed = n => (n > 0 ? '+' : '') + fmt(n);
// La seconde devise (฿ pour la Thaïlande) est affichée à côté de chaque montant.
const alt = () => Object.keys(S.currencies).find(c => c !== S.base);
function fmtAlt(nBase) {
  const c = alt(); if (!c) return '';
  return fmt(nBase / rate(c), c);
}
// Montant dans les deux devises : « 33,31 € · 1 234 ฿ »
const both = n => { const a = fmtAlt(n); return fmt(n) + (a ? ' · ' + a : ''); };
const bothSigned = n => { const a = fmtAlt(n); return signed(n) + (a ? ' · ' + (n > 0 ? '+' : '') + a : ''); };
const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
// Une couleur par personne, tirée d'une palette festive lisible sur blanc.
const PALETTE = ['#E5484D', '#F76808', '#D6409F', '#8E4EC6', '#3E63DD', '#0091FF', '#12A594', '#46A758'];
function colorOf(id) {
  const i = S.people.findIndex(x => x.id === id);
  if (i >= 0) return PALETTE[i % PALETTE.length];
  let h = 0; for (const c of String(id)) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
const avatar = p => `<div class="avatar" style="--c:${colorOf(p.id)}">${esc(initials(p.name))}</div>`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const metaOf = () => ({ trip: S.trip, base: S.base, currencies: S.currencies, categories: S.categories, people: S.people });
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const frDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); return m ? `${m[3]}/${m[2]}` : (d || ''); };

/* ---------------- Calculs ----------------
   Tout est calculé au centime près dans la devise de la dépense, puis
   converti dans la devise principale. Sur une division qui ne tombe pas
   juste, les centimes restants sont attribués un par un, en tournant
   d'une dépense à l'autre : personne ne paie toujours le centime en plus.
------------------------------------------- */
function splitCents(totalCents, n, seed) {
  const base = Math.floor(totalCents / n), rest = totalCents - base * n;
  const out = new Array(n).fill(base);
  for (let k = 0; k < rest; k++) out[(seed + k) % n] += 1;
  return out;
}
const seedOf = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

// Montant d'une dépense, en CENTIMES de la devise principale.
// La répartition se fait sur cette valeur : les comptes tombent donc juste
// à l'euro près, même quand on a payé en baht.
function expCents(e) {
  let a = +e.amount || 0;
  if (e.mode === 'custom' && !a) {            // anciennes dépenses sans total
    a = 0; for (const k in (e.shares || {})) a += +e.shares[k] || 0;
  }
  return toU(a, e.currency);
}
function sharesOf(e) {
  const out = {}, tot = expCents(e);
  if (e.mode === 'custom') {
    const cc = {};
    let used = 0;
    for (const k in (e.shares || {})) {
      const c = toU(e.shares[k], e.currency);
      if (c && P(k)) { cc[k] = c; used += c; }
    }
    // Ce qui n'a été attribué à personne est la part de celui qui a avancé :
    // sans ça il serait remboursé de sa propre consommation.
    const rest = tot - used;
    if (rest !== 0) {
      const who = P(e.payer) ? e.payer : Object.keys(cc)[0];
      if (who) cc[who] = (cc[who] || 0) + rest;
    }
    for (const k in cc) if (cc[k]) out[k] = fromU(cc[k]);
    return out;
  }
  const ps = (e.participants || []).filter(id => P(id));
  if (!ps.length) return out;
  const parts = splitCents(tot, ps.length, seedOf(e.id) % ps.length);
  ps.forEach((id, i) => out[id] = fromU(parts[i]));
  return out;
}
const expTotalBase = e => fromU(expCents(e));
const payTotalBase = p => fromU(toU(p.amount, p.currency));
const counts = p => p.status !== 'rejected';           // un refus ne compte pas

function balances() {
  const b = {}; S.people.forEach(p => b[p.id] = 0);
  S.expenses.forEach(e => {
    if (b[e.payer] !== undefined) b[e.payer] += expTotalBase(e);
    const sh = sharesOf(e);
    for (const k in sh) if (b[k] !== undefined) b[k] -= sh[k];
  });
  S.payments.filter(counts).forEach(p => {
    if (b[p.from] !== undefined) b[p.from] += payTotalBase(p);
    if (b[p.to] !== undefined) b[p.to] -= payTotalBase(p);
  });
  return b;
}
// Montant encore « à confirmer » qui influence déjà le solde de quelqu'un
function pendingAmount(id) {
  return S.payments.filter(p => p.status === 'pending' && (p.from === id || p.to === id))
    .reduce((s, p) => s + payTotalBase(p), 0);
}

function statement(id) {
  const L = [];
  S.expenses.forEach(e => {
    const sh = sharesOf(e);
    const dis = S.disputes.filter(d => d.expenseId === e.id && d.status === 'open');
    if (e.payer === id) L.push({ date: e.date, label: e.label || 'Dépense', sub: 'tu as avancé', amount: expTotalBase(e), kind: 'avance', ref: e.id });
    if (sh[id]) {
      const n = e.mode === 'custom' ? Object.keys(e.shares || {}).filter(k => cents(e.shares[k])).length : (e.participants || []).length;
      L.push({
        date: e.date, label: e.label || 'Dépense',
        sub: (e.mode === 'custom' ? 'sa part' : `÷ ${n}`) + (e.payer !== id ? ` · avancé par ${nameOf(e.payer)}` : ''),
        amount: -sh[id], kind: 'part', ref: e.id,
        flag: dis.some(d => d.by === id) ? 'contesté' : (dis.length ? 'contesté par ' + nameOf(dis[0].by) : '')
      });
    }
  });
  S.payments.filter(counts).forEach(p => {
    const tag = p.status === 'pending' ? 'à confirmer' : '';
    if (p.from === id) L.push({ date: p.date, label: 'Remboursement à ' + nameOf(p.to), sub: p.note || '', amount: payTotalBase(p), kind: 'pay', ref: p.id, flag: tag });
    if (p.to === id) L.push({ date: p.date, label: 'Remboursement de ' + nameOf(p.from), sub: p.note || '', amount: -payTotalBase(p), kind: 'pay', ref: p.id, flag: tag });
  });
  L.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return L;
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

/* ---------------- Ce qui attend une action de ma part ---------------- */
const toConfirm = () => meId() ? S.payments.filter(p => p.status === 'pending' && p.to === ME) : [];
const myDisputes = () => meId()
  ? S.disputes.filter(d => d.status === 'open' && (S.expenses.find(e => e.id === d.expenseId) || {}).payer === ME) : [];
const actionCount = () => toConfirm().length + myDisputes().length;

/* ---------------- Persistance ---------------- */
function commitMeta() {
  saveLocal(); render();
  if (cloudCode) Cloud.pushMeta(metaOf()).catch(e => toast('Synchro impossible : ' + e.message));
}
function commit(kind, obj) {
  saveLocal(); render();
  if (!cloudCode) return;
  const m = {
    exp: () => Cloud.pushExpense(obj), delExp: () => Cloud.removeExpense(obj),
    pay: () => Cloud.pushPayment(obj), delPay: () => Cloud.removePayment(obj),
    dis: () => Cloud.pushDispute(obj), delDis: () => Cloud.removeDispute(obj)
  };
  m[kind]().catch(e => toast('Synchro impossible : ' + e.message));
}

/* ---------------- Rendu ---------------- */
function render() {
  const nameEl = document.getElementById('tripName');
  if (document.activeElement !== nameEl) nameEl.value = S.trip;
  const tot = S.expenses.reduce((s, e) => s + expTotalBase(e), 0);
  document.getElementById('totalAll').textContent = fmt(tot);
  document.getElementById('hdrTot').textContent = S.expenses.length ? fmt(tot) : '';
  document.getElementById('totalSub').textContent = S.expenses.length
    ? fmtAlt(tot) + ' · ' + S.expenses.length + ' dépense' + (S.expenses.length > 1 ? 's' : '')
    : 'Aucune dépense';
  document.getElementById('hdrSub').innerHTML = S.people.length
    ? (meId() ? 'Tu es <b>' + esc(nameOf(ME)) + '</b> · ' : '') + S.people.length + ' participants'
    : 'Ajoute tes amis dans Réglages';
  document.getElementById('appVer').textContent = 'v' + VERSION;
  document.getElementById('dataHint').innerHTML = cloudCode
    ? 'Les données sont synchronisées avec tes amis. Une copie est gardée sur cet appareil pour le mode hors ligne.'
    : 'Tes données restent sur cet appareil. Fais une sauvegarde de temps en temps, ou active le partage ci-dessus.';
  renderExpenses(); renderCats2(); renderActions(); renderAccounts(); renderPayments(); renderSettle();
  renderPeople(); renderCurrencies(); renderCats(); renderCloud();
  const badge = document.getElementById('accBadge'), n = actionCount();
  badge.textContent = n; badge.classList.toggle('hidden', !n);
  saveLocal();
}
function renderExpenses() {
  const el = document.getElementById('expList');
  if (!S.expenses.length) { el.innerHTML = '<div class="empty">Aucune dépense.<br>Appuie sur + pour commencer.</div>'; return; }
  const list = [...S.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0));
  el.innerHTML = list.map(e => {
    const ic = /^\p{Extended_Pictographic}/u.test(e.category || '') ? [...e.category][0] : '💰';
    const n = e.mode === 'custom' ? Object.keys(e.shares || {}).filter(k => cents(e.shares[k])).length : (e.participants || []).length;
    const dis = S.disputes.filter(d => d.expenseId === e.id && d.status === 'open').length;
    return `<div class="exp" data-id="${e.id}">
      <div class="ic">${ic}</div>
      <div class="mid">
        <div class="t">${esc(e.label || 'Dépense')}${dis ? ' <span class="tag warn">contesté</span>' : ''}</div>
        <div class="d">${esc(nameOf(e.payer))} a avancé · ${e.mode === 'custom' ? 'montants perso' : '÷ ' + n} · ${esc(frDate(e.date))}</div>
      </div>
      <div class="amt">${fmt(expTotalBase(e))}<small>${fmtAlt(expTotalBase(e))}</small></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.exp').forEach(n => n.onclick = () => openExpense(n.dataset.id));
}
function renderCats2() {
  const cats = {};
  S.expenses.forEach(e => { const c = e.category || 'Divers'; cats[c] = (cats[c] || 0) + expTotalBase(e); });
  const ce = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  document.getElementById('catCard').classList.toggle('hidden', !ce.length);
  document.getElementById('catTable').innerHTML = ce.length
    ? ce.map(([c, v]) => `<tr><td>${esc(c)}</td><td>${fmt(v)}</td></tr>`).join('') : '<tr><td class="muted">—</td></tr>';
}
function renderActions() {
  const card = document.getElementById('actionCard'), el = document.getElementById('actionList');
  const pays = toConfirm(), dis = myDisputes();
  card.classList.toggle('hidden', !pays.length && !dis.length);
  el.innerHTML = [
    ...pays.map(p => `<div class="action">
      <div class="mid"><div class="t">${esc(nameOf(p.from))} dit t'avoir remboursé ${both(payTotalBase(p))}</div>
        <div class="d">${esc(frDate(p.date))}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
      <div class="acts"><button class="mini" data-ok="${p.id}">Bien reçu</button>
        <button class="danger mini" data-no="${p.id}">Pas reçu</button></div></div>`),
    ...dis.map(d => {
      const e = S.expenses.find(x => x.id === d.expenseId) || {};
      return `<div class="action">
        <div class="mid"><div class="t">${esc(nameOf(d.by))} conteste « ${esc(e.label || '?')} »</div>
          <div class="d">${esc(d.reason || 'sans motif')}</div></div>
        <div class="acts"><button class="ghost mini" data-fix="${d.expenseId}">Corriger</button>
          <button class="mini" data-keep="${d.id}">Maintenir</button></div></div>`;
    })
  ].join('');
  el.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => decidePayment(b.dataset.ok, 'confirmed'));
  el.querySelectorAll('[data-no]').forEach(b => b.onclick = () => decidePayment(b.dataset.no, 'rejected'));
  el.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => openExpense(b.dataset.fix));
  el.querySelectorAll('[data-keep]').forEach(b => b.onclick = () => resolveDispute(b.dataset.keep));
}
function renderAccounts() {
  const b = balances(), el = document.getElementById('accList');
  el.innerHTML = S.people.length ? S.people.map(p => {
    const v = r2(b[p.id] || 0), pend = r2(pendingAmount(p.id));
    const nb = statement(p.id).filter(l => l.kind === 'part').length;
    const lbl = p.id === ME
      ? (v > 0.005 ? 'le groupe te doit' : v < -0.005 ? 'tu dois' : 'à jour')
      : (v < -0.005 ? 'te doit' : v > 0.005 ? 'tu lui dois' : 'à jour');
    return `<div class="bal" data-p="${p.id}">
      ${avatar(p)}
      <div class="n">${esc(p.name)}${p.id === ME ? ' <span class="tag">moi</span>' : ''}
        <div class="muted">${nb} dépense${nb > 1 ? 's' : ''} · ${lbl}${pend > 0.005 ? ' · <span class="warn-t">' + fmt(pend) + ' à confirmer</span>' : ''}</div></div>
      <div class="v ${v >= -0.005 ? 'pos' : 'neg'}">${signed(v)}<small>${fmtAlt(v)}</small></div>
      <span class="chev">›</span></div>`;
  }).join('') : '<div class="empty">Ajoute des amis dans Réglages.</div>';
  el.querySelectorAll('.bal').forEach(n => n.onclick = () => openAccount(n.dataset.p));

  const ref = meId() || (S.people.length ? Object.entries(b).sort((x, y) => y[1] - x[1])[0][0] : null);
  const due = ref ? S.people.filter(p => p.id !== ref).reduce((s, p) => s + Math.max(0, -(b[p.id] || 0)), 0) : 0;
  document.getElementById('dueCard').classList.toggle('hidden', !ref || !S.expenses.length);
  document.getElementById('dueTotal').textContent = fmt(due);
  document.getElementById('dueSub').textContent = ref
    ? (due > 0.005 ? fmtAlt(due) + ` · que le groupe doit encore à ${nameOf(ref)}` : 'tout le monde est à jour 🎉') : '';
}
function renderPayments() {
  const el = document.getElementById('payList');
  const list = [...S.payments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const chip = s => s === 'pending' ? '<span class="tag warn">à confirmer</span>'
    : s === 'rejected' ? '<span class="tag bad">refusé</span>' : '<span class="tag good">confirmé</span>';
  el.innerHTML = list.length ? list.map(p => `<div class="exp" data-id="${p.id}">
      <div class="ic">${p.status === 'rejected' ? '⛔' : p.status === 'pending' ? '⏳' : '✅'}</div>
      <div class="mid"><div class="t">${esc(nameOf(p.from))} → ${esc(nameOf(p.to))} ${chip(p.status)}</div>
        <div class="d">${esc(frDate(p.date))}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
      <div class="amt ${p.status === 'rejected' ? 'struck' : ''}">${fmt(payTotalBase(p))}<small>${fmtAlt(payTotalBase(p))}</small></div></div>`).join('')
    : '<div class="empty">Aucun remboursement enregistré.</div>';
  el.querySelectorAll('.exp').forEach(n => n.onclick = () => openPayment(n.dataset.id));
}
function renderSettle() {
  const st = settlements();
  document.getElementById('settleList').innerHTML = st.length
    ? st.map(s => `<div class="settle"><b>${esc(nameOf(s.from))}</b><span class="arrow">→</span><b>${esc(nameOf(s.to))}</b><span style="flex:1"></span><b>${fmt(s.amount)}<small>${fmtAlt(s.amount)}</small></b></div>`).join('')
    : '<div class="empty">Tout est équilibré 🎉</div>';
}
function renderPeople() {
  const el = document.getElementById('peopleList');
  el.innerHTML = S.people.length ? S.people.map(p => `<div class="person">
      ${avatar(p)}
      <div style="flex:1">${esc(p.name)}${p.id === ME ? ' <span class="tag">moi</span>' : ''}</div>
      <button class="star ${p.id === ME ? 'on' : ''}" data-act="me" data-id="${p.id}" title="C'est moi">${p.id === ME ? '★' : '☆'}</button>
      <button class="ghost mini" data-act="ren" data-id="${p.id}">Renommer</button>
      <button class="danger mini" data-act="del" data-id="${p.id}">✕</button>
    </div>`).join('') : '<div class="muted">Personne pour l\'instant.</div>';
  el.querySelectorAll('button').forEach(b => b.onclick = () => {
    const a = b.dataset.act, id = b.dataset.id;
    if (a === 'me') setMe(ME === id ? null : id);
    else if (a === 'ren') renamePerson(id); else delPerson(id);
  });
}
function renderCurrencies() {
  document.getElementById('baseCur').innerHTML = Object.keys(S.currencies)
    .map(c => `<option ${c === S.base ? 'selected' : ''}>${esc(c)}</option>`).join('');
  const el = document.getElementById('curList');
  el.innerHTML = Object.keys(S.currencies).map(c => c === S.base
    ? `<div class="person"><div style="flex:1"><b>${esc(c)}</b> <span class="muted">devise principale</span></div></div>`
    : `<div class="person"><div style="flex:1">1 <b>${esc(c)}</b> =</div>
        <input type="number" step="0.0001" value="${S.currencies[c]}" data-cur="${esc(c)}" style="width:110px;text-align:right">
        <span class="muted"><b>${esc(S.base)}</b></span>
        <button class="danger mini" data-delcur="${esc(c)}">✕</button></div>`).join('');
  el.querySelectorAll('input[data-cur]').forEach(i => i.onchange = () => {
    const v = parseFloat(i.value);
    if (v > 0) S.currencies[i.dataset.cur] = v;
    commitMeta();
  });
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
      Renseigne les clés Firebase dans <code>firebase-config.js</code> (voir le README).</div>`;
    return;
  }
  if (cloudCode) {
    box.innerHTML = `<div class="muted">Partage ce code (ou le lien) avec tes amis. Chacun indique qui il est sur son téléphone.</div>
      <div class="code">${esc(cloudCode)}</div>
      <div class="row"><button id="btnInvite">Envoyer l'invitation</button>
        <button class="ghost" id="btnLeave" style="flex:0 0 auto">Quitter</button></div>`;
    document.getElementById('btnInvite').onclick = invite;
    document.getElementById('btnLeave').onclick = leaveTrip;
  } else {
    box.innerHTML = `<div class="muted">Crée un voyage partagé pour que tes amis suivent leur compte en direct.</div>
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

/* ---------------- Qui suis-je ? ---------------- */
function askWho(force) {
  if (!S.people.length) return;
  if (meId() && !force) return;
  document.getElementById('whoList').innerHTML = S.people.map(p =>
    `<button class="ghost who" data-p="${p.id}"><span class="avatar" style="--c:${colorOf(p.id)}">${esc(initials(p.name))}</span>${esc(p.name)}</button>`).join('');
  document.getElementById('whoList').querySelectorAll('.who').forEach(b => b.onclick = () => {
    setMe(b.dataset.p);
    document.getElementById('whoSheet').classList.remove('open');
    toast('Bienvenue ' + nameOf(ME) + ' !');
  });
  document.getElementById('whoSheet').classList.add('open');
}

/* ---------------- Navigation ---------------- */
function tab(t) {
  curTab = t;
  ['exp', 'acc', 'set'].forEach(x => {
    document.getElementById('v-' + x).classList.toggle('hidden', x !== t);
    document.getElementById('t-' + x).classList.toggle('on', x === t);
  });
  const fab = document.getElementById('fab');
  fab.classList.toggle('hidden', t === 'set');
  window.scrollTo(0, 0);
}

/* ---------------- Participants / devises / catégories ---------------- */
function addPerson() {
  const i = document.getElementById('newPerson'), n = i.value.trim();
  if (!n) return;
  const p = { id: uid(), name: n };
  S.people.push(p);
  if (!meId() && S.people.length === 1) setMe(p.id);
  i.value = ''; commitMeta();
}
function renamePerson(id) {
  const p = P(id), n = prompt('Nouveau prénom', p.name);
  if (n && n.trim()) { p.name = n.trim(); commitMeta(); }
}
function delPerson(id) {
  const used = S.expenses.some(e => e.payer === id || (e.participants || []).includes(id) || (e.shares && e.shares[id]))
    || S.payments.some(p => p.from === id || p.to === id);
  if (used && !confirm('Cette personne apparaît dans des dépenses. La supprimer quand même ?')) return;
  S.people = S.people.filter(p => p.id !== id);
  if (ME === id) setMe(null);
  commitMeta();
}
function setBase(c) {
  const f = S.currencies[c]; if (!f) return;
  const nc = {}; Object.keys(S.currencies).forEach(k => nc[k] = S.currencies[k] / f);
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
  if (S.expenses.some(e => e.currency === c) || S.payments.some(p => p.currency === c)) { toast('Cette devise est utilisée.'); return; }
  delete S.currencies[c]; commitMeta();
}
function addCat() {
  const i = document.getElementById('newCat'), v = i.value.trim();
  if (!v) return; S.categories.push(v); i.value = ''; commitMeta();
}

/* ---------------- Feuille dépense ---------------- */
function openExpense(id) {
  if (S.people.length < 2) { toast('Ajoute d\'abord tes amis dans Réglages.'); tab('set'); return; }
  edit = id ? S.expenses.find(e => e.id === id) : null;
  document.getElementById('sheetTitle').textContent = edit ? 'Modifier la dépense' : 'Nouvelle dépense';
  document.getElementById('delBtn').classList.toggle('hidden', !edit);
  document.getElementById('fPayer').innerHTML = S.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  document.getElementById('fCat').innerHTML = S.categories.map(c => `<option>${esc(c)}</option>`).join('');

  if (edit) {
    document.getElementById('fLabel').value = edit.label || '';
    fCur = S.currencies[edit.currency] ? edit.currency : S.base;
    document.getElementById('fPayer').value = P(edit.payer) ? edit.payer : (meId() || S.people[0].id);
    document.getElementById('fDate').value = edit.date || today();
    document.getElementById('fCat').value = S.categories.includes(edit.category) ? edit.category : S.categories[0];
    mode = edit.mode || 'equal';
    sel = new Set((edit.participants || []).filter(P));
    custom = Object.assign({}, edit.shares || {});
    document.getElementById('fAmount').value = edit.amount || '';
  } else {
    document.getElementById('fLabel').value = '';
    document.getElementById('fAmount').value = '';
    fCur = S.base;
    document.getElementById('fPayer').value = meId() || S.people[0].id;
    document.getElementById('fDate').value = today();
    document.getElementById('fCat').value = S.categories[0];
    mode = 'equal'; sel = new Set(S.people.map(p => p.id)); custom = {};
  }
  renderDisputeBox();
  renderCurSeg();
  document.getElementById('moreBox').classList.add('hidden');
  document.getElementById('moreBtn').textContent = 'Plus d\'options';
  setMode(mode);
  document.getElementById('sheet').classList.add('open');
  if (!edit) setTimeout(() => document.getElementById('fAmount').focus(), 250);
}
function renderDisputeBox() {
  const box = document.getElementById('disputeBox');
  if (!edit) { box.innerHTML = ''; box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const open = S.disputes.filter(d => d.expenseId === edit.id && d.status === 'open');
  const sh = sharesOf(edit);
  const mine = meId() && (sh[ME] || edit.payer === ME);
  const iContest = open.some(d => d.by === ME);
  let h = '';
  if (open.length) h += `<div class="alert">${open.map(d =>
    `<div><b>${esc(nameOf(d.by))}</b> conteste : ${esc(d.reason || 'sans motif')}
     ${edit.payer === ME ? `<button class="mini" data-keep="${d.id}">Maintenir</button>` : ''}</div>`).join('')}</div>`;
  if (mine && edit.payer !== ME) {
    h += iContest
      ? '<button class="ghost mini" id="unDispute" style="margin-top:8px">Retirer ma contestation</button>'
      : '<button class="ghost mini" id="doDispute" style="margin-top:8px">⚠︎ Je conteste cette dépense</button>';
  }
  box.innerHTML = h;
  box.querySelectorAll('[data-keep]').forEach(b => b.onclick = () => { resolveDispute(b.dataset.keep); renderDisputeBox(); });
  const d1 = box.querySelector('#doDispute'), d2 = box.querySelector('#unDispute');
  if (d1) d1.onclick = () => addDispute(edit.id);
  if (d2) d2.onclick = () => {
    const d = open.find(x => x.by === ME);
    S.disputes = S.disputes.filter(x => x.id !== d.id);
    commit('delDis', d.id); renderDisputeBox();
  };
}
function addDispute(expenseId) {
  const reason = prompt('Qu\'est-ce qui ne va pas ? (ex. je n\'étais pas là, montant faux)');
  if (reason === null) return;
  const d = { id: uid(), expenseId, by: ME, reason: reason.trim(), date: today(), status: 'open', created: Date.now() };
  S.disputes.push(d); commit('dis', d); renderDisputeBox();
  toast('Contestation envoyée à ' + nameOf((S.expenses.find(e => e.id === expenseId) || {}).payer));
}
function resolveDispute(id) {
  const d = S.disputes.find(x => x.id === id); if (!d) return;
  d.status = 'resolved'; d.resolvedBy = ME; d.resolvedAt = Date.now();
  commit('dis', d);
}
function renderCurSeg() {
  const el = document.getElementById('fCurSeg');
  el.innerHTML = Object.keys(S.currencies).map(c =>
    `<button class="${c === fCur ? 'on' : ''}" data-c="${esc(c)}">${c === 'THB' ? '฿' : c === 'EUR' ? '€' : esc(c)}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { fCur = b.dataset.c; renderCurSeg(); renderSplit(); });
  updateConv();
}
function updateConv() {
  const v = parseFloat(document.getElementById('fAmount').value) || 0;
  const other = Object.keys(S.currencies).find(c => c !== fCur);
  document.getElementById('fConv').textContent = (v && other)
    ? '= ' + fmt(v * rate(fCur) / rate(other), other) : '';
}
function closeSheet() { document.getElementById('sheet').classList.remove('open'); edit = null; }
function setMode(m) {
  mode = m;
  document.getElementById('m-equal').classList.toggle('on', m === 'equal');
  document.getElementById('m-custom').classList.toggle('on', m === 'custom');
  renderSplit();
}
function renderSplit() {
  const box = document.getElementById('splitBox');
  const cur = fCur;
  if (mode === 'equal') {
    const amt = parseFloat(document.getElementById('fAmount').value) || 0;
    const ps = S.people.filter(p => sel.has(p.id));
    // Aperçu calculé comme les comptes : en centimes de la devise principale.
    const totC = toU(amt, fCur);
    const parts = ps.length ? splitCents(totC, ps.length, 0) : [];
    const uneven = parts.length && parts[0] !== parts[parts.length - 1];
    const nb = parts.filter(x => x === parts[0]).length;
    box.innerHTML = `<div class="hint">Coche qui a participé. Le montant se divise automatiquement entre eux.</div>
      <div class="chips">${S.people.map(p => `<span class="chip ${sel.has(p.id) ? 'on' : ''}" data-p="${p.id}">${esc(p.name)}${p.id === ME ? ' (moi)' : ''}</span>`).join('')}</div>
      <div class="row" style="margin-top:8px">
        <button class="ghost mini" id="allOn">Tout le monde</button>
        ${meId() ? '<button class="ghost mini" id="noMe">Sans moi</button>' : ''}
        <button class="ghost mini" id="allOff">Aucun</button>
      </div>
      <div class="tot"><span>÷ ${ps.length || 0} participant${ps.length > 1 ? 's' : ''}</span>
        <b>${ps.length ? both(fromU(parts[0])) : fmt(0)} chacun</b></div>
      ${uneven ? `<div class="hint">Ça ne tombe pas rond : ${nb} personne${nb > 1 ? 's paient' : ' paie'} ${S.base === 'THB' ? '1 ฿' : '1 centime'} de plus, pour que le total soit exact.</div>` : ''}
      ${ps.length ? `<div class="mini-list">${ps.map((p, i) => `<span>${esc(p.name)} <b>${fmt(fromU(parts[i]))}</b></span>`).join('')}</div>` : ''}`;
    box.querySelectorAll('.chip').forEach(c => c.onclick = () => {
      sel.has(c.dataset.p) ? sel.delete(c.dataset.p) : sel.add(c.dataset.p); renderSplit();
    });
    box.querySelector('#allOn').onclick = () => { sel = new Set(S.people.map(p => p.id)); renderSplit(); };
    box.querySelector('#allOff').onclick = () => { sel = new Set(); renderSplit(); };
    const nm = box.querySelector('#noMe');
    if (nm) nm.onclick = () => { sel = new Set(S.people.map(p => p.id).filter(i => i !== ME)); renderSplit(); };
  } else {
    box.innerHTML = `<div class="hint">Entre ce que chacun doit t'envoyer. Laisse vide si la personne n'est pas concernée.</div>
      ${S.people.map(p => `<div class="split-line"><div class="nm">${esc(p.name)}${p.id === ME ? ' (moi)' : ''}</div>
        <input type="number" step="0.01" inputmode="decimal" placeholder="0" data-p="${p.id}" value="${custom[p.id] || ''}"></div>`).join('')}
      <div class="tot"><span>Réparti</span><b id="cusTot">—</b></div>
      <div class="tot" id="cusRest"></div>
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
  let c = 0; for (const k in custom) c += cents(custom[k]);
  el.textContent = fmt(c / 100, fCur);
  const tot = cents(document.getElementById('fAmount').value);
  const rest = tot - c, box = document.getElementById('cusRest');
  const who = nameOf(document.getElementById('fPayer').value || meId());
  box.className = 'tot' + (rest < 0 ? ' bad' : '');
  box.innerHTML = !tot ? '<span>Entre le montant payé au-dessus</span><b></b>'
    : rest < 0 ? `<span>Tu as réparti plus que le montant payé</span><b>${fmt(-rest / 100, fCur)} de trop</b>`
    : rest === 0 ? '<span>Tout est réparti</span><b>0</b>'
    : `<span>Reste — c'est la part de ${esc(who)}</span><b>${fmt(rest / 100, fCur)}</b>`;
}
function saveExpense() {
  const label = document.getElementById('fLabel').value.trim();
  const cur = fCur;
  const payer = document.getElementById('fPayer').value;
  const date = document.getElementById('fDate').value || today();
  const cat = document.getElementById('fCat').value;
  let amount = 0, shares = {}, parts = [];

  amount = parseFloat(document.getElementById('fAmount').value) || 0;
  if (amount <= 0) { toast('Entre le montant payé.'); return; }
  if (mode === 'custom') {
    let c = 0;
    for (const k in custom) { const v = cents(custom[k]); if (v > 0 && P(k)) { shares[k] = v / 100; c += v; } }
    if (!c) { toast('Indique ce que chacun doit t\'envoyer.'); return; }
    if (c > cents(amount)) { toast('La répartition dépasse le montant payé.'); return; }
  } else {
    parts = S.people.filter(p => sel.has(p.id)).map(p => p.id);
    if (!parts.length) { toast('Coche au moins un participant.'); return; }
  }
  const obj = {
    id: edit ? edit.id : uid(), created: edit ? (edit.created || Date.now()) : Date.now(),
    label: label || cat, amount, currency: cur, payer, date, category: cat, mode,
    participants: parts, shares
  };
  const wasEdit = !!edit;
  S.expenses = edit ? S.expenses.map(e => e.id === edit.id ? obj : e) : [...S.expenses, obj];
  // corriger une dépense referme automatiquement les contestations ouvertes
  if (wasEdit) S.disputes.filter(d => d.expenseId === obj.id && d.status === 'open')
    .forEach(d => { d.status = 'resolved'; d.resolvedBy = ME; commit('dis', d); });
  closeSheet(); commit('exp', obj);
}
function deleteExpense() {
  if (!edit || !confirm('Supprimer cette dépense ?')) return;
  const id = edit.id;
  S.expenses = S.expenses.filter(e => e.id !== id);
  S.disputes.filter(d => d.expenseId === id).forEach(d => commit('delDis', d.id));
  S.disputes = S.disputes.filter(d => d.expenseId !== id);
  closeSheet(); commit('delExp', id);
}

/* ---------------- Feuille remboursement ---------------- */
function openPayment(id, presetFrom) {
  if (S.people.length < 2) { toast('Ajoute d\'abord tes amis dans Réglages.'); tab('set'); return; }
  editPay = id ? S.payments.find(p => p.id === id) : null;
  document.getElementById('paySheetTitle').textContent = editPay ? 'Remboursement' : 'Déclarer un remboursement';
  document.getElementById('pDelBtn').classList.toggle('hidden', !editPay);
  const opts = S.people.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  document.getElementById('pFrom').innerHTML = opts;
  document.getElementById('pTo').innerHTML = opts;
  document.getElementById('pCur').innerHTML = Object.keys(S.currencies).map(c => `<option>${esc(c)}</option>`).join('');

  const b = balances();
  if (editPay) {
    document.getElementById('pFrom').value = editPay.from;
    document.getElementById('pTo').value = editPay.to;
    document.getElementById('pAmount').value = editPay.amount;
    document.getElementById('pCur').value = S.currencies[editPay.currency] ? editPay.currency : S.base;
    document.getElementById('pDate').value = editPay.date || today();
    document.getElementById('pNote').value = editPay.note || '';
  } else {
    // Par défaut : je déclare un remboursement que J'AI fait.
    // Si je suis créancier (banquier), je note ce que quelqu'un m'a rendu.
    const iOwe = meId() && (b[ME] || 0) < -0.005;
    const debtor = presetFrom || (iOwe ? ME : S.people.filter(p => p.id !== ME).sort((x, y) => (b[x.id] || 0) - (b[y.id] || 0))[0]?.id);
    document.getElementById('pFrom').value = debtor || S.people[0].id;
    document.getElementById('pTo').value = (debtor === ME)
      ? (settlements().find(s => s.from === ME) || {}).to || S.people.find(p => p.id !== ME).id
      : (meId() || S.people[0].id);
    document.getElementById('pAmount').value = '';
    document.getElementById('pCur').value = S.base;
    document.getElementById('pDate').value = today();
    document.getElementById('pNote').value = '';
  }
  updateSuggest();
  document.getElementById('paySheet').classList.add('open');
}
function closePaySheet() { document.getElementById('paySheet').classList.remove('open'); editPay = null; }
function updateSuggest() {
  const b = balances(), from = document.getElementById('pFrom').value, to = document.getElementById('pTo').value;
  const owed = r2(-(b[from] || 0));
  const el = document.getElementById('pSuggest');
  let h = '';
  if (owed > 0.005) h = `${esc(nameOf(from))} doit encore <b>${fmt(owed)}</b>. <a href="#" id="fillAll">Tout solder</a>`;
  else h = esc(nameOf(from)) + ' est à jour.';
  if (!editPay) {
    h += to === ME
      ? '<br><span class="warn-t">Tu confirmes l\'avoir reçu : ce remboursement sera validé directement.</span>'
      : (from === ME ? `<br><span class="warn-t">${esc(nameOf(to))} devra confirmer l'avoir bien reçu.</span>` : '');
  }
  el.innerHTML = h;
  const a = el.querySelector('#fillAll');
  if (a) a.onclick = ev => {
    ev.preventDefault();
    document.getElementById('pCur').value = S.base;
    document.getElementById('pAmount').value = owed.toFixed(2);
  };
}
function savePayment() {
  const from = document.getElementById('pFrom').value, to = document.getElementById('pTo').value;
  const amount = parseFloat(document.getElementById('pAmount').value) || 0;
  if (from === to) { toast('Choisis deux personnes différentes.'); return; }
  if (amount <= 0) { toast('Entre un montant.'); return; }
  // Le bénéficiaire est le seul à pouvoir valider une réception.
  const status = editPay ? editPay.status : (to === ME || !meId() ? 'confirmed' : 'pending');
  const obj = {
    id: editPay ? editPay.id : uid(), created: editPay ? (editPay.created || Date.now()) : Date.now(),
    from, to, amount, currency: document.getElementById('pCur').value,
    date: document.getElementById('pDate').value || today(),
    note: document.getElementById('pNote').value.trim(),
    status, declaredBy: editPay ? editPay.declaredBy : ME,
    decidedAt: editPay ? editPay.decidedAt || null : (status === 'confirmed' ? Date.now() : null)
  };
  S.payments = editPay ? S.payments.map(p => p.id === editPay.id ? obj : p) : [...S.payments, obj];
  closePaySheet(); commit('pay', obj);
  toast(status === 'pending'
    ? 'Déclaré — en attente de la confirmation de ' + nameOf(to)
    : fmt(payTotalBase(obj)) + ' enregistré');
}
function decidePayment(id, status) {
  const p = S.payments.find(x => x.id === id); if (!p) return;
  if (status === 'rejected' && !confirm('Indiquer que tu n\'as PAS reçu ce remboursement ? ' + nameOf(p.from) + ' le verra.')) return;
  p.status = status; p.decidedAt = Date.now(); p.decidedBy = ME;
  commit('pay', p);
  toast(status === 'confirmed' ? 'Remboursement confirmé' : 'Marqué comme non reçu');
}
function deletePayment() {
  if (!editPay || !confirm('Supprimer ce remboursement ?')) return;
  const id = editPay.id;
  S.payments = S.payments.filter(p => p.id !== id);
  closePaySheet(); commit('delPay', id);
}

/* ---------------- Feuille relevé ---------------- */
function openAccount(id) {
  const p = P(id); if (!p) return;
  const b = r2(balances()[id] || 0);
  const L = statement(id);
  document.getElementById('accTitle').textContent = 'Compte de ' + p.name + (id === ME ? ' (moi)' : '');
  const parts = L.filter(l => l.kind === 'part').reduce((s, l) => s - l.amount, 0);
  const paid = L.filter(l => l.kind === 'pay' && l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const adv = L.filter(l => l.kind === 'avance').reduce((s, l) => s + l.amount, 0);
  const pend = r2(pendingAmount(id));

  let run = 0;
  document.getElementById('accBody').innerHTML = `
    <div class="accsum">
      <div><span>Sa part des dépenses</span><b>${both(parts)}</b></div>
      ${adv ? `<div><span>Ce qu'il a avancé</span><b>${both(adv)}</b></div>` : ''}
      ${paid ? `<div><span>Déjà remboursé</span><b>${both(paid)}</b></div>` : ''}
      ${pend > 0.005 ? `<div><span class="warn-t">dont en attente de confirmation</span><b class="warn-t">${fmt(pend)}</b></div>` : ''}
      <div class="big-line"><span>${b < -0.005 ? 'Reste à payer' : b > 0.005 ? 'On lui doit' : 'Solde'}</span>
        <b class="${b >= -0.005 ? 'pos' : 'neg'}">${fmt(Math.abs(b))}<small>${fmtAlt(Math.abs(b))}</small></b></div>
    </div>
    <div class="stmt">${L.length ? L.map(l => {
      run += l.amount;
      return `<div class="line ${l.kind}">
        <div class="l1"><span class="dt">${esc(frDate(l.date))}</span>
          <span class="lb">${esc(l.label)}${l.flag ? ' <span class="tag warn">' + esc(l.flag) + '</span>' : ''}</span>
          <span class="am ${l.amount >= 0 ? 'pos' : 'neg'}">${signed(l.amount)}</span></div>
        <div class="l2"><span>${esc(l.sub || '')}${l.sub ? ' · ' : ''}${fmtAlt(Math.abs(l.amount))}</span><span>solde ${fmt(run)}</span></div>
      </div>`;
    }).join('') : '<div class="empty">Aucun mouvement.</div>'}</div>
    <div class="row" style="margin-top:14px">
      <button id="accShare">Envoyer son relevé</button>
      ${id !== ME ? '<button class="ghost" id="accPay" style="flex:0 0 auto">Remboursement</button>' : ''}
    </div>`;
  document.getElementById('accShare').onclick = () => shareStatement(id);
  const bp = document.getElementById('accPay');
  if (bp) bp.onclick = () => { closeAccSheet(); openPayment(null, id); };
  document.getElementById('accSheet').classList.add('open');
}
function closeAccSheet() { document.getElementById('accSheet').classList.remove('open'); }

async function shareStatement(id) {
  const p = P(id), b = r2(balances()[id] || 0), L = statement(id);
  let t = `Compte de ${p.name} — ${S.trip}\n\n`;
  L.forEach(l => { t += `${frDate(l.date)}  ${l.label}${l.sub ? ' (' + l.sub + ')' : ''}${l.flag ? ' [' + l.flag + ']' : ''}  ${bothSigned(l.amount)}\n`; });
  t += `\n${b < -0.005 ? 'Reste à payer' : b > 0.005 ? 'On te doit' : 'Solde'} : ${both(Math.abs(b))}`;
  if (cloudCode) t += `\n\nSuivre en direct : ${tripLink(cloudCode)}`;
  await shareText(S.trip + ' — ' + p.name, t);
}

/* ---------------- Partage cloud ---------------- */
const newCode = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), b => A[b % A.length]).join('');
};
const tripLink = code => location.origin + location.pathname + '?t=' + code;

async function createTrip() {
  cloudStatus = 'connecting'; renderCloud();
  try {
    const code = newCode();
    await Cloud.createTrip(code, metaOf(), S.expenses, S.payments, S.disputes);
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
    await connect(code); toast('Voyage rejoint !'); askWho();
  } catch (e) { cloudStatus = 'error'; renderCloud(); toast('Échec : ' + e.message); }
}
async function connect(code) {
  cloudCode = code;
  localStorage.setItem(CODE_KEY, code);
  await Cloud.watch(code, {
    onMeta: m => { if (m) { S = normalize(Object.assign({}, S, m)); render(); } },
    onExpenses: l => { S.expenses = l; render(); },
    onPayments: l => { S.payments = l; render(); },
    onDisputes: l => { S.disputes = l; render(); },
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
  const txt = `Rejoins "${S.trip}" pour suivre tes dépenses 👇\n${tripLink(cloudCode)}\n\nCode : ${cloudCode}\nÀ l'ouverture, indique qui tu es dans la liste.`;
  await shareText(S.trip, txt, 'Invitation copiée !');
}

/* ---------------- Export / partage ---------------- */
async function shareText(title, text, okMsg) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copié !'); }
  catch (e) { prompt('Copie ce texte :', text); }
}
function summaryText() {
  const tot = S.expenses.reduce((s, e) => s + expTotalBase(e), 0);
  let t = `${S.trip} — bilan\nTotal dépensé : ${both(tot)}\n\n`;
  const b = balances();
  S.people.forEach(p => { t += `${p.name} : ${bothSigned(r2(b[p.id] || 0))}\n`; });
  const st = settlements();
  t += '\nRemboursements restants :\n';
  t += st.length ? st.map(s => `• ${nameOf(s.from)} → ${nameOf(s.to)} : ${both(s.amount)}`).join('\n') : '• Tout est équilibré 🎉';
  if (cloudCode) t += `\n\nSuivre en direct : ${tripLink(cloudCode)}`;
  return t;
}
const shareSummary = () => shareText(S.trip, summaryText(), 'Bilan copié !');

function dl(name, content, type) {
  const b = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCSV() {
  const rows = [['DÉPENSES'],
    ['Date', 'Description', 'Catégorie', 'Avancé par', 'Montant', 'Devise', 'Montant ' + S.base, 'Répartition', 'Contestée',
      ...S.people.map(p => 'Part ' + p.name)]];
  [...S.expenses].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(e => {
    const sh = sharesOf(e);
    const dis = S.disputes.filter(d => d.expenseId === e.id && d.status === 'open').map(d => nameOf(d.by)).join(', ');
    rows.push([e.date, e.label, e.category, nameOf(e.payer),
      r2(expTotalBase(e) / rate(e.currency)).toFixed(2), e.currency, r2(expTotalBase(e)).toFixed(2),
      e.mode === 'custom' ? 'Montants perso' : '÷ ' + (e.participants || []).length, dis,
      ...S.people.map(p => sh[p.id] ? r2(sh[p.id]).toFixed(2) : '')]);
  });
  if (S.payments.length) {
    rows.push([], ['REMBOURSEMENTS'], ['Date', 'De', 'À', 'Montant ' + S.base, 'Statut', 'Note']);
    [...S.payments].sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(p => rows.push([
      p.date, nameOf(p.from), nameOf(p.to), r2(payTotalBase(p)).toFixed(2),
      p.status === 'pending' ? 'à confirmer' : p.status === 'rejected' ? 'refusé' : 'confirmé', p.note || '']));
  }
  const b = balances();
  rows.push([], ['SOLDES (en ' + S.base + ')'], ['Personne', 'Solde', 'Interprétation']);
  S.people.forEach(p => {
    const v = r2(b[p.id] || 0);
    rows.push([p.name, v.toFixed(2), v < -0.005 ? 'doit ' + Math.abs(v).toFixed(2) : v > 0.005 ? 'on lui doit ' + v.toFixed(2) : 'à jour']);
  });
  rows.push([], ['QUI REMBOURSE QUI']);
  settlements().forEach(s => rows.push([nameOf(s.from), 'doit à', nameOf(s.to), s.amount.toFixed(2), S.base]));
  const csv = '﻿' + rows.map(r => r.map(c => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(';')).join('\n');
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
      if (cloudCode) {
        Cloud.pushMeta(metaOf());
        S.expenses.forEach(e => Cloud.pushExpense(e));
        S.payments.forEach(p => Cloud.pushPayment(p));
        S.disputes.forEach(d => Cloud.pushDispute(d));
      }
      render(); toast('Sauvegarde restaurée.');
    } catch (e) { toast('Fichier invalide.'); }
    input.value = '';
  };
  rd.readAsText(f);
}
function resetAll() {
  if (!confirm('Effacer toutes les données de cet appareil ? Cette action est définitive.')) return;
  if (cloudCode) { Cloud.stop(); cloudCode = null; cloudStatus = 'local'; localStorage.removeItem(CODE_KEY); }
  S = structuredClone(DEFAULT); setMe(null); render();
}

/* ---------------- Init ---------------- */
Object.assign(window, {
  tab, openExpense, closeSheet, setMode, saveExpense, deleteExpense,
  openPayment, closePaySheet, savePayment, deletePayment, closeAccSheet,
  addPerson, setBase, addCur, addCat, exportCSV, exportJSON, resetAll, shareSummary,
  askWho
});
document.getElementById('fab').onclick = () => openExpense();
document.getElementById('btnAddPay').onclick = () => openPayment();
document.getElementById('btnWho').onclick = () => askWho(true);
document.getElementById('tripName').addEventListener('input', e => { S.trip = e.target.value; saveLocal(); });
document.getElementById('tripName').addEventListener('change', commitMeta);
document.getElementById('newPerson').addEventListener('keydown', e => { if (e.key === 'Enter') addPerson(); });
document.getElementById('newCat').addEventListener('keydown', e => { if (e.key === 'Enter') addCat(); });
document.getElementById('fAmount').addEventListener('input', () => { updateConv(); renderSplit(); });
document.getElementById('moreBtn').onclick = () => {
  const b = document.getElementById('moreBox');
  b.classList.toggle('hidden');
  document.getElementById('moreBtn').textContent = b.classList.contains('hidden') ? 'Plus d\'options' : 'Moins d\'options';
};
document.getElementById('pFrom').addEventListener('change', updateSuggest);
document.getElementById('pTo').addEventListener('change', updateSuggest);
document.getElementById('importFile').addEventListener('change', e => importJSON(e.target));
['sheet', 'paySheet', 'accSheet', 'whoSheet'].forEach(idd => document.getElementById(idd)
  .addEventListener('click', e => { if (e.target.id === idd) e.target.classList.remove('open'); }));

render(); tab('acc');
// Première ouverture : on demande à l'utilisateur de se désigner dans la liste.
if (!meId() && S.people.length) setTimeout(() => askWho(), 400);

(async () => {
  if (!Cloud.isConfigured()) return;
  const urlCode = new URLSearchParams(location.search).get('t');
  const saved = localStorage.getItem(CODE_KEY);
  const code = (urlCode || saved || '').toUpperCase();
  if (!code) return;
  cloudStatus = 'connecting'; renderCloud();
  try {
    if (urlCode && urlCode.toUpperCase() !== saved && !await Cloud.tripExists(code)) {
      cloudStatus = 'local'; renderCloud(); toast('Ce lien de voyage n\'existe plus.'); return;
    }
    await connect(code);
    history.replaceState({}, '', location.pathname);
    setTimeout(() => askWho(), 700);
  } catch (e) { cloudStatus = 'error'; renderCloud(); }
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  // Une nouvelle version déployée prend la main : on recharge une seule fois
  // pour que personne ne reste bloqué sur l'ancienne app en cache.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}
