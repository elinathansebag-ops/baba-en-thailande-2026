# 🌅 Thaïlande 2026 — Avances

Petite app web (PWA) pour gérer les avances d'argent entre amis en vacances :
une seule personne paie sur place, l'app calcule qui doit quoi à qui.

- 🏠 **Écran d'accueil = les comptes** : la liste des 8 participants avec le solde de chacun, on appuie sur un nom pour voir son relevé détaillé
- ➕ **Saisie en 3 secondes** : le montant, qui participe, c'est tout. Payeur, date et catégorie sont repliés dans « Plus d'options »
- 🇹🇭 **Baht et euro affichés partout**, base 1 € = 37,05 ฿, saisie en ฿ par défaut avec conversion en direct
- 👤 **Un compte par personne** : chaque dépense s'inscrit dans le compte de chaque participant avec sa date, son libellé et son montant — comme un relevé bancaire
- ➗ **Deux modes de répartition** : parts égales entre les participants cochés (bouton *Tout le monde* / *Sans moi*), ou montant précis par personne (le prix du plat de chacun)
- 🪙 **Au centime près** : la répartition se fait sur les centimes d'euro (pas sur les baht), donc les comptes tombent juste même quand on paie en devise étrangère. Les centimes restants sont attribués un par un et tournent d'une dépense à l'autre
- ↩️ **Remboursements partiels** avec **double validation** : celui qui paie déclare, celui qui reçoit confirme. Tant que ce n'est pas confirmé, la ligne reste marquée « à confirmer » chez les deux
- ⚠️ **Contestation d'une dépense** : un participant peut signaler une erreur, le payeur corrige ou maintient
- 📵 **Identité par appareil** : chacun désigne son propre nom sur son téléphone, sans toucher à celui des autres
- 📤 **Relevé individuel** envoyable par message à chacun
- 📱 **Installable** sur l'écran d'accueil (iPhone et Android), fonctionne hors ligne
- 👥 **Partage temps réel** : tes amis rejoignent le voyage avec un code, tout le monde voit son compte en direct
- 💱 **Multi-devises** avec taux de change
- 🏷️ **Catégories** et totaux par catégorie
- ⚖️ **Solde final** : minimum de virements pour tout équilibrer
- 📊 **Export CSV** avec une colonne par personne, sauvegarde JSON
- 🎨 **Thème coucher de soleil** : mangue, corail, mer turquoise, une couleur par personne, mode sombre « nuit tropicale » automatique
- 🔒 Aucune publicité, aucun tracking

---

## 1. Déployer sur Vercel

1. Va sur [vercel.com/new](https://vercel.com/new) et connecte-toi avec GitHub.
2. Choisis **Import** sur ce dépôt.
3. Ne touche à rien (le `vercel.json` fait le travail) → **Deploy**.
4. Tu obtiens une adresse du type `https://vacances-xxxx.vercel.app`.

Chaque `git push` sur `main` redéploie automatiquement.

---

## 2. Activer le partage entre amis (Firebase)

Sans cette étape l'app marche très bien, mais en **mode local** : les données
restent sur ton téléphone et tes amis ne voient rien.

### a. Créer le projet

1. [console.firebase.google.com](https://console.firebase.google.com) → **Créer un projet**
   (nom au choix, ex. `avances-vacances`). Google Analytics : **désactivé**, inutile ici.
2. Dans le menu **Build → Firestore Database** → **Créer une base de données**
   → mode **production** → emplacement `eur3 (europe-west)`.

> L'authentification anonyme est **facultative**. Les règles fournies protègent
> l'accès par le code du voyage (~1 milliard de combinaisons). Pour durcir :
> active **Anonyme** dans *Build → Authentication → Sign-in method*, ajoute ton
> domaine dans *Authentication → Settings → Domaines autorisés*, puis mets
> `request.auth != null &&` devant chaque condition de `firestore.rules`.

### b. Récupérer les clés

1. ⚙️ **Paramètres du projet** → onglet **Général** → section **Vos applications**
2. Clique sur l'icône **Web `</>`**, donne un surnom, **Enregistrer l'application**
3. Copie l'objet `firebaseConfig` affiché
4. Colle-le dans `public/firebase-config.js` (remplace les `VOTRE_...`)

> Ces clés sont **publiques par nature** dans une app web : ce ne sont pas des mots
> de passe. La sécurité vient des règles Firestore ci-dessous.

### c. Publier les règles de sécurité

Dans **Firestore Database → Règles**, colle le contenu de [`firestore.rules`](firestore.rules)
puis **Publier**.

Puis `git commit` + `git push` : Vercel redéploie et le partage est actif.

---

## 3. Utilisation

1. Ouvre le site, puis **Partager → Sur l'écran d'accueil** (iPhone)
   ou **⋮ → Installer l'application** (Android).
2. Onglet **Réglages** : ajoute tes amis, tes devises, tes catégories.
3. **Créer un voyage partagé** → un code à 6 lettres apparaît → **Envoyer l'invitation**.
   Tes amis ouvrent le lien, et ils sont dans le même voyage.
4. Bouton **+** pour chaque dépense : qui a payé, combien, et comment ça se partage.
5. Onglet **Bilan** : qui rembourse qui, à la fin des vacances.

---

## Structure du projet

```
public/
  index.html            interface
  styles.css            styles (thème clair et sombre automatique)
  app.js                état, calculs, rendu
  sync.js               synchronisation Firestore temps réel
  firebase-config.js    ← tes clés Firebase
  manifest.webmanifest  PWA
  sw.js                 service worker (hors ligne)
  icons/
firestore.rules         règles de sécurité
vercel.json             configuration de l'hébergement
```

Aucune dépendance à installer, aucune étape de build : c'est du HTML/CSS/JS
statique. Le SDK Firebase est chargé à la demande depuis le CDN Google.

### Modèle de données

```
trips/{CODE}                → nom du voyage, devises, catégories, participants
trips/{CODE}/expenses/{id}  → une dépense = un document
trips/{CODE}/payments/{id}  → un remboursement = un document
trips/{CODE}/disputes/{id}  → une contestation = un document
```

L'identité de l'utilisateur (« moi ») n'est **pas** dans ce modèle : elle vit
dans le `localStorage` de chaque appareil. C'est ce qui permet à huit personnes
d'utiliser le même voyage sans se marcher dessus.

### Cycle de vie d'un remboursement

```
déclaré par le débiteur  →  status: 'pending'    (compte déjà dans le solde, marqué « à confirmer »)
        ↓ le créancier confirme
                            status: 'confirmed'
        ↓ ou le créancier refuse
                            status: 'rejected'   (ne compte plus dans le solde)
```

Si c'est le créancier lui-même qui saisit le remboursement (argent liquide
rendu en main propre), il est directement `confirmed` : confirmer sa propre
réception n'aurait pas de sens.

Chaque dépense et chaque remboursement est un document séparé : deux amis
peuvent saisir en même temps sans jamais écraser le travail de l'autre.

Le solde de chacun n'est jamais stocké, il est **recalculé** à partir des
dépenses et des remboursements :

```
solde = ce qu'il a avancé
      − la somme de ses parts
      + ce qu'il a déjà remboursé
      − ce qu'on lui a remboursé
```

Solde négatif = il doit de l'argent. La somme de tous les soldes vaut
toujours exactement zéro : c'est le test qui garantit qu'aucun centime
ne s'est perdu.

---

## Développement local

```bash
cd public && python3 -m http.server 8000
# puis http://localhost:8000
```

## Licence

MIT — fais-en ce que tu veux.
