import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lireDictionnaire } from '../src/lecture/ctc';

const D = 'public/modeles/ocr';

describe('fichiers du lecteur de texte', () => {
  it('les deux modèles, le dictionnaire, la licence et le mode d\'emploi sont présents', () => {
    for (const f of ['reperage-ppocrv6-tiny.onnx', 'lecture-ppocrv6-small.onnx', 'dictionnaire-ppocrv6.txt', 'LICENCE-PaddleOCR.txt', 'LISEZMOI.txt']) {
      expect(existsSync(`${D}/${f}`), f).toBe(true);
    }
  });

  it('le dictionnaire a 18 708 caractères (+ l\'espace) et connaît les accents', () => {
    const dict = lireDictionnaire(readFileSync(`${D}/dictionnaire-ppocrv6.txt`, 'utf8'));
    expect(dict).toHaveLength(18709);
    for (const c of ['é', 'è', 'ç', 'à', 'ô', '€', '　']) expect(dict).toContain(c);
    expect(dict.every((c) => [...c].length === 1)).toBe(true);
  });

  it('les modèles ne sont pas mis dans le précache (téléchargés à la demande)', () => {
    expect(readFileSync('vite.config.ts', 'utf8')).toContain("globIgnores: ['**/modeles/ocr/**']");
  });
});
