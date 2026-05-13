// Use the legacy (UMD/CJS-compatible) build — better cross-browser support than the ESM build.
// Vite handles CJS imports from node_modules automatically.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf'

// Setting workerSrc to '' disables the Web Worker entirely.
// pdfjs falls back to its built-in PDFFakeWorkerThread which runs on the main thread.
// This is slower than a real worker but works in all browsers including Safari on iPad
// without any CDN dependency or worker-file bundling issues.
pdfjs.GlobalWorkerOptions.workerSrc = ''

export async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdf = await loadingTask.promise

  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
    pages.push(pageText)
  }

  return pages.join('\n\n').trim()
}
