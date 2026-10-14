// Copie les modèles officiels PaddleOCR PP-OCRv6 (archives *_onnx_infer.tar déjà extraites) dans
// public/modeles/ocr et écrit le dictionnaire (un caractère par ligne) tiré de inference.yml.
// Usage : node scripts/preparer-lecteur.mjs <dossier contenant PP-OCRv6_tiny_det/ et PP-OCRv6_small_rec/>
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2];
if (!source) {
  console.error('Usage : node scripts/preparer-lecteur.mjs <dossier des modèles extraits>');
  process.exit(1);
}
const sortie = 'public/modeles/ocr';
mkdirSync(sortie, { recursive: true });
const det = join(source, 'PP-OCRv6_tiny_det', 'PP-OCRv6_tiny_det_onnx_infer');
const rec = join(source, 'PP-OCRv6_small_rec', 'PP-OCRv6_small_rec_onnx_infer');
copyFileSync(join(det, 'inference.onnx'), join(sortie, 'reperage-ppocrv6-tiny.onnx'));
copyFileSync(join(rec, 'inference.onnx'), join(sortie, 'lecture-ppocrv6-small.onnx'));

const lignes = readFileSync(join(rec, 'inference.yml'), 'utf8').split(/\r?\n/);
const debut = lignes.findIndex((l) => /^\s*character_dict:/.test(l));
const dict = [];
for (const l of lignes.slice(debut + 1)) {
  const m = /^\s*- (.*)$/.exec(l);
  if (!m) break;
  let v = m[1];
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1).replace(/''/g, "'");
  else if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = JSON.parse(v);
  dict.push(v);
}
writeFileSync(join(sortie, 'dictionnaire-ppocrv6.txt'), dict.join('\n') + '\n');

for (const f of ['reperage-ppocrv6-tiny.onnx', 'lecture-ppocrv6-small.onnx', 'dictionnaire-ppocrv6.txt']) {
  const o = readFileSync(join(sortie, f));
  console.log(f, o.length, createHash('sha256').update(o).digest('hex').toUpperCase());
}
console.log('caractères :', dict.length);
