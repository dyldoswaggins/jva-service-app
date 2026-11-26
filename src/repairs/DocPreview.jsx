import { useEffect, useRef, useState } from 'react'
import { buildConfirmation, buildEstimate, buildInvoice, docFileName } from '../docs/serviceDocs.js'
import { autoNotes } from '../docs/lines.js'
import { weeksUntil } from '../rules.js'

const one = x => (Array.isArray(x) ? x[0] : x) || null
const BUILD = { estimate: buildEstimate, confirmation: buildConfirmation, invoice: buildInvoice }

// The SAV page's Estimate / Confirmation / Invoice tabs: the document as it prints, page by page, from what's on the job now
// (Richard, 2026-11-26). "Print / Save as PDF" prints this copy; filing it on the job is done with the buttons below it.
export default function DocPreview({ kind, job, allParts, printPdf }) {
  const [blob, setBlob] = useState(null)
  const [err, setErr] = useState('')
  const box = useRef(null)

  useEffect(() => {
    let stop = false
    const client = one(job.job_clients) || {}
    const weeks = (job.estimate_source === 'rolex' && job.rolex_estimate?.weeks) || weeksUntil(job.eta_override || job.eta_quoted)
    const notes = job.estimate_notes ?? autoNotes(job, allParts)
    setErr('')
    BUILD[kind]({ job, client, allParts, notes, weeks }).then(b => { if (!stop) setBlob(b) }).catch(e => !stop && setErr(e.message))
    return () => { stop = true }
  }, [kind, job, allParts])

  // Draw every page on a canvas (pdf.js), like the SAV page's Letter pages
  useEffect(() => {
    if (!blob || !box.current) return
    let stop = false
    ;(async () => {
      const pdfjs = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), verbosity: 0 }).promise
      if (stop) return
      box.current.replaceChildren()
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const v = page.getViewport({ scale: 2 })
        const c = document.createElement('canvas')
        c.width = v.width; c.height = v.height; c.className = 'docpage'
        c.setAttribute('aria-label', `Page ${i} of ${pdf.numPages}`)
        await page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise
        if (stop) return
        box.current.appendChild(c)
      }
    })().catch(e => !stop && setErr(e.message))
    return () => { stop = true }
  }, [blob])

  return (
    <section className="docview">
      <div className="docbar">
        <button type="button" className="btn solid" disabled={!blob} onClick={() => printPdf(blob)}>Print / Save as PDF</button>
        <button type="button" className="btn" disabled={!blob} onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = docFileName(job, kind); a.click() }}>Download</button>
        <span className="msg">Choose "Save as PDF" in the print dialog to email it. Filing it on the job: below the pages.</span>
      </div>
      {err && <p className="msg warn">{err}</p>}
      {!blob && !err && <p className="msg">Preparing the {kind}…</p>}
      <div className="docs" ref={box} />
    </section>
  )
}
