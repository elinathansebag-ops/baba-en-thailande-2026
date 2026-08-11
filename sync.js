/* Synchronisation temps réel via Firebase Firestore.
   Si firebase-config.js n'est pas rempli, l'app fonctionne en mode local.

   Modèle de données :
     trips/{CODE}                  → nom, devises, catégories, participants
     trips/{CODE}/expenses/{id}    → une dépense = un document
     trips/{CODE}/payments/{id}    → un remboursement = un document
     trips/{CODE}/disputes/{id}    → une contestation = un document

   Chaque dépense et chaque remboursement étant un document séparé,
   deux personnes peuvent saisir en même temps sans jamais s'écraser. */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
let db = null, unsubs = [], booting = null;

function configured() {
  return !!(firebaseConfig && firebaseConfig.apiKey
    && !/^(VOTRE|YOUR|xxx)/i.test(firebaseConfig.apiKey) && firebaseConfig.projectId);
}

async function boot() {
  if (db) return db;
  if (booting) return booting;
  booting = (async () => {
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    const app = initializeApp(firebaseConfig);
    // Connexion anonyme : optionnelle. Si elle n'est pas activée dans la console
    // Firebase, on continue quand même (règles Firestore en mode « code seul »).
    try {
      const a = auth.getAuth(app);
      if (!a.currentUser) await auth.signInAnonymously(a);
    } catch (e) {
      console.info('Connexion anonyme non activée — mode code seul.');
    }
    db = { fs, d: fs.getFirestore(app) };
    try { await fs.enableIndexedDbPersistence(db.d); } catch (e) { /* multi-onglets : ignoré */ }
    return db;
  })();
  return booting;
}

const clean = o => JSON.parse(JSON.stringify(o));

export const Cloud = {
  isConfigured: configured,

  async tripExists(code) {
    const { fs, d } = await boot();
    return (await fs.getDoc(fs.doc(d, 'trips', code))).exists();
  },

  async createTrip(code, meta, expenses, payments, disputes) {
    const { fs, d } = await boot();
    await fs.setDoc(fs.doc(d, 'trips', code),
      Object.assign(clean(meta), { createdAt: Date.now(), updatedAt: Date.now() }));
    for (const e of expenses || []) await fs.setDoc(fs.doc(d, 'trips', code, 'expenses', e.id), clean(e));
    for (const p of payments || []) await fs.setDoc(fs.doc(d, 'trips', code, 'payments', p.id), clean(p));
    for (const x of disputes || []) await fs.setDoc(fs.doc(d, 'trips', code, 'disputes', x.id), clean(x));
    return code;
  },

  async watch(code, { onMeta, onExpenses, onPayments, onDisputes, onStatus }) {
    const { fs, d } = await boot();
    this.stop();
    this.code = code;
    const ok = () => onStatus && onStatus('live');
    const ko = () => onStatus && onStatus('error');

    unsubs.push(fs.onSnapshot(fs.doc(d, 'trips', code), s => {
      if (s.exists()) { const m = s.data(); delete m.createdAt; delete m.updatedAt; onMeta(m); }
      ok();
    }, ko));
    unsubs.push(fs.onSnapshot(fs.collection(d, 'trips', code, 'expenses'), s => {
      onExpenses(s.docs.map(x => x.data())); ok();
    }, ko));
    unsubs.push(fs.onSnapshot(fs.collection(d, 'trips', code, 'payments'), s => {
      onPayments(s.docs.map(x => x.data())); ok();
    }, ko));
    unsubs.push(fs.onSnapshot(fs.collection(d, 'trips', code, 'disputes'), s => {
      onDisputes(s.docs.map(x => x.data())); ok();
    }, ko));
  },

  async pushMeta(meta) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.setDoc(fs.doc(d, 'trips', this.code),
      Object.assign(clean(meta), { updatedAt: Date.now() }), { merge: true });
  },

  async pushExpense(e) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.setDoc(fs.doc(d, 'trips', this.code, 'expenses', e.id), clean(e));
  },

  async removeExpense(id) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.deleteDoc(fs.doc(d, 'trips', this.code, 'expenses', id));
  },

  async pushPayment(p) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.setDoc(fs.doc(d, 'trips', this.code, 'payments', p.id), clean(p));
  },

  async removePayment(id) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.deleteDoc(fs.doc(d, 'trips', this.code, 'payments', id));
  },

  async pushDispute(x) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.setDoc(fs.doc(d, 'trips', this.code, 'disputes', x.id), clean(x));
  },

  async removeDispute(id) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.deleteDoc(fs.doc(d, 'trips', this.code, 'disputes', id));
  },

  stop() {
    unsubs.forEach(u => { try { u(); } catch (e) {} });
    unsubs = []; this.code = null;
  }
};
