import { useRef, useState } from 'react'
import { runOcr } from '../lib/ocr'
import type { ParseResult } from '../lib/parseReceipt'
import './ScanCapture.css'

interface Props {
  onParsed: (result: ParseResult) => void
  onSkip: () => void
}

declare global {
  interface Window {
    __splitbillMockOcr?: (
      file: Blob,
      onProgress?: (pct: number) => void,
    ) => Promise<ParseResult & { rawText?: string }>
    __splitbillLastOcr?: ParseResult & { rawText?: string }
  }
}

export function ScanCapture({ onParsed, onSkip }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    setProgress(0)
    const url = URL.createObjectURL(file)
    setPreview(url)

    try {
      const runner = window.__splitbillMockOcr ?? runOcr
      const result = await runner(file, setProgress)
      window.__splitbillLastOcr = result
      if (result.items.length === 0) {
        setError(
          result.quality === 'empty'
            ? 'Couldn’t read priced lines clearly. Try a brighter, flatter JPEG/PNG — or enter items manually.'
            : 'No priced lines found. You can still enter items manually on the next screen.',
        )
      }
      onParsed(result)
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'OCR failed. Try another photo or enter items manually.'
      setError(message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="scan">
      <p className="scan__hint">
        On-device OCR — nothing is uploaded. First scan may download a model; if that fails we
        fall back to a backup engine. Prefer a bright, flat JPEG/PNG (not HEIC). You can fix any
        line on the next screen.
      </p>

      {preview && (
        <div className="scan__preview">
          <img src={preview} alt="Receipt preview" />
        </div>
      )}

      {progress != null && (
        <div
          className="scan__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-label="OCR progress"
        >
          <div className="scan__progress-track">
            <div
              className="scan__progress-bar"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </div>
          <span className="scan__progress-label">
            {progress < 52
              ? 'Loading OCR model…'
              : progress < 60
                ? 'Trying backup OCR…'
                : 'Reading receipt…'}{' '}
            {progress}%
          </span>
        </div>
      )}

      {error && (
        <p className="scan__error" role="alert">
          {error}
        </p>
      )}

      <div className="scan__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          Take photo
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={busy}
          onClick={() => galleryRef.current?.click()}
        >
          Choose from gallery
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={onSkip}>
          Enter items manually
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
