import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { buildPixPayload, PIX_KEY, PIX_NAME, PIX_CITY } from '../pix.js'

const PRESETS = [5, 10, 25, 50]

export default function DonateModal({ open, onClose }) {
  const dialogRef  = useRef(null)
  const canvasRef  = useRef(null)
  const [amount, setAmount]   = useState(10)
  const [custom, setCustom]   = useState('')
  const [copied, setCopied]   = useState(false)

  const activeAmount = custom ? parseFloat(custom) : amount

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) el.showModal()
    else { try { el.close() } catch (_) {} }
  }, [open])

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const payload = buildPixPayload({
      key: PIX_KEY,
      name: PIX_NAME,
      city: PIX_CITY,
      amount: isNaN(activeAmount) || activeAmount < 1 ? undefined : activeAmount,
    })
    const style = getComputedStyle(document.documentElement)
    QRCode.toCanvas(canvasRef.current, payload, {
      width: 200,
      margin: 2,
      color: {
        dark:  style.getPropertyValue('--ink').trim()  || '#000000',
        light: style.getPropertyValue('--card').trim() || '#ffffff',
      },
    })
  }, [open, activeAmount])

  async function handleCopy() {
    const payload = buildPixPayload({
      key: PIX_KEY,
      name: PIX_NAME,
      city: PIX_CITY,
      amount: isNaN(activeAmount) || activeAmount < 1 ? undefined : activeAmount,
    })
    await navigator.clipboard.writeText(payload)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <dialog ref={dialogRef} className="modal modal-sm" onClose={onClose}>
      <div className="modal-header">
        <span className="modal-title">☕ Nos apoie</span>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="modal-body donate-modal-body">
        <p className="donate-subtitle">
          O MuambaRadar é gratuito e sem anúncios. Se ele te ajudou a economizar, considere contribuir!
        </p>

        <div className="donate-presets">
          {PRESETS.map(v => (
            <button
              key={v}
              className={`donate-preset-btn${amount === v && !custom ? ' is-active' : ''}`}
              onClick={() => { setAmount(v); setCustom('') }}
            >
              R$ {v}
            </button>
          ))}
        </div>

        <div className="donate-custom-row">
          <span className="donate-custom-prefix">R$</span>
          <input
            type="number"
            className="donate-custom-input"
            placeholder="Outro valor"
            min="1"
            value={custom}
            onChange={e => setCustom(e.target.value)}
          />
        </div>

        <div className="donate-qr-wrap">
          <canvas ref={canvasRef} className="donate-qr-canvas" />
        </div>

        <p className="donate-hint">Escaneie com qualquer app de banco</p>

        <button className="donate-copy-btn" onClick={handleCopy}>
          {copied ? '✓ Código copiado!' : 'Copiar código PIX'}
        </button>
      </div>
    </dialog>
  )
}
