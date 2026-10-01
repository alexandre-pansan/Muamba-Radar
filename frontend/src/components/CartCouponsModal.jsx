import React, { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { apiFetchCartCoupons, getToken } from '../api.js'
import { Modal, EmptyState, Button } from './ui/index.js'
import useToast from './ui/useToast.js'

function discountLabel(c) {
  return c.type === 'percent' ? `${c.value}% OFF` : `US$ ${c.value} OFF`
}

/** The QR carries the coupon code itself, so a clerk's ordinary scanner reads out the
 * code to type into their own system. There is no redemption endpoint to point at —
 * MuambaRadar doesn't process the discount, the physical store does. */
function qrPayload(coupon) {
  return coupon.code
}

/**
 * Buyer-facing side of the seller coupon feature: shows the coupons that apply to what's
 * in the cart and lets the shopper save one as a PNG to show at the counter in Ciudad
 * del Este. Sellers create these under Modo Lojista (/seller/coupons).
 */
export default function CartCouponsModal({ open, onClose }) {
  const toast = useToast()
  const canvasRef = useRef(null)
  const [coupons, setCoupons] = useState(null) // null = still loading
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCoupons(null)
    setSelected(null)
    if (!getToken()) {
      setCoupons([])
      return
    }
    apiFetchCartCoupons().then(list => {
      if (cancelled) return
      setCoupons(list)
      if (list.length === 1) setSelected(list[0])
    })
    return () => { cancelled = true }
  }, [open])

  // Preview QR — themed like DonateModal's, so it stays legible in dark mode.
  useEffect(() => {
    if (!open || !selected || !canvasRef.current) return
    const style = getComputedStyle(document.documentElement)
    QRCode.toCanvas(canvasRef.current, qrPayload(selected), {
      width: 150,
      margin: 2,
      color: {
        dark: style.getPropertyValue('--ink').trim() || '#000000',
        light: style.getPropertyValue('--card').trim() || '#ffffff',
      },
    })
  }, [open, selected])

  async function handleDownload() {
    if (!selected) return
    const c = selected
    // The saved PNG is always light-on-white: it gets printed or shown on a phone at a
    // shop counter, where a dark-theme coupon would be unreadable.
    const qrDataUrl = await QRCode.toDataURL(qrPayload(c), {
      width: 180, margin: 0, color: { dark: '#111827', light: '#FFFFFF' },
    })
    const qrImg = new Image()
    qrImg.src = qrDataUrl
    await new Promise(resolve => { qrImg.onload = resolve })

    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 500
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, 400, 500)

    ctx.strokeStyle = '#F47B20'
    ctx.lineWidth = 4
    ctx.setLineDash([8, 8])
    ctx.strokeRect(10, 10, 380, 480)
    ctx.setLineDash([])

    ctx.textAlign = 'center'
    ctx.fillStyle = '#166534'
    ctx.font = 'bold 20px sans-serif'
    ctx.fillText('MuambaRADAR', 200, 45)

    ctx.fillStyle = '#6B7280'
    ctx.font = '12px sans-serif'
    ctx.fillText('CUPOM DE DESCONTO FÍSICO', 200, 65)

    ctx.fillStyle = '#F47B20'
    ctx.font = 'bold 36px sans-serif'
    ctx.fillText(discountLabel(c), 200, 115)

    ctx.fillStyle = '#111827'
    ctx.font = 'bold 18px monospace'
    ctx.fillText(`CÓDIGO: ${c.code}`, 200, 155)

    ctx.drawImage(qrImg, 110, 180, 180, 180)

    ctx.strokeStyle = '#E5E7EB'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, 385)
    ctx.lineTo(370, 385)
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 13px sans-serif'
    ctx.fillText(ellipsize(ctx, `Loja: ${c.store_name}`, 320), 40, 410)

    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#6B7280'
    const scopeLine = c.scope === 'product'
      ? `Produto: ${c.product_title}`
      : 'Válido para qualquer produto desta loja'
    ctx.fillText(ellipsize(ctx, scopeLine, 320), 40, 435)
    ctx.fillText('* Apresente este cupom na loja física do Paraguai.', 40, 460)

    const link = document.createElement('a')
    link.download = `cupom-${c.code.toLowerCase()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    toast('Imagem do cupom salva!')
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="🎟️ Cupons do seu carrinho">
      {coupons === null ? (
        <div className="cart-coupons-loading">Carregando cupons...</div>
      ) : coupons.length === 0 ? (
        <EmptyState
          icon="🎟️"
          title="Nenhum cupom disponível"
          text={getToken()
            ? 'Nenhuma das lojas dos seus itens tem cupom ativo no momento. Cupons são criados pelos próprios lojistas e aparecem aqui automaticamente.'
            : 'Entre na sua conta para ver os cupons das lojas dos seus itens.'}
        />
      ) : (
        <div className="cart-coupons-grid">
          <div className="cart-coupons-list">
            <p className="cart-coupons-hint">Selecione um cupom para ver o QR Code:</p>
            {coupons.map(c => {
              const isActive = selected && selected.code === c.code && selected.store_name === c.store_name
              return (
                <button
                  key={`${c.store_name}-${c.code}`}
                  type="button"
                  className={`cart-coupon-item${isActive ? ' is-active' : ''}`}
                  onClick={() => setSelected(c)}
                >
                  <span className="cart-coupon-item-discount">{discountLabel(c)}</span>
                  <span className="cart-coupon-item-store">{c.store_name}</span>
                  <span className="cart-coupon-item-scope">
                    {c.scope === 'product' ? c.product_title : 'Vale para a loja toda'}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="cart-coupons-preview">
            {!selected ? (
              <div className="cart-coupons-preview-empty">
                <div className="cart-coupons-preview-emoji">🎟️</div>
                Selecione um cupom ao lado para ver o QR Code e salvá-lo em PNG.
              </div>
            ) : (
              <>
                <div className="cart-coupon-preview-discount">{discountLabel(selected)}</div>
                <canvas ref={canvasRef} className="cart-coupon-preview-qr" />
                <div className="cart-coupon-preview-code">{selected.code}</div>
                <div className="cart-coupon-preview-store">{selected.store_name}</div>
                {selected.store?.address && (
                  <div className="cart-coupon-preview-address">{selected.store.address}</div>
                )}
                <Button variant="primary" onClick={handleDownload}>⬇ Salvar PNG</Button>
                <p className="cart-coupon-preview-note">
                  O desconto é aplicado na loja física — o MuambaRadar não processa a compra.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Canvas has no text wrapping — trim to fit instead of letting long store/product
 * names run off the edge of the saved coupon. */
function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out}…`
}
