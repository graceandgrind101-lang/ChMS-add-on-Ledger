import { parseReceiptText, type ParsedReceipt } from './logic';

/** Shrinks a photo before saving so the device and Google Drive backup stay small. */
export async function compressImage(file: Blob, maxSide = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.8));
}

/**
 * Reads a receipt photo with Tesseract in the browser. The engine and language data are served
 * by the app itself (public/ocr) and cached after first use, so it also works offline. Later this is where a Gemini extraction can plug in.
 */
export async function readReceipt(image: Blob, onProgress?: (pct: number) => void): Promise<ParsedReceipt & { text: string }> {
  const { createWorker } = await import('tesseract.js');
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.href).href;
  const worker = await createWorker('eng', 1, {
    workerPath: base + 'worker.min.js',
    corePath: base,
    langPath: base,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return { ...parseReceiptText(data.text), text: data.text };
  } finally {
    await worker.terminate();
  }
}
