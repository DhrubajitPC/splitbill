#!/usr/bin/env node
/**
 * PaddleOCR ships `import ClipperLib from "clipper-lib"` but clipper-lib is CJS-only.
 * Rewrite to a namespace import so Vite can load it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const target = path.join(root, 'node_modules/@paddleocr/paddleocr-js/dist/index.mjs')

if (!fs.existsSync(target)) {
  console.warn('patch-paddleocr: package not installed, skipping')
  process.exit(0)
}

const text = fs.readFileSync(target, 'utf8')
const old = 'import ClipperLib from "clipper-lib";'
const next =
  'import * as __ClipperNS from "clipper-lib";\nconst ClipperLib = __ClipperNS.default ?? __ClipperNS;'

if (text.includes(old)) {
  fs.writeFileSync(target, text.replace(old, next))
  console.log('patch-paddleocr: applied clipper-lib interop patch')
} else if (text.includes('__ClipperNS')) {
  console.log('patch-paddleocr: already patched')
} else {
  console.warn('patch-paddleocr: unexpected import shape, skipped')
}
