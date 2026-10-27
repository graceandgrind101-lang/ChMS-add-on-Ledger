// Copies the Tesseract OCR engine and English data into public/ocr so the app serves them
// itself instead of a CDN. Runs before dev and build; the output is not committed.
import { copyFileSync, mkdirSync } from 'node:fs';

const out = 'public/ocr';
mkdirSync(out, { recursive: true });
const files = {
  'node_modules/tesseract.js/dist/worker.min.js': 'worker.min.js',
  'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js': 'tesseract-core-lstm.wasm.js',
  'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js': 'tesseract-core-simd-lstm.wasm.js',
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz': 'eng.traineddata.gz',
};
for (const [from, to] of Object.entries(files)) copyFileSync(from, `${out}/${to}`);
