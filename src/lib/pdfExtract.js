// Use the legacy (UMD/CJS-compatible) build — better cross-browser support than the ESM build.
// Vite handles CJS imports from node_modules automatically.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf'

pdfjs.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

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
