import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ProgressPhoto } from '../../lib/types';

// URLs assinadas (validade 1 h) com cache em memória; blob local quando existir.
const cache = new Map<string, { url: string; exp: number }>();

export function usePhotoUrl(photo: ProgressPhoto | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) { setUrl(null); return; }
    if (photo._blob) {
      const u = URL.createObjectURL(photo._blob);
      setUrl(u);
      return () => URL.revokeObjectURL(u);
    }
    const hit = cache.get(photo.storage_path);
    if (hit && hit.exp > Date.now()) { setUrl(hit.url); return; }
    let ok = true;
    void supabase.storage.from('progress-photos').createSignedUrl(photo.storage_path, 3600).then(({ data }) => {
      if (!ok || !data) return;
      cache.set(photo.storage_path, { url: data.signedUrl, exp: Date.now() + 55 * 60_000 });
      setUrl(data.signedUrl);
    });
    return () => { ok = false; };
  }, [photo]);
  return url;
}

export function PhotoImg({ photo, alt, className }: { photo: ProgressPhoto; alt: string; className?: string }) {
  const url = usePhotoUrl(photo);
  return url ? <img src={url} alt={alt} className={className} loading="lazy" /> : <div className={`photo-ph ${className ?? ''}`} aria-label={alt} />;
}
