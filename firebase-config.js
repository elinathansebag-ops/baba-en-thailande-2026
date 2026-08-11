/* ---------------------------------------------------------------
   Configuration Firebase
   ---------------------------------------------------------------
   Remplace les valeurs ci-dessous par celles de TON projet Firebase.
   Où les trouver :
     console.firebase.google.com → ton projet → ⚙️ Paramètres du projet
     → section « Vos applications » → application Web → « Configuration SDK »

   Ces clés ne sont PAS des secrets : elles sont publiques par nature
   dans une app web. La sécurité est assurée par les règles Firestore
   (voir firestore.rules).

   Tant que ce fichier n'est pas rempli, l'app marche en mode local
   (données sur le téléphone uniquement, pas de partage).
--------------------------------------------------------------- */

export const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_PROJET.firebaseapp.com",
  projectId: "VOTRE_PROJET",
  storageBucket: "VOTRE_PROJET.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000000000"
};
