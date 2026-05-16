/**
 * Comprime uma imagem no client antes do upload (base64).
 * Reduz dimensoes ate maxDim e re-encoda como JPEG na quality dada.
 *
 * Tipica reducao: 5MB heic/png/jpeg da camera -> 200-400KB.
 *
 * Mantem o tipo original se nao for imagem (PDF, DOC etc passam direto).
 */
export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<{ dataUrl: string; size: number }> {
  const { maxDim = 1280, quality = 0.82 } = opts;

  // Tipos nao-imagem (PDF, DOC, etc): retorna como esta.
  if (!file.type.startsWith('image/')) {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl, size: file.size };
  }

  // GIF animado: nao comprimir (perderia animacao). Retorna original.
  if (file.type === 'image/gif') {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl, size: file.size };
  }

  try {
    const img = await loadImage(file);
    const { w, h } = scaleToMax(img.naturalWidth, img.naturalHeight, maxDim);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const dataUrl = await fileToDataUrl(file);
      return { dataUrl, size: file.size };
    }
    ctx.drawImage(img, 0, 0, w, h);

    // JPEG sempre — menor que PNG para fotos, e o navegador rende igual.
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const size = Math.round((dataUrl.length * 3) / 4); // estimativa do tamanho base64

    // Se por algum motivo a compressao ficou maior que o original, usa original.
    if (size > file.size) {
      const original = await fileToDataUrl(file);
      return { dataUrl: original, size: file.size };
    }

    return { dataUrl, size };
  } catch {
    const dataUrl = await fileToDataUrl(file);
    return { dataUrl, size: file.size };
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string) ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function scaleToMax(w: number, h: number, maxDim: number): { w: number; h: number } {
  if (w <= maxDim && h <= maxDim) return { w, h };
  const ratio = w > h ? maxDim / w : maxDim / h;
  return { w: Math.round(w * ratio), h: Math.round(h * ratio) };
}
