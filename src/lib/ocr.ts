import { createWorker, PSM } from 'tesseract.js'
import {
  parseOcrBoxes,
  parseReceiptText,
  type OcrBox,
  type ParseResult,
} from './parseReceipt'
import { isChromeGeminiAvailable, runChromeGeminiOcr } from './chromeGemini'
import { isReliableExtract, scoreExtract } from './extractQuality'

type OcrEngine = {
  initialize: () => Promise<unknown>
  predict: (source: Blob) => Promise<
    Array<{
      items: Array<{
        text: string
        score: number
        poly: Array<[number, number] | number[]>
      }>
    }>
  >
}

let enginePromise: Promise<OcrEngine> | null = null

async function getPaddleEngine(onProgress?: (pct: number) => void): Promise<OcrEngine> {
  if (!enginePromise) {
    onProgress?.(5)
    enginePromise = (async () => {
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js')
      onProgress?.(15)
      const ocr = await PaddleOCR.create({
        lang: 'en',
        ocrVersion: 'PP-OCRv5',
        worker: false,
        ortOptions: {
          backend: 'wasm',
          wasmPaths: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/',
        },
      })
      onProgress?.(35)
      await ocr.initialize()
      onProgress?.(50)
      return ocr as unknown as OcrEngine
    })().catch((err) => {
      enginePromise = null
      throw err
    })
  }
  return enginePromise
}

/** Decode any browser-supported image (incl. many HEIC→bitmap paths) to PNG. */
export async function normalizeToPng(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(
      'Could not read this image. If it’s an iPhone HEIC, export as JPEG in Photos, or pick a JPG/PNG.',
    )
  }

  const maxEdge = Math.max(bitmap.width, bitmap.height)
  const scale = maxEdge < 1400 ? 1400 / maxEdge : maxEdge > 2400 ? 2400 / maxEdge : 1
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas is not available in this browser.')
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('Could not encode image for OCR.')
  return blob
}

async function enhanceForTesseract(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas is not available in this browser.')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = image
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i]!, data[i + 1]!, data[i + 2]!)
    const boosted = Math.min(255, Math.max(0, (max - 100) * 1.5 + 100))
    data[i] = data[i + 1] = data[i + 2] = boosted
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function toOcrBoxes(
  items: Array<{ text: string; score: number; poly: Array<[number, number] | number[]> }>,
): OcrBox[] {
  return items.map((item) => ({
    text: item.text,
    score: item.score,
    poly: item.poly.map((p) => {
      if (Array.isArray(p) && p.length >= 2) return [Number(p[0]), Number(p[1])] as [number, number]
      return p as [number, number]
    }),
  }))
}

function finalizeParse(
  boxes: OcrBox[],
  rawText: string,
): ParseResult & { rawText: string } {
  let parsed = boxes.length > 0 ? parseOcrBoxes(boxes) : parseReceiptText(rawText)
  if (parsed.items.length < 2) {
    const fromText = parseReceiptText(rawText)
    if (fromText.items.length > parsed.items.length) parsed = fromText
  }
  if (parsed.quality === 'empty' || (parsed.items.length === 1 && parsed.items[0]!.price > 200)) {
    parsed = { ...parsed, items: [], quality: 'empty' }
  }
  return { ...parsed, rawText }
}

async function runPaddle(
  png: Blob,
  onProgress?: (pct: number) => void,
): Promise<ParseResult & { rawText: string }> {
  const engine = await getPaddleEngine(onProgress)
  onProgress?.(60)
  const [result] = await engine.predict(png)
  onProgress?.(90)
  const boxes = toOcrBoxes(result?.items ?? [])
  const rawText = boxes.map((b) => b.text).join('\n')
  const parsed = finalizeParse(boxes, rawText)
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as Window & { __splitbillLastBoxes?: OcrBox[] }).__splitbillLastBoxes = boxes
  }
  return parsed
}

async function runTesseract(
  png: Blob,
  onProgress?: (pct: number) => void,
): Promise<ParseResult & { rawText: string }> {
  onProgress?.(55)
  const canvas = await enhanceForTesseract(png)
  onProgress?.(60)
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress?.(60 + Math.round(m.progress * 30))
      }
    },
  })
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
    const {
      data: { text },
    } = await worker.recognize(canvas)
    onProgress?.(95)
    return finalizeParse([], text)
  } finally {
    await worker.terminate()
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label} timed out after ${Math.round(ms / 1000)}s (often a blocked model download).`,
              ),
            ),
          ms,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function pickBest(
  candidates: Array<ParseResult & { rawText: string }>,
): (ParseResult & { rawText: string }) | null {
  let best: (ParseResult & { rawText: string }) | null = null
  let bestScore = -1
  for (const c of candidates) {
    const s = scoreExtract(c)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

/**
 * Extract receipt line items. PaddleOCR is primary (reliable on dense receipts);
 * Chrome Gemini Nano is only used when already downloaded and it scores better;
 * Tesseract is last resort.
 */
export async function runOcr(
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<ParseResult & { rawText: string }> {
  onProgress?.(2)
  const png = await normalizeToPng(file)
  onProgress?.(8)

  const candidates: Array<ParseResult & { rawText: string }> = []

  try {
    const paddle = await withTimeout(runPaddle(png, onProgress), 90_000, 'Primary OCR')
    candidates.push(paddle)
    if (isReliableExtract(paddle)) {
      onProgress?.(100)
      return paddle
    }
    console.warn('Paddle extract looked weak; trying other engines', {
      items: paddle.items.length,
      sum: paddle.items.reduce((s, i) => s + i.price, 0),
    })
  } catch (paddleErr) {
    console.warn('PaddleOCR failed:', paddleErr)
    enginePromise = null
  }

  // Only use Gemini when the model is already on-device (avoid half-ready / garbage).
  try {
    if (typeof LanguageModel !== 'undefined') {
      const status = await LanguageModel.availability({
        expectedInputs: [
          { type: 'text', languages: ['en'] },
          { type: 'image' },
        ],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
      })
      if (status === 'available' && (await isChromeGeminiAvailable())) {
        onProgress?.(20)
        const gemini = await withTimeout(runChromeGeminiOcr(png, onProgress), 90_000, 'Chrome AI')
        candidates.push(gemini)
        if (isReliableExtract(gemini)) {
          const paddle = candidates[0]
          if (!paddle || scoreExtract(gemini) >= scoreExtract(paddle)) {
            onProgress?.(100)
            return gemini
          }
        }
      }
    }
  } catch (geminiErr) {
    console.warn('Chrome AI skipped/failed:', geminiErr)
  }

  onProgress?.(52)
  try {
    const tess = await withTimeout(runTesseract(png, onProgress), 90_000, 'Backup OCR')
    candidates.push(tess)
  } catch (tessErr) {
    console.warn('Tesseract failed:', tessErr)
  }

  const best = pickBest(candidates)
  if (best && best.items.length > 0) {
    onProgress?.(100)
    return best
  }

  const last = candidates[candidates.length - 1]
  if (last) {
    onProgress?.(100)
    return last
  }

  throw new Error('OCR failed. Try another photo or enter items manually.')
}

export { isReliableExtract, scoreExtract } from './extractQuality'
