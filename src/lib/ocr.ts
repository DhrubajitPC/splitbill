import { createWorker, PSM } from 'tesseract.js'
import {
  parseOcrBoxes,
  parseReceiptText,
  type OcrBox,
  type ParseResult,
} from './parseReceipt'

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
      // Allow retries after a failed model download / import
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

/** Max-channel boost for purple venue lighting (Tesseract fallback). */
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

function friendlyError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (/Failed to download|HTTP|fetch|network|Load failed|CDN/i.test(msg)) {
    return new Error(
      'Could not download the OCR model (network). Check connection and retry — we’ll try a backup engine.',
    )
  }
  if (/clipper-lib|does not provide an export/i.test(msg)) {
    return new Error('OCR engine failed to load in this browser build. Retrying backup OCR…')
  }
  if (/HEIC|decode|read this image/i.test(msg)) {
    return new Error(msg)
  }
  return err instanceof Error ? err : new Error(msg)
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

export async function runOcr(
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<ParseResult & { rawText: string }> {
  onProgress?.(3)
  const png = await normalizeToPng(file)
  onProgress?.(12)

  try {
    const result = await withTimeout(runPaddle(png, onProgress), 90_000, 'Primary OCR')
    onProgress?.(100)
    return result
  } catch (paddleErr) {
    console.warn('PaddleOCR failed, falling back to Tesseract:', paddleErr)
    enginePromise = null
    onProgress?.(52)
    try {
      const result = await withTimeout(runTesseract(png, onProgress), 90_000, 'Backup OCR')
      onProgress?.(100)
      return result
    } catch (tessErr) {
      console.error('Tesseract fallback failed:', tessErr)
      const paddleFriendly = friendlyError(paddleErr)
      const tessMsg = tessErr instanceof Error ? tessErr.message : String(tessErr)
      throw new Error(
        `${paddleFriendly.message} Backup also failed: ${tessMsg}`,
      )
    }
  }
}
