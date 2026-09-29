import { Injectable, signal } from '@angular/core';
import type { Worker as OcrWorker } from 'tesseract.js';
import { AadhaarDetails, ScanResult } from './aadhaar.types';
import { parseAadhaarQr } from './aadhaar-qr';
import { TextParse, nameCandidate, parseAadhaarText } from './aadhaar-text';
import { correctNameWord, knownWords } from './name-lexicon';
import { isValidAadhaar } from './verhoeff';

export type ScanStage = 'idle' | 'loading' | 'qr' | 'reading' | 'targeting' | 'rereading' | 'done';

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
      const T = await loadTesseract();
      // A hand-held photo is usually a little tilted. Measure it and straighten before reading.
      const tilt = measureTilt(bitmap);
      const source = Math.abs(tilt) >= 1 ? await rotateBitmap(bitmap, -tilt) : bitmap;
      const canvas = prepareForOcr(source, 0);

      // 1. Read the whole card once, keeping where every line sits.
      await worker.setParameters({ tessedit_pageseg_mode: T.PSM.AUTO, preserve_interword_spaces: '1', tessedit_char_whitelist: '' });
      const page = await readPage(worker, canvas);
      let text = page.text;
      let parsed = parseAadhaarText(text);

      // 2. Go back to where each detail sits on an Aadhaar card and read just that spot, up close.
      this.stage.set('targeting');
      const reader = new TargetedReader(worker, T.PSM, source, canvas.width);
      const found = await reader.improve(page.lines, parsed, qr?.details.aadhaarLast4);
      parsed = found;

      const complete = () =>
        parsed.aadhaarVerified && !!(parsed.details.name || qr?.details.name) && !!(parsed.details.dob || parsed.details.yearOfBirth || qr?.details.dob);

      // 3. Still missing something: a sparse-text pass finds text that layout analysis skipped.
      if (!complete()) {
        this.stage.set('rereading');
        await worker.setParameters({ tessedit_pageseg_mode: T.PSM.SPARSE_TEXT, tessedit_char_whitelist: '' });
        text += '\n' + (await worker.recognize(canvas)).data.text;
        const merged = parseAadhaarText(text);
        parsed = {
          details: { ...merged.details, ...definedOnly(parsed.details) },
          aadhaarVerified: parsed.aadhaarVerified || merged.aadhaarVerified,
        };
        if (!found.aadhaarVerified && merged.aadhaarVerified) parsed.details.aadhaar = merged.details.aadhaar;
      }

      // Nothing recognisable at all usually means the photo is sideways.
      if (!parsed.details.aadhaar && !parsed.details.name && !parsed.details.dob) {
        await worker.setParameters({ tessedit_pageseg_mode: T.PSM.AUTO, tessedit_char_whitelist: '' });
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
    this.worker ??= loadTesseract().then(({ createWorker, OEM }) => {
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

/**
 * tesseract.js is a CommonJS package. The development build exposes its exports directly,
 * but the optimised production build wraps them in `default`, so accept both shapes.
 */
async function loadTesseract(): Promise<typeof import('tesseract.js')> {
  const mod: any = await import('tesseract.js');
  return mod.createWorker ? mod : mod.default;
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
  return enhance(drawScaled(bitmap, 2200, angle));
}

/** Grayscale and stretch contrast, clipping the darkest and lightest 1% (glare, shadows). */
function enhance(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < px.length; i += 4) {
    const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    px[i] = g;
    hist[g | 0]++;
  }
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

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OcrWord {
  text: string;
  conf: number;
}

interface OcrLine {
  text: string;
  bbox: Box;
  words: OcrWord[];
}

/**
 * Tilt of the text in degrees (positive = lines run downhill to the right), found by rotating
 * a small copy of the photo and keeping the angle where rows of text line up most sharply
 * (the classic projection-profile method used by document scanners).
 */
function measureTilt(bitmap: ImageBitmap): number {
  const scale = Math.min(1, 700 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const sharpness = (deg: number): number => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    let prev = -1;
    let score = 0;
    for (let y = 0; y < h; y++) {
      let dark = 0;
      for (let x = 0, i = y * w * 4; x < w; x++, i += 4) if (px[i] + px[i + 1] + px[i + 2] < 330) dark++;
      if (prev >= 0) score += (dark - prev) * (dark - prev);
      prev = dark;
    }
    return score;
  };

  let best = 0;
  let bestScore = sharpness(0);
  for (let deg = -12; deg <= 12; deg += 1) {
    const s = sharpness(deg);
    if (s > bestScore) [best, bestScore] = [deg, s];
  }
  for (let deg = best - 0.75; deg <= best + 0.75; deg += 0.25) {
    const s = sharpness(deg);
    if (s > bestScore) [best, bestScore] = [deg, s];
  }
  // The photo is rotated by +best to make the text level, so the text itself is tilted by -best.
  return -best;
}

/** Rotates the photo by a small angle about its centre, keeping full resolution. */
async function rotateBitmap(bitmap: ImageBitmap, degrees: number): Promise<ImageBitmap> {
  const r = (degrees * Math.PI) / 180;
  const w = Math.round(Math.abs(bitmap.width * Math.cos(r)) + Math.abs(bitmap.height * Math.sin(r)));
  const h = Math.round(Math.abs(bitmap.width * Math.sin(r)) + Math.abs(bitmap.height * Math.cos(r)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(w / 2, h / 2);
  ctx.rotate(r);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  return createImageBitmap(canvas);
}

function definedOnly<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as Partial<T>;
}

async function readPage(worker: OcrWorker, image: HTMLCanvasElement): Promise<{ text: string; lines: OcrLine[] }> {
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const lines: OcrLine[] = (data.blocks ?? []).flatMap(b =>
    b.paragraphs.flatMap(p =>
      p.lines.map(l => ({
        text: l.text.trim(),
        bbox: l.bbox,
        words: l.words.map(w => ({ text: w.text, conf: w.confidence })),
      })),
    ),
  );
  return { text: data.text, lines };
}

type Psm = import('tesseract.js').PSM;

/**
 * Combines two readings of the same name line. With the same number of words, each position
 * takes the known name word, else the more confident reading; otherwise the reading with
 * more known name words (then higher confidence) wins.
 */
function mergeReadings(a: string, aWords: OcrWord[], b: string, bWords: OcrWord[]): { name: string; words: OcrWord[] } {
  const confOf = (words: OcrWord[], word: string) =>
    words.find(w => w.text.toLowerCase().replace(/[^a-z.]/g, '') === word.toLowerCase())?.conf ?? 0;
  const avg = (words: OcrWord[]) => words.reduce((s, w) => s + w.conf, 0) / Math.max(1, words.length);
  const aw = a.split(' ');
  const bw = b.split(' ');
  if (aw.length === bw.length) {
    const out = aw.map((x, i) => {
      const y = bw[i];
      const [kx, ky] = [knownWords(x), knownWords(y)];
      if (kx !== ky) return kx > ky ? { text: x, conf: confOf(aWords, x) } : { text: y, conf: confOf(bWords, y) };
      return confOf(aWords, x) >= confOf(bWords, y) ? { text: x, conf: confOf(aWords, x) } : { text: y, conf: confOf(bWords, y) };
    });
    return { name: out.map(w => w.text).join(' '), words: out };
  }
  const better = knownWords(b) > knownWords(a) || (knownWords(b) === knownWords(a) && avg(bWords) > avg(aWords));
  return better ? { name: b, words: bWords } : { name: a, words: aWords };
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .';
const DIGITS = '0123456789 ';

/**
 * Reads individual fields again from where they sit on an Aadhaar card, using the layouts of
 * the e-Aadhaar letter, the old paper letter and the PVC card:
 *  - the 12-digit number: on its own line, under "Your Aadhaar No." or along the bottom of the card;
 *  - the name: the first name-like line above the DOB / Year of Birth line (card front),
 *    or right after "To" (letter);
 *  - DOB and gender: the DOB line and the one below it.
 * Each spot is cropped from the full-resolution photo, enlarged, and read with only the
 * characters that can appear there, which is far more accurate than reading the whole page.
 */
class TargetedReader {
  /** From page-canvas coordinates to the original photo. */
  private readonly k: number;

  constructor(
    private readonly worker: OcrWorker,
    private readonly PSM: typeof import('tesseract.js').PSM,
    private readonly bitmap: ImageBitmap,
    canvasWidth: number,
  ) {
    this.k = bitmap.width / canvasWidth;
  }

  async improve(lines: OcrLine[], parsed: TextParse, last4?: string): Promise<TextParse> {
    const details = { ...parsed.details };
    let verified = parsed.aadhaarVerified && (!last4 || !!details.aadhaar?.endsWith(last4));

    if (!verified) {
      const number = await this.findNumber(lines, last4);
      if (number) {
        details.aadhaar = number;
        verified = true;
      }
    }

    const dobLine = lines.find(l => /D[O0]B|Birth|YOB/i.test(l.text));
    if (dobLine && !details.dob && !details.yearOfBirth) {
      const again = parseAadhaarText(await this.read(dobLine.bbox, DIGITS + '/-.:DOBYearofBirth', this.PSM.SINGLE_LINE));
      if (again.details.dob) details.dob = again.details.dob;
      if (again.details.yearOfBirth) details.yearOfBirth = again.details.yearOfBirth;
    }

    if (dobLine && !details.gender) {
      const below = lines.filter(l => l.bbox.y0 >= dobLine.bbox.y1 - 4 && l.bbox.y0 < dobLine.bbox.y1 + 3 * (dobLine.bbox.y1 - dobLine.bbox.y0));
      for (const l of below) {
        const g = parseAadhaarText(await this.read(l.bbox, LETTERS + '/', this.PSM.SINGLE_LINE)).details.gender;
        if (g) {
          details.gender = g;
          break;
        }
      }
    }

    details.name = await this.findName(lines, details.name, dobLine);
    if (!details.name) delete details.name;
    return { details: definedOnly(details), aadhaarVerified: verified };
  }

  private async findNumber(lines: OcrLine[], last4?: string): Promise<string | undefined> {
    const h = this.bitmap.height / this.k;
    const w = this.bitmap.width / this.k;
    const regions: [Box, Psm][] = [];
    // Lines that already look numeric.
    for (const l of lines) {
      const digits = l.text.replace(/\D/g, '').length;
      if (digits >= 6 && !/VID|enrol/i.test(l.text)) regions.push([l.bbox, this.PSM.SINGLE_LINE]);
    }
    // Just below the "Your Aadhaar No." label on letters.
    for (const l of lines) {
      if (!/aadhaar\s*n|your\s*aadh/i.test(l.text)) continue;
      const lh = l.bbox.y1 - l.bbox.y0;
      regions.push([{ x0: Math.max(0, l.bbox.x0 - lh * 2), y0: l.bbox.y1, x1: Math.min(w, l.bbox.x1 + lh * 4), y1: Math.min(h, l.bbox.y1 + lh * 3) }, this.PSM.SPARSE_TEXT]);
    }
    // The bottom of the card, where the number is printed large.
    regions.push([{ x0: 0, y0: h * 0.72, x1: w, y1: h }, this.PSM.SPARSE_TEXT]);
    regions.push([{ x0: 0, y0: h * 0.5, x1: w, y1: h * 0.8 }, this.PSM.SPARSE_TEXT]);

    let fallback: string | undefined;
    for (const [box, psm] of regions) {
      const text = await this.read(box, DIGITS, psm, psm === this.PSM.SINGLE_LINE ? 2 : 1.2);
      const got = parseAadhaarText(text.replace(/[^\d\n]+/g, ' '));
      if (!got.aadhaarVerified || !got.details.aadhaar) continue;
      if (!last4 || got.details.aadhaar.endsWith(last4)) return got.details.aadhaar;
      fallback ??= got.details.aadhaar;
    }
    return fallback;
  }

  private async findName(lines: OcrLine[], current: string | undefined, dobLine?: OcrLine): Promise<string | undefined> {
    const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const want = current ? key(current) : "";
    let line = want ? lines.find(l => key(l.text).includes(want)) : undefined;

    // No name yet: on a card front it is the first name-like line above DOB, in the same column.
    if (!line && dobLine) {
      const above = lines
        .filter(l => l.bbox.y1 <= dobLine.bbox.y0 + 4 && l.bbox.x1 > dobLine.bbox.x0 && l.bbox.x0 < dobLine.bbox.x1)
        .sort((a, b) => b.bbox.y0 - a.bbox.y0)
        .slice(0, 4);
      for (const l of above) {
        const again = nameCandidate(await this.read(l.bbox, LETTERS, this.PSM.SINGLE_LINE, 2.5));
        if (again) {
          line = l;
          current = again;
          break;
        }
      }
    }
    if (!line || !current) return current;

    // Re-read the name line up close with letters only and combine the two readings.
    let words = line.words.filter(w => /[A-Za-z]/.test(w.text));
    if (words.some(w => w.conf < 88)) {
      const again = (await this.readWords(line.bbox, LETTERS, this.PSM.SINGLE_LINE, 2.5)).filter(w => /[A-Za-z]/.test(w.text));
      const againName = nameCandidate(again.map(w => w.text).join(' '));
      if (againName) {
        const merged = mergeReadings(current, words, againName, again);
        current = merged.name;
        words = merged.words;
      }
    }

    // A blurry photo can yield a "name" that is only noise: better to leave the field empty.
    const conf = new Map(words.map(w => [w.text.toLowerCase().replace(/[^a-z.]/g, ''), w.conf]));
    const avg = words.reduce((sum, w) => sum + w.conf, 0) / Math.max(1, words.length);
    if (knownWords(current) === 0 && avg < 70) return undefined;

    // Finally fix low-confidence words that are one slip away from a common name word.
    return current
      .split(' ')
      .map(word => correctNameWord(word, conf.get(word.toLowerCase()) ?? 100))
      .join(' ');
  }

  private async read(box: Box, whitelist: string, psm: Psm, scale = 2): Promise<string> {
    return (await this.readWords(box, whitelist, psm, scale)).map(w => w.text).join(' ') || '';
  }

  private async readWords(box: Box, whitelist: string, psm: Psm, scale = 2): Promise<OcrWord[]> {
    const pad = Math.round((box.y1 - box.y0) * 0.35);
    const sx = Math.max(0, Math.round(box.x0 * this.k) - pad);
    const sy = Math.max(0, Math.round(box.y0 * this.k) - pad);
    const sw = Math.min(this.bitmap.width - sx, Math.round((box.x1 - box.x0) * this.k) + 2 * pad);
    const sh = Math.min(this.bitmap.height - sy, Math.round((box.y1 - box.y0) * this.k) + 2 * pad);
    if (sw < 8 || sh < 8) return [];
    const f = Math.min(scale, 2600 / sw);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * f);
    canvas.height = Math.round(sh * f);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    await this.worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: whitelist });
    try {
      const { data } = await this.worker.recognize(enhance(canvas), {}, { text: true, blocks: true });
      const words = (data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
      // Keep line breaks between lines so separate numbers are not glued together.
      return words.length ? words.map(w => ({ text: w.text, conf: w.confidence })) : [{ text: data.text, conf: 0 }];
    } finally {
      await this.worker.setParameters({ tessedit_char_whitelist: '' });
    }
  }
}
