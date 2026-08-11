/* ---------------------------------------------------------------
   Configuration Firebase — projet « thailande »
   ---------------------------------------------------------------
   Ces clés ne sont PAS des secrets : dans une application web elles
   sont forcément visibles par tout le monde. La sécurité est assurée
   par les règles Firestore (fichier firestore.rules), qui n'autorisent
   l'accès qu'aux voyages dont on connaît le code.

   Où les retrouver / les changer :
     console.firebase.google.com → thailande → ⚙️ Paramètres du projet
     → Général → Vos applications → Configuration du SDK
--------------------------------------------------------------- */

export const firebaseConfig = {
  apiKey: "AIzaSyApV3XYsotLrQyVGakPbRy9xWpD3Cv_nTE",
  authDomain: "thailande-4bd0f.firebaseapp.com",
  projectId: "thailande-4bd0f",
  storageBucket: "thailande-4bd0f.firebasestorage.app",
  messagingSenderId: "252740349329",
  appId: "1:252740349329:web:d678c92405b0e67b703e30"
};
