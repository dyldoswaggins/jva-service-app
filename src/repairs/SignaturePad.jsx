import { useEffect, useRef, useState } from 'react'

// Finger / stylus signature on iPad. onChange gets PNG bytes (Uint8Array) or null when cleared.
export default function SignaturePad({ onChange, label = 'Client signs here with a finger' }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = ref.current
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#000'
  }, [])

  const pos = e => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const down = e => {
    e.preventDefault()
    try { ref.current.setPointerCapture(e.pointerId) } catch { /* not supported: keep drawing anyway */ }
    drawing.current = true
    const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e))
  }
  const move = e => { if (!drawing.current) return; const ctx = ref.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); if (empty) setEmpty(false) }
  const up = async () => {
    if (!drawing.current) return
    drawing.current = false
    // Synchronous, so a tap on Save right after signing already has the signature (iPad)
    const bin = atob(trimmed(ref.current).toDataURL('image/png').split(',')[1])
    onChange(Uint8Array.from(bin, c => c.charCodeAt(0)))
  }
  // Only the ink (+ a small margin), so documents can place the signature right on the signature line (Richard, 2026-11-27)
  const trimmed = c => {
    const { width: W, height: H } = c
    const px = c.getContext('2d').getImageData(0, 0, W, H).data
    let x0 = W, y0 = H, x1 = -1, y1 = -1
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[(y * W + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    if (x1 < 0) return c
    const m = Math.round(4 * (window.devicePixelRatio || 1))
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m)
    const out = document.createElement('canvas')
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
    return out
  }
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(null) }

  return (
    <div className="sigwrap">
      <canvas ref={ref} className="sigpad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        aria-label={label} />
      <div className="actions">
        <span className="msg">{empty ? label : 'Signed'}</span>
        <span className="grow" />
        <button type="button" className="btn" onClick={clear} disabled={empty}>Clear</button>
      </div>
    </div>
  )
}
