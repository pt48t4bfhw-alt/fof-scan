import { useEffect, useState } from 'preact/hooks';
import { urlImage } from '../navigateur/images';
import type { Depot } from '../rangement/depot';

export function Miniature({ depot, pageId }: { depot: Depot; pageId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pageId) return;
    let actif = true;
    let u: string | null = null;
    depot.lirePage(pageId).then((p) => {
      if (!p || !actif) return;
      u = urlImage(p.miniature);
      setUrl(u);
    });
    return () => { actif = false; if (u) URL.revokeObjectURL(u); };
  }, [pageId]);
  return url ? <img class="vignette" src={url} alt="" /> : <div class="vignette" />;
}
