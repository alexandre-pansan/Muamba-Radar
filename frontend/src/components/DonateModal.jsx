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

  function renderQR() {
    if (!canvasRef.current) return
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
  }

  useEffect(() => {
    if (!open) return
    renderQR()
  }, [open, activeAmount])

  // Re-render QR when theme changes while modal is open
  useEffect(() => {
    if (!open) return
    const observer = new MutationObserver(() => renderQR())
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
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
    <dialog ref={dialogRef} className="modal modal-md" onClose={onClose}>
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

        <div className="donate-maker">
          <div className="donate-maker-left">
            <span className="donate-maker-tag">Projeto independente</span>
            <p className="donate-maker-desc">
              Feito do zero, sem anúncios e sem investidores.
            </p>
          </div>

          <div className="donate-maker-right">
            <div className="donate-maker-avatar" aria-hidden="true">AP</div>
            <div className="donate-maker-meta">
              <span className="donate-maker-name">Alexandre Pansan Jr.</span>
              <span className="donate-maker-role">Dev & criador</span>
              <a
                href="https://www.linkedin.com/in/alexandrepansan/"
                target="_blank"
                rel="noopener noreferrer"
                className="donate-maker-linkedin"
                aria-label="LinkedIn de Alexandre Pansan"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true">
                  <path d="M20.45 20.45h-3.554v-5.57c0-1.328-.024-3.036-1.85-3.036-1.851 0-2.134 1.446-2.134 2.94v5.666H9.358V9h3.413v1.561h.049c.475-.9 1.636-1.85 3.368-1.85 3.6 0 4.265 2.37 4.265 5.455v6.284zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zm1.782 13.017H3.555V9h3.564v11.45zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.226.792 24 1.771 24h20.451C23.2 24 24 23.226 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                /alexandrepansan
              </a>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  )
}
