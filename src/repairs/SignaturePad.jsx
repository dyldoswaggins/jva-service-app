import { useEffect, useRef, useState } from 'react'

// Finger / stylus signature on iPad. onChange gets PNG bytes (Uint8Array) or null when cleared.
export default function SignaturePad({ onChange }) {
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
  const down = e => { e.preventDefault(); ref.current.setPointerCapture(e.pointerId); drawing.current = true; const ctx = ref.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)) }
  const move = e => { if (!drawing.current) return; const ctx = ref.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke(); if (empty) setEmpty(false) }
  const up = async () => {
    if (!drawing.current) return
    drawing.current = false
    const blob = await new Promise(r => ref.current.toBlob(r, 'image/png'))
    onChange(new Uint8Array(await blob.arrayBuffer()))
  }
  const clear = () => { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(null) }

  return (
    <div className="sigwrap">
      <canvas ref={ref} className="sigpad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        aria-label="Client signature" />
      <div className="actions">
        <span className="msg">{empty ? 'Client signs here with a finger' : 'Signed'}</span>
        <span className="grow" />
        <button type="button" className="btn" onClick={clear} disabled={empty}>Clear</button>
      </div>
    </div>
  )
}
