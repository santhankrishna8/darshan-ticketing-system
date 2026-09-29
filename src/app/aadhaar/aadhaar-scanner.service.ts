import { Injectable, signal } from '@angular/core';
import type { Worker as OcrWorker } from 'tesseract.js';
import { AadhaarDetails, ScanResult } from './aadhaar.types';
import { parseAadhaarQr } from './aadhaar-qr';
import { parseAadhaarText } from './aadhaar-text';
import { isValidAadhaar } from './verhoeff';

export type ScanStage = 'idle' | 'loading' | 'qr' | 'reading' | 'rereading' | 'done';

/** Everything runs on the device: the photo is never uploaded anywhere. */
@Injectable({ providedIn: 'root' })
export class AadhaarScannerService {
  readonly stage = signal<ScanStage>('idle');

  private worker?: Promise<OcrWorker>;
  private zxingReady?: Promise<typeof import('zxing-wasm/reader')>;

  /** Start downloading the OCR engine early (e.g. when the scan button is tapped). */
  warmUp(): void {
    this.getWorker().catch(() => (this.worker = undefined));
  }

  async scan(file: Blob): Promise<ScanResult> {
    this.stage.set('loading');
    try {
      const bitmap = await loadBitmap(file);
      const workerPromise = this.getWorker();

      this.stage.set('qr');
      const qrText = await this.readQr(bitmap).catch(() => null);
      const qr = qrText ? parseAadhaarQr(qrText) : null;

      // Old XML QR codes carry everything including the full number: no OCR needed.
      if (qr?.kind === 'xml' && qr.details.aadhaar && qr.details.name) {
        return this.finish(qr.details, {}, qr.kind, false);
      }

      this.stage.set('reading');
      const worker = await workerPromise;
      const { PSM } = await import('tesseract.js');
      const canvas = prepareForOcr(bitmap, 0);

      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      let text = (await worker.recognize(canvas)).data.text;
      let parsed = parseAadhaarText(text);

      const complete = (p = parsed.details) =>
        parsed.aadhaarVerified && !!(p.name || qr?.details.name) && !!(p.dob || p.yearOfBirth || qr?.details.dob);

      // A second pass in sparse-text mode finds text that page layout analysis skips on cards.
      if (!complete()) {
        this.stage.set('rereading');
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        text += '\n' + (await worker.recognize(canvas)).data.text;
        parsed = parseAadhaarText(text);
      }

      // Nothing recognisable at all usually means the photo is sideways.
      if (!parsed.details.aadhaar && !parsed.details.name && !parsed.details.dob) {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
        for (const angle of [90, 270]) {
          const rotated = parseAadhaarText((await worker.recognize(prepareForOcr(bitmap, angle))).data.text);
          if (rotated.details.aadhaar || rotated.details.dob) {
            parsed = rotated;
            break;
          }
        }
      }

      return this.finish(qr?.details ?? {}, parsed.details, qr?.kind ?? null, true);
    } finally {
      this.stage.set('done');
    }
  }

  private finish(fromQr: AadhaarDetails, fromText: AadhaarDetails, qr: ScanResult['qr'], ocr: boolean): ScanResult {
    // QR data is machine-readable and exact, so it wins wherever it exists.
    const details: AadhaarDetails = { ...fromText, ...fromQr };
    const candidates = [fromQr.aadhaar, fromText.aadhaar].filter((a): a is string => !!a);
    const last4 = fromQr.aadhaarLast4;
    details.aadhaar =
      candidates.find(a => isValidAadhaar(a) && (!last4 || a.endsWith(last4))) ?? candidates.find(a => isValidAadhaar(a)) ?? candidates[0];
    if (!details.aadhaar) delete details.aadhaar;
    if (!details.phone && fromText.phone) details.phone = fromText.phone;

    const filled = (['name', 'aadhaar', 'dob', 'yearOfBirth', 'gender', 'phone', 'address'] as const).filter(k => details[k] !== undefined);
    return { details, qr, ocr, aadhaarVerified: isValidAadhaar(details.aadhaar), filled: [...filled] };
  }

  private getWorker(): Promise<OcrWorker> {
    this.worker ??= import('tesseract.js').then(({ createWorker, OEM }) => {
      const base = new URL('ocr/', document.baseURI).href;
      return createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: base + 'worker.min.js',
        corePath: base + 'core',
        langPath: base + 'lang',
        gzip: true,
      });
    });
    return this.worker;
  }

  private async readQr(bitmap: ImageBitmap): Promise<string | null> {
    const Detector = (globalThis as any).BarcodeDetector;
    if (Detector && (await Detector.getSupportedFormats?.())?.includes('qr_code')) {
      const codes = await new Detector({ formats: ['qr_code'] }).detect(bitmap);
      const hit = codes.map((c: any) => c.rawValue as string).find((t: string) => parseAadhaarQr(t));
      if (hit) return hit;
    }

    this.zxingReady ??= import('zxing-wasm/reader').then(m => {
      m.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? new URL('ocr/' + path, document.baseURI).href : prefix + path) },
      });
      return m;
    });
    const { readBarcodes } = await this.zxingReady;
    const image = drawScaled(bitmap, 2400, 0).getContext('2d')!;
    const data = image.getImageData(0, 0, image.canvas.width, image.canvas.height);
    const results = await readBarcodes(data, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 2 });
    return results.map(r => r.text).find(t => parseAadhaarQr(t)) ?? null;
  }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari: fall back to an <img> element.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function drawScaled(bitmap: ImageBitmap, maxSide: number, angle: number): HTMLCanvasElement {
  const scale = Math.min(3, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const sideways = angle % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
}

/** Scale the long side to ~2200px, convert to grayscale and stretch contrast. */
function prepareForOcr(bitmap: ImageBitmap, angle: number): HTMLCanvasElement {
  const canvas = drawScaled(bitmap, 2200, angle);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    px[i] = g;
    hist[g | 0]++;
  }
  // Clip the darkest and lightest 1% so glare and shadows do not flatten the range.
  const total = px.length / 4;
  let lo = 0, hi = 255, acc = 0;
  while (lo < 255 && (acc += hist[lo]) < total * 0.01) lo++;
  acc = 0;
  while (hi > 0 && (acc += hist[hi]) < total * 0.01) hi--;
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255) / range));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
