import { useEffect, useRef, useState } from 'preact/hooks';

/** Petite fenêtre pour taper un nom (nouveau dossier, renommer) ; Valider est grisé si le nom est vide. */
export function SaisieNom({ titre, initial = '', onValider, onFermer }: {
  titre: string; initial?: string; onValider: (nom: string) => void; onFermer: () => void;
}) {
  const [nom, setNom] = useState(initial);
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { champ.current?.focus(); champ.current?.select(); }, []);
  const valider = () => { if (nom.trim()) onValider(nom.trim()); };
  return (
    <>
      <div class="voile" onClick={onFermer} />
      <div class="feuille-actions">
        <strong>{titre}</strong>
        <input ref={champ} type="text" value={nom} aria-label={titre}
          onInput={(e) => setNom(e.currentTarget.value)} onKeyDown={(e) => { if (e.key === 'Enter') valider(); }} />
        <button class="principal" onClick={valider} disabled={!nom.trim()}>Valider</button>
        <button onClick={onFermer}>Annuler</button>
      </div>
    </>
  );
}
