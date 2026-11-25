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
    const bin = atob(ref.current.toDataURL('image/png').split(',')[1])
    onChange(Uint8Array.from(bin, c => c.charCodeAt(0)))
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
