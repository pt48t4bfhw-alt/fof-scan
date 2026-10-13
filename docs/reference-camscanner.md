# FOF Scan — Référence CamScanner

Date : 13/10/2026. But : prendre CamScanner comme modèle, fonction par fonction, pour
éviter les allers-retours. Sources en bas de page.

Légende : ✅ déjà dans FOF Scan · 🟡 partiel · ❌ absent · ⛔ impossible dans une appli web iPhone

## 1. Prise de vue

| CamScanner | FOF Scan |
|---|---|
| Mode simple (un déclenchement = une page) et mode rafale avec compteur | ✅ multipage avec compteur |
| Détection automatique du bord dans le viseur | 🟡 marche, cadrage à améliorer (voir §6) |
| Prise automatique (et « tourner la page » en mode livre) | ✅ prise automatique ; ❌ mode livre |
| Grille d'aide | ❌ |
| Niveau horizontal (garder le téléphone à plat) | ❌ (faisable avec le capteur d'orientation) |
| Zoom | ❌ |
| Flash | ⛔ Safari ne permet pas d'allumer le flash depuis une appli web |
| Import depuis l'album, recadrage et filtre appliqués à tout le lot | ✅ import ; 🟡 le lot passe par le recadrage page par page |

## 2. Recadrage

| CamScanner | FOF Scan |
|---|---|
| Bord détecté et affiché automatiquement | ✅ |
| 8 poignées : 4 coins + 4 milieux qui déplacent tout le côté | ✅ |
| Loupe dans un coin pendant le glisser | ✅ |
| Bouton « toute l'image » | ✅ « Tout » |
| Bouton **réinitialiser** (revenir au bord détecté) | ❌ |
| Les côtés s'aimantent aux bords de la feuille | ❌ |
| Cadre **rouge** si la forme ne peut pas être recadrée | ❌ |
| Rotation | ✅ |

## 3. Filtres (« modes d'amélioration »)

CamScanner propose 5 modes, avec un mode par défaut réglable, plus des curseurs manuels :

| CamScanner | Rôle | FOF Scan |
|---|---|---|
| Original | aucune retouche | ✅ Original |
| Lighten (Éclaircir) | pages vives et colorées (magazines) : éclaircit sans blanchir | ❌ |
| **Magic Color (Couleur magique)** — mode par défaut | lisibilité : papier blanc, texte foncé, ombres et reflets retirés, couleurs gardées | 🟡 « Amélioré » (réglage C choisi le 13/10) |
| Grayscale (Gris) | fichier plus léger | ✅ Gris |
| B&W (N&B) | documents imprimés en noir et blanc | 🟡 « Noir & blanc » (réglage C choisi le 13/10) |
| Curseurs luminosité / contraste / détail | ajustement à la main | ❌ |
| Mode par défaut réglable | dans les réglages | ❌ (toujours « Amélioré ») |
| Magic Pro (IA, 2024) | retire flou et ombres automatiquement | ⛔ IA en ligne payante, hors de notre choix « gratuit et hors ligne » |

## 4. Documents

| CamScanner | FOF Scan |
|---|---|
| Renommer, réordonner les pages (appui long) | ✅ |
| Recherche par nom | ✅ |
| Trier (date, nom) | ❌ (toujours le plus récent en haut) |
| Fusionner des documents, déplacer/copier des pages | ❌ |
| Étiquettes / dossiers (dont un dossier « Pièces d'identité ») | ❌ |
| Note sur un document | ❌ |
| Mot de passe | ⛔ inutile : les documents ne quittent pas le téléphone |
| Sauvegarde / restauration | ✅ « Sauvegarder tout » |

## 5. Export et partage

| CamScanner | FOF Scan |
|---|---|
| PDF et JPG, partage (mail, WhatsApp…), enregistrer dans l'album | ✅ (l'album passe par le menu Partager) |
| Format de page PDF (A4, Lettre…) | 🟡 A4 ou taille réelle |
| Orientation PDF (portrait, paysage, auto) | 🟡 automatique seulement |
| Marges PDF | ❌ |
| Qualité / taille du fichier | ✅ Normale / Légère |
| Impression (AirPrint) | ✅ via le menu Partager de l'iPhone |
| Mot de passe PDF, cloud, fax, liens | ⛔ hors du projet (pas de serveur, pas d'abonnement) |

## 6. Détection de la feuille

CamScanner utilise de l'intelligence artificielle. FOF Scan utilise pour l'instant une méthode
classique (OpenCV : grandes droites + bords) : 4 photos réelles sur 7 justes.

Piste pour s'en rapprocher, toujours gratuite et hors ligne : **DocAligner** (DocsaidLab,
licence Apache-2.0), un petit modèle entraîné à trouver les 4 coins d'un document, exporté au
format ONNX, qu'on peut faire tourner dans le navigateur avec onnxruntime-web. La méthode
actuelle resterait en secours. **Demande l'accord de l'utilisateur avant tout téléchargement**
(modèle de quelques Mo + moteur onnxruntime-web d'environ 10 Mo, mis en cache pour le hors-ligne).

## 7. Fonctions avancées (déjà prévues ou à prévoir)

| CamScanner | FOF Scan |
|---|---|
| Reconnaissance du texte (OCR) | prévu : morceau 2 |
| PDF ↔ Word / Excel | prévu : morceaux 2 et 3 |
| Signature électronique | ❌ à prévoir |
| Annotations, filigrane, masquage (mosaïque) | ❌ à prévoir |
| Scan de pièce d'identité (recto/verso sur une page) | ❌ à prévoir |
| Traduction, collaboration, synchronisation | ⛔ demandent un serveur |

## Sources

- Manuel CamScanner Android : http://s.intsig.net/r/manual/CamScanner_Android3.0_en-us.html
- Manuel CamScanner iPhone : http://static.intsig.net/r/manual/CamScanner_iPhone_en-us.html
- Fiche App Store CamScanner : https://apps.apple.com/gb/app/camscanner-scanner-to-scan-pdf/id388627783
- Annonce du filtre Magic Pro (2024) : https://www.globenewswire.com/news-release/2024/02/22/2833742/0/en/camscanner-launches-magic-pro-filter-to-make-scanned-documents-perfect-with-just-one-click.html
- Mode « tourner la page » : https://thegadgetflow.com/blog/new-turn-page-to-auto-capture-feature-from-camscanner/
- DocAligner : https://github.com/DocsaidLab/DocAligner
- Filtres d'un SDK de scan (Scanbot), pour comparaison : https://docs.scanbot.io/ios/document-scanner-sdk/filters-and-image-processing/available-image-filters
