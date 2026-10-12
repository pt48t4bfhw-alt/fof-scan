# FOF Scan — Morceau 1 : le scanner — Conception

Date : 12/10/2026
Statut : validée à l'oral, partie par partie ; en attente de relecture du document.

## 1. Contexte et but

L'utilisateur scanne chaque jour des documents de travail avec CamScanner, dont
les fonctions utiles sont derrière un abonnement. FOF Scan est une appli
personnelle, gratuite, qui remplace CamScanner sur **iPhone**.

Le projet complet est découpé en trois morceaux, chacun conçu, planifié et livré
séparément :

1. **Le scanner** (ce document) : photo → bords → redressement → filtres → PDF
   multipage → partage, et rangement des documents.
2. **Scan → Word / Excel** : reconnaissance de texte (OCR) sur l'appareil, avec
   un écran de correction (photo à côté du résultat) avant export. Les
   documents sont des formulaires imprimés remplis en partie à la main.
3. **Conversions** PDF → Word / Excel et Word / Excel → PDF.

Choix retenu (option A) : **tout se passe sur l'iPhone, gratuitement, sans
internet** après installation. Une « lecture par IA » payante pour l'écriture
manuscrite pourra s'ajouter plus tard au morceau 2, sans rien casser ici.

## 2. Contraintes

- **iPhone, sans compte Apple payant** : pas d'appli native ni d'Expo Go récent
  (Expo Go de l'App Store est plafonné au SDK 54). → **Appli web installable
  (PWA)**, ajoutée à l'écran d'accueil depuis Safari.
- La caméra et l'installation exigent une adresse **https** → hébergement
  **GitHub Pages** (dépôt public `fof-scan` ; seul le programme est publié,
  jamais les documents).
- Les documents ne quittent **jamais** le téléphone, sauf quand l'utilisateur
  les partage lui-même.
- Safari iOS limite la mémoire des images (canvas) : les photos sont ramenées à
  **3 000 px** au plus sur le grand côté.

## 3. Écrans et parcours

1. **Accueil — mes documents** : liste (plus récent en haut) avec miniature,
   nom, date, nombre de pages ; recherche par nom ; gros bouton **Scanner** ;
   bouton **Importer** (galerie, ou appareil photo natif de l'iPhone) ; menu
   avec **Sauvegarder tout** / **Restaurer**.
2. **Viseur** : caméra arrière en direct ; contour de la feuille détectée
   dessiné en vert ; **prise automatique** quand la feuille est stable (≈ 1 s,
   désactivable) ou bouton manuel ; **mode multipage** avec compteur
   (« 3 pages ») et bouton **Terminé**.
3. **Recadrage** : 4 coins pré-placés par la détection, déplaçables au doigt
   avec **loupe** ; rotation par quart de tour ; redressement automatique de la
   perspective.
4. **Filtres** : **Original**, **Amélioré**, **Noir & blanc**, **Gris** ;
   « Appliquer à toutes les pages ».
5. **Document** : pages en grille ; **réordonner** par glisser ; **supprimer** ;
   **ajouter** des pages (scan ou import) ; **renommer** ; rouvrir une page pour
   la recadrer ou changer de filtre.
6. **Exporter / partager** : **PDF** (format **A4** ou **taille réelle** ;
   qualité **Normale** ou **Légère**) ou **JPG** ; partage via le menu
   Partager de l'iPhone (WhatsApp, Mail, Fichiers, AirDrop).

Hors périmètre : comptes, cloud, publicité, OCR et conversions (morceaux 2 et
3), signature / annotation.

## 4. Architecture

Appli web statique : **Vite + TypeScript + Preact**, service worker
(**vite-plugin-pwa**) qui met tout en cache pour le fonctionnement hors ligne.

Pièces (un rôle chacune, testables séparément) :

| Pièce | Rôle | Dépend de |
|---|---|---|
| `camera` | ouvre la caméra arrière (`getUserMedia`, résolution max demandée), fournit des images du flux et la prise pleine résolution | navigateur |
| `detection` | trouve les 4 coins de la feuille dans une image ; tourne dans un **Web Worker** avec **OpenCV.js** chargé à la demande | OpenCV.js |
| `redressement` | transforme le quadrilatère en rectangle droit (transformation de perspective), proportions déduites des côtés | OpenCV.js |
| `filtres` | Amélioré (normalisation du fond + étirement du contraste), Noir & blanc (seuil adaptatif après normalisation), Gris (niveaux de gris + contraste) | OpenCV.js |
| `rangement` | documents et pages dans **IndexedDB** ; demande de stockage permanent ; sauvegarde / restauration | IndexedDB, fflate |
| `export` | PDF (**pdf-lib**) et JPG ; ouverture du menu Partager (`navigator.share` avec fichiers) | pdf-lib |
| `ecrans` | les 6 écrans ; n'utilisent que les pièces ci-dessus | Preact |

**Détection en direct** : sur des images du flux réduites (~480 px), environ
5 fois par seconde, dans le worker pour ne pas figer l'écran. Prise
automatique quand les coins bougent de moins de 2 % pendant ≈ 1 s ; l'image
pleine résolution est alors redétectée avant le recadrage.

**Import** : `<input type="file" accept="image/*">` (Safari convertit le HEIC
en JPEG) ; donne aussi accès à l'appareil photo natif, en pleine résolution.

## 5. Données

- **Document** : `id`, `nom` (par défaut « Scan JJ-MM-AAAA HHhMM »), `créé`,
  `modifié`, `pages` (liste ordonnée d'identifiants de pages).
- **Page** : `id`, `documentId`, `original` (JPEG ≤ 3 000 px), `coins` (4
  points), `rotation` (0/90/180/270), `filtre`, `traitée` (JPEG), `miniature`
  (JPEG ~300 px).

Garder l'original permet de refaire recadrage et filtre sans perte.

**Sauvegarde** : un fichier `FOF-Scan-sauvegarde-AAAA-MM-JJ.zip` contenant un
`manifeste.json` (documents, pages, coins, filtres) et toutes les images ;
**Restaurer** recrée tout à l'identique (les documents déjà présents avec le
même identifiant ne sont pas dupliqués).

## 6. Export PDF

- **A4** : chaque page centrée et ajustée sur une page A4, portrait ou paysage
  selon l'orientation de l'image.
- **Taille réelle** : la page PDF prend les proportions de l'image.
- **Normale** : JPEG qualité 0,85, ≤ 2 480 px (≈ 300 ppp en A4).
- **Légère** : JPEG qualité 0,6, ≤ 1 654 px (≈ 200 ppp) — pour WhatsApp.
- Fabrication page par page avec barre de progression.
- Nom du fichier = nom du document.

## 7. Cas difficiles

- **Caméra refusée** : message expliquant Réglages → Safari → Appareil photo ;
  le bouton Importer reste utilisable.
- **Feuille non détectée** : toute l'image est sélectionnée, coins à placer à
  la main.
- **Première ouverture** : OpenCV.js (quelques Mo) se télécharge une fois, avec
  barre de progression ; ensuite tout fonctionne hors ligne.
- **Mémoire pleine** (`QuotaExceededError`) : message clair proposant
  Sauvegarder tout puis suppression d'anciens documents ; aucune perte de ce
  qui était déjà enregistré.
- **Gros documents** (30 pages et plus) : traitement page par page.
- **Stockage vidé par l'iPhone** (manque de place) : demande de stockage
  permanent au premier lancement + Sauvegarder tout / Restaurer.
- **Mise à jour** : bandeau « Nouvelle version disponible — toucher pour
  recharger » ; les documents ne sont pas touchés.
- **Partage non disponible** (`navigator.share` absent) : téléchargement du
  fichier à la place.

## 8. Tests

1. **Tests automatiques (Vitest)** : détection des coins (sur des photos
   réelles), redressement (géométrie), filtres, rangement (avec
   `fake-indexeddb`), PDF (nombre de pages, format, taille), sauvegarde →
   restauration identique.
2. **Photos réelles de l'utilisateur** : une dizaine de photos prises avec son
   iPhone (fiches, bordereaux, reçus ; sur table, lumière moyenne, de
   travers). Elles restent sur le PC, dans `tests/photos/`, **exclu du dépôt
   public** (`.gitignore`) ; les tests qui les utilisent tournent sur le PC et
   sont sautés quand le dossier est absent.
3. **Essai navigateur sur PC** avec un écran au format iPhone.
4. **Essai final sur l'iPhone** avec une liste de vérifications.

## 9. Critères de réussite

- Scanner et partager un PDF d'une page en **moins de 15 secondes**.
- Détection correcte sur **au moins 8 photos sur 10** de l'utilisateur.
- PDF d'une page en qualité Légère **< 300 Ko**.
- L'appli s'ouvre et scanne **en mode avion** une fois installée.
- Sauvegarde puis restauration : documents **identiques**.

## 10. Ce que l'utilisateur doit faire

- Créer un compte GitHub gratuit (guidé), puis se connecter une fois sur le PC.
- Fournir les photos de test.
- Installer l'appli sur l'iPhone (Safari → Partager → « Sur l'écran
  d'accueil ») et suivre la liste de vérifications finale.
