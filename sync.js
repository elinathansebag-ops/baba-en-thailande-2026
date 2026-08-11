/* Synchronisation temps réel via Firebase Firestore.
   Si firebase-config.js n'est pas rempli, l'app fonctionne en mode local. */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
let db = null, unsubs = [], booting = null;

function configured() {
  return !!(firebaseConfig && firebaseConfig.apiKey && !/^(VOTRE|YOUR|xxx)/i.test(firebaseConfig.apiKey) && firebaseConfig.projectId);
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
    const a = auth.getAuth(app);
    if (!a.currentUser) await auth.signInAnonymously(a);
    db = { fs, d: fs.getFirestore(app) };
    try { await fs.enableIndexedDbPersistence(db.d); } catch (e) { /* multi-onglets : ignoré */ }
    return db;
  })();
  return booting;
}

function clean(o) { return JSON.parse(JSON.stringify(o)); }

export const Cloud = {
  isConfigured: configured,

  async tripExists(code) {
    const { fs, d } = await boot();
    const s = await fs.getDoc(fs.doc(d, 'trips', code));
    return s.exists();
  },

  async createTrip(code, meta, expenses) {
    const { fs, d } = await boot();
    await fs.setDoc(fs.doc(d, 'trips', code), Object.assign(clean(meta), { createdAt: Date.now(), updatedAt: Date.now() }));
    for (const e of expenses || []) {
      await fs.setDoc(fs.doc(d, 'trips', code, 'expenses', e.id), clean(e));
    }
    return code;
  },

  async watch(code, { onMeta, onExpenses, onStatus }) {
    const { fs, d } = await boot();
    this.stop();
    this.code = code;
    unsubs.push(fs.onSnapshot(fs.doc(d, 'trips', code), s => {
      if (s.exists()) {
        const m = s.data();
        delete m.createdAt; delete m.updatedAt;
        onMeta(m);
      }
      onStatus && onStatus('live');
    }, () => onStatus && onStatus('error')));

    unsubs.push(fs.onSnapshot(fs.collection(d, 'trips', code, 'expenses'), snap => {
      onExpenses(snap.docs.map(x => x.data()));
      onStatus && onStatus('live');
    }, () => onStatus && onStatus('error')));
  },

  async pushMeta(meta) {
    if (!this.code) return;
    const { fs, d } = await boot();
    await fs.setDoc(fs.doc(d, 'trips', this.code), Object.assign(clean(meta), { updatedAt: Date.now() }), { merge: true });
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

  stop() {
    unsubs.forEach(u => { try { u(); } catch (e) {} });
    unsubs = []; this.code = null;
  }
};
