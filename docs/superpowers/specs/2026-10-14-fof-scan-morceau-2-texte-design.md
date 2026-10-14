# FOF Scan — Morceau 2 : scan → texte, Word, Excel — Conception

Date : 14/10/2026
Statut : validée à l'oral, partie par partie ; en attente de relecture du document.

## 1. Contexte et but

Le morceau 1 (le scanner) est en ligne. Le morceau 2 transforme les pages
scannées en **texte modifiable**, puis en fichiers **Word** et **Excel**, comme
les fonctions « Extraire le texte », « Vers Word » et « Vers Excel » de
CamScanner (référence explicite du projet, `docs/reference-camscanner.md`).

Documents réels de l'utilisateur : lettres et annexes d'audit imprimées (avec
tableaux à traits), affichettes, **reçus d'achat SCOOPAB** (formulaire imprimé
rempli au stylo), **pages de cahier** écrites en attaché.

Décisions prises avec l'utilisateur :

- Texte → Word **et** tableaux → Excel livrés ensemble.
- Excel = **le tableau tel quel** (les cases de la feuille deviennent les
  cellules), pas « une ligne par reçu ».
- Lecteur : **PaddleOCR PP-OCRv6**, en **mélange** : repérage des lignes par le
  modèle « tiny », lecture par le modèle « small ».
- Correction **ligne par ligne**, chaque ligne sous son morceau de photo.
- Tableaux repérés par les **traits du quadrillage** (OpenCV), sans modèle de
  tableaux.
- Toujours gratuit, sur le téléphone, sans internet après le premier
  téléchargement du lecteur.

## 2. Essai comparatif (13–14/10/2026)

Sur les 8 pages réelles (photos locales `tests/photos/`, jamais publiées),
redressées par l'appli puis filtrées « Couleur magique » :

| | Tesseract 7 (fra) | Paddle tiny | Paddle small | **Mélange** |
|---|---|---|---|---|
| Imprimé (lettre, annexe) | correct mais parasites | très bon | excellent | excellent |
| Reçu au stylo (252 / 1200 / 302400) | illisible | 252 seul | les 3 justes + nom | 252 et 1200 justes |
| Cahier attaché | illisible | presque illisible | « Audit Tairrad A Venir » | « Audit Taixtrade A Venir » |
| Confiance moyenne | 27–72 % | 71–98 % | 90–99 % | 85–100 % |
| Temps / page (PC, 1 fil) | 1–5 s | 2–10 s | 7–47 s | 4–26 s |
| Téléchargement | ~5 Mo | 6 Mo | 30 Mo | **23 Mo** |

Constats : l'imprimé est très bien lu ; les chiffres au stylo souvent, à
vérifier ; l'écriture attachée reste à corriger à la main. La lecture ligne par
ligne mélange les colonnes d'un tableau → il faut les cases.

Modèles officiels (Apache-2.0), archives `*_onnx_infer.tar` du serveur
PaddleX : `PP-OCRv6_tiny_det` (inference.onnx 1,8 Mo) et `PP-OCRv6_small_rec`
(inference.onnx 21,2 Mo + `inference.yml` contenant le dictionnaire de
18 709 caractères, accents compris).

## 3. Parcours

1. **Lancer** : bouton **« Texte »** sur l'écran d'un document, à côté
   d'« Exporter ». La première fois : « Télécharger le lecteur de texte
   (23 Mo, une seule fois) ? » ; ensuite hors ligne.
2. **Lire** : toutes les pages du document, barre « Lecture de la page 2 sur
   5… » et bouton **Annuler**. Une page couchée est remise d'aplomb
   automatiquement.
3. **Écran « Texte »** : les pages défilent ; en haut de chaque page un
   interrupteur **Texte / Tableau** (réglé automatiquement).
   - **Texte** : une carte par ligne lue = morceau de photo + texte. Lignes
     douteuses (confiance < 80 %) en **orange**. Toucher une ligne → champ de
     saisie.
   - **Tableau** : grille des cases ; toucher une case → son morceau de photo
     au-dessus d'un champ de saisie.
4. **Gardé avec le document** : lectures et corrections enregistrées. Si une
   page est modifiée ensuite (recadrage, filtre, rotation), sa lecture devient
   « à relire » avec un bouton **Relire cette page**.
5. **Sorties** (bas de l'écran), préparées puis partagées comme le PDF :
   - **Word** : un fichier pour tout le document ; lignes → paragraphes,
     tableaux → tableaux Word ; saut de page entre les pages.
   - **Excel** : un onglet par page ; page Tableau → une case par cellule
     (cases fusionnées conservées) ; page Texte → une ligne par rangée en
     colonne A.
   - **Copier le texte** : tout le texte dans le presse-papiers.

Hors périmètre : mise en forme d'origine (gras, couleurs, tailles), tableaux
sans traits (ils deviennent une liste de lignes), PDF → Word / Excel
(morceau 3), lecture par IA en ligne.

## 4. Tableaux

1. **Cases** : longs traits horizontaux et verticaux repérés par OpenCV
   (seuil adaptatif + ouvertures morphologiques par de longs segments) ; les
   cases sont les rectangles formés par leurs croisements. Une case qui couvre
   plusieurs colonnes ou rangées reste une seule case (cellule fusionnée).
2. **Rangement** : chaque ligne lue va dans la case qui contient son centre ;
   plusieurs lignes d'une même case sont jointes par un retour à la ligne.
   Seul le plus grand groupe de cases qui se touchent forme le tableau (une
   case à cocher isolée est écartée) ; une case coupée par le bord de la photo
   reste fermée. Le repérage des lignes s'arrête de lui-même aux traits : pas de
   redécoupage (essai sur le reçu SCOOPAB).
3. **Hors tableau** : le texte au-dessus et au-dessous reste à sa place
   (paragraphes avant / après dans Word, rangées avant / après dans Excel).
4. **Cahiers** : si la grande majorité des cases repérées sont vides (carreaux
   Seyès), la page passe d'elle-même en mode Texte.
5. **Valeurs** : tout est écrit en texte dans Excel (un numéro comme
   07 48 57 82 12 n'est pas abîmé).

## 5. Architecture

| Pièce | Rôle | Dépend de |
|---|---|---|
| `lecture/paddle` | repérage des lignes (DB : seuil 0,3, boîte 0,6, élargissement 1,5), découpe redressée de chaque ligne, lecture (hauteur 48, décodage CTC) ; image réduite à **1600 px** au plus pour le repérage | onnxruntime-web, OpenCV.js |
| `lecture/sens` | page couchée : si la plupart des boîtes sont hautes, essai des deux quarts de tour, garde le meilleur score de lecture | `lecture/paddle` |
| `lecture/tableau` | cases à partir des traits ; rangement des lignes dans les cases ; décision Texte / Tableau | OpenCV.js |
| `lecture/modeles` | téléchargement à la demande depuis `BASE_URL/modeles/ocr/`, rangement dans le Cache Storage (`fof-scan-lecteur`), état « installé » | Cache API |
| `export/docx`, `export/xlsx` | fabrication des fichiers Office (XML minimal + zip **fflate**, déjà présent) | fflate |
| `rangement` | magasin IndexedDB **`lectures`** (version 3) : par page, mode, lignes (boîte, texte, confiance, corrigé), cases, empreinte de la page lue | idb |
| écrans | bouton « Texte », écran **Texte** (lecture, correction, sorties) | Preact |

- La lecture tourne dans le **worker de traitement existant** (OpenCV et
  onnxruntime y sont déjà) ; nouvelles requêtes `lire` / `relire`. Les sessions
  du lecteur sont créées à la première lecture et **libérées** en quittant
  l'écran Texte (mémoire de Safari).
- Modèles servis par GitHub Pages avec l'appli (`public/modeles/ocr/`, licence
  Apache-2.0 et `LISEZMOI.txt` joints), **exclus du précache** du service
  worker.
- La sauvegarde « Sauvegarder tout » inclut les lectures (optionnelles à la
  restauration, comme les dossiers).

## 6. Erreurs

- Téléchargement impossible (pas d'internet) : message clair + **Réessayer**.
- Mémoire insuffisante : lecture page par page, message si une page échoue,
  les autres restent lues.
- Page sans texte : « Aucun texte trouvé » ; Word / Excel restent possibles.
- Lecture annulée : les pages déjà lues sont gardées.

## 7. Vérifications

- **Tests unitaires** : décodage CTC et dictionnaire ; boîtes du repérage sur
  cartes factices ; choix du sens ; cases sur tableaux dessinés (simples,
  fusionnés, carreaux de cahier) ; rangement des lignes ; fichiers `.docx` et
  `.xlsx` décompressés et leur XML contrôlé ; magasin `lectures` et migration
  v2 → v3.
- **Photos réelles** (local, non publié) : test qui lit les 8 pages et produit
  une planche (lignes et cases dessinées) et les textes, contrôlés à l'œil ;
  repères chiffrés du reçu (252, 1200, 302400).
- **Navigateur** : écran Texte, correction, fichiers Word / Excel ouverts.
- **iPhone** : essai par l'utilisateur après publication (temps de lecture,
  mémoire).
