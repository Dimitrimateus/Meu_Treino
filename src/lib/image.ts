// Compressão de imagens no cliente: lado maior 1600 px, JPEG ~0,8, orientação EXIF corrigida.

export const MAX_GIF_BYTES = 5 * 1024 * 1024;

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // imageOrientation 'from-image' aplica a rotação EXIF
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode(); // navegadores modernos já respeitam EXIF no <img>
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export interface CompressOptions { maxSide?: number; quality?: number; targetBytes?: number; type?: 'image/jpeg' | 'image/webp' }

export async function compressImage(file: Blob, opts: CompressOptions = {}): Promise<Blob> {
  const { maxSide = 1600, quality = 0.8, targetBytes = 400 * 1024, type = 'image/jpeg' } = opts;
  const img = await decode(file);
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  if ('close' in img) img.close();
  let q = quality;
  let blob = await toBlob(canvas, type, q);
  while (blob.size > targetBytes && q > 0.5) {
    q -= 0.1;
    blob = await toBlob(canvas, type, q);
  }
  return blob;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao comprimir a imagem'))), type, quality));
}
