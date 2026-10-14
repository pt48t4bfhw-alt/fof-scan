import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { blocsDePage, texteDeBlocs } from '../src/lecture/contenu';
import { lireDictionnaire } from '../src/lecture/ctc';
import { Lecteur, tournerImg } from '../src/lecture/lecteur';
import { CONFIANCE_DOUTEUSE, type LecturePage } from '../src/lecture/modele';
import { FICHIERS_LECTEUR } from '../src/lecture/telechargement';
import { gererLecture } from '../src/traitement/coeur';
import { detecterCoins } from '../src/traitement/detection';
import { DetecteurIA } from '../src/traitement/docaligner';
import { appliquerFiltre } from '../src/traitement/filtres';
import { coinsPleineImage } from '../src/traitement/geometrie';
import { chargerOpenCV } from '../src/traitement/opencv';
import { redresser } from '../src/traitement/redressement';

const DOSSIER = 'tests/photos/sauvegarde';
const SORTIE = 'tests/photos/resultats/lecture';
const OCR = 'public/modeles/ocr';
const photos = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter((n) => n.endsWith(' - original.jpg')) : [];

const lire = (chemin: string) => {
  const b = jpeg.decode(readFileSync(chemin), { useTArray: true, maxMemoryUsageInMB: 2048 });
  return { data: new Uint8ClampedArray(b.data.buffer), width: b.width, height: b.height };
};

describe.skipIf(photos.length === 0)('lecture des photos réelles (dossier local, non publié)', () => {
  it('lit chaque page, écrit textes et planches, retrouve les chiffres du reçu', async () => {
    const { cv } = await chargerOpenCV();
    const ort = createRequire(import.meta.url)('onnxruntime-web');
    ort.env.wasm.numThreads = 1;
    const ia = await DetecteurIA.creer(ort, new Uint8Array(readFileSync('public/modeles/docaligner-lc100.onnx')));
    const lecteur = await Lecteur.creer(ort,
      new Uint8Array(readFileSync(`${OCR}/${FICHIERS_LECTEUR.reperage.nom}`)),
      new Uint8Array(readFileSync(`${OCR}/${FICHIERS_LECTEUR.lecture.nom}`)),
      lireDictionnaire(readFileSync(`${OCR}/${FICHIERS_LECTEUR.dictionnaire.nom}`, 'utf8')));
    mkdirSync(SORTIE, { recursive: true });
    const textes: Record<string, string> = {};
    const bilan: string[] = [];
    for (const nom of photos) {
      const photo = lire(`${DOSSIER}/${nom}`);
      const coins = (await ia.detecter(cv, photo)) ?? detecterCoins(cv, photo) ?? coinsPleineImage(photo.width, photo.height);
      const page = appliquerFiltre(cv, redresser(cv, photo, coins, 0, 2400), 'ameliore');
      const debut = Date.now();
      const r = await gererLecture(cv, lecteur, { id: 1, type: 'lire', img: page });
      if (!r.ok || r.type !== 'lire') throw new Error(`${nom} : ${r.ok ? 'réponse inattendue' : r.erreur}`);
      const lecture: LecturePage = { ...r.resultat, pageId: nom, documentId: 'd', empreinte: '', lu: 0 };
      const court = nom.replace(' - original.jpg', '');
      textes[court] = texteDeBlocs(blocsDePage(lecture));
      writeFileSync(`${SORTIE}/${court}.txt`, textes[court]);
      // planche : lignes en vert (orange si douteuses), cases du tableau en bleu
      const droite = cv.matFromImageData(tournerImg(cv, page, lecture.sens));
      for (const l of lecture.lignes) {
        const couleur = l.confiance < CONFIANCE_DOUTEUSE ? new cv.Scalar(255, 150, 0, 255) : new cv.Scalar(0, 180, 0, 255);
        cv.rectangle(droite, new cv.Point(l.rect.x, l.rect.y), new cv.Point(l.rect.x + l.rect.largeur, l.rect.y + l.rect.hauteur), couleur, 3);
      }
      for (const c of lecture.tableau?.cases ?? []) {
        cv.rectangle(droite, new cv.Point(c.rect.x, c.rect.y), new cv.Point(c.rect.x + c.rect.largeur, c.rect.y + c.rect.hauteur), new cv.Scalar(0, 0, 255, 255), 4);
      }
      const petit = new cv.Mat();
      cv.resize(droite, petit, new cv.Size(Math.round(droite.cols / 2), Math.round(droite.rows / 2)), 0, 0, cv.INTER_AREA);
      writeFileSync(`${SORTIE}/${court}.jpg`, jpeg.encode({ data: Buffer.from(petit.data), width: petit.cols, height: petit.rows }, 80).data);
      droite.delete();
      petit.delete();
      bilan.push(`${court} | sens ${lecture.sens} | ${lecture.lignes.length} lignes | mode ${lecture.mode}`
        + `${lecture.tableau ? ` (${lecture.tableau.rangs}×${lecture.tableau.cols})` : ''} | ${((Date.now() - debut) / 1000).toFixed(1)} s`);
    }
    writeFileSync(`${SORTIE}/bilan.txt`, bilan.join('\n'));
    console.log(bilan.join('\n'));
    const recu = textes['Scan 12-10-2026 17h45 - p6'];
    if (recu !== undefined) for (const chiffre of ['252', '1200', '302400']) expect(recu).toContain(chiffre);
  }, 900000);
});
