import React, { useEffect, useRef, useState, useCallback } from 'react'
import { apiSavePrefs } from '../api.js'

const LS_KEY = (v) => `muamba_beta_dismissed_v${v}`

export function shouldShowBetaNotice({ user, prefs, version }) {
  if (localStorage.getItem(LS_KEY(version))) return false
  if (user && prefs?.hide_beta_notice) return false
  return true
}

const SLIDES = [
  {
    img: '/tutorial/slide-busca.png',
    title: 'Pesquise qualquer produto',
    desc: 'Digite o nome do produto no campo de busca e clique em "Comparar Preços" para ver resultados de várias lojas.',
  },
  {
    img: '/tutorial/slide-resultado.png',
    title: 'Compare preços em segundos',
    desc: 'Veja o produto com preços de lojas do Paraguai e do Brasil lado a lado. O ícone ♡ salva o item na sua lista.',
  },
  {
    img: '/tutorial/slide-recentes.png',
    title: 'Buscas recentes',
    desc: 'Suas últimas pesquisas ficam salvas para você repetir uma busca rapidinho, sem precisar redigitar.',
  },
  {
    img: '/tutorial/slide-menu.png',
    title: 'Menu superior',
    desc: 'Acompanhe a cotação do dólar em tempo real, acesse seu carrinho de compras e as configurações da sua conta.',
  },
  {
    img: '/tutorial/slide-carrinho.png',
    title: 'Lista de compras',
    desc: 'O carrinho agrupa os itens salvos por loja e mostra o total estimado. Clique em "Ver lista completa" para mais detalhes.',
  },
  {
    img: '/tutorial/slide-mapa.png',
    title: 'Mapa das lojas',
    desc: 'Na lista completa você vê a localização de cada loja no mapa do Paraguai — ideal para planejar seu roteiro de compras.',
  },
  {
    img: null,
    title: '⚠️ Versão Beta',
    desc: 'O MuambaRadar está em desenvolvimento ativo. Os preços são obtidos automaticamente e podem conter inconsistências — confirme sempre o preço final na loja antes de comprar.',
    isFinal: true,
  },
]

export default function BetaNoticeModal({ open, onClose, isLoggedIn, betaVersion }) {
  const dialogRef = useRef(null)
  const [current, setCurrent] = useState(0)
  const [dir, setDir] = useState('right')

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) { setCurrent(0); el.showModal() }
    else { try { el.close() } catch (_) {} }
  }, [open])

  async function handleHide() {
    localStorage.setItem(LS_KEY(betaVersion), '1')
    if (isLoggedIn) {
      try { await apiSavePrefs({ hide_beta_notice: true }) } catch (_) {}
    }
    onClose()
  }

  const go = useCallback((next) => {
    setDir(next > current ? 'right' : 'left')
    setCurrent(next)
  }, [current])

  const slide = SLIDES[current]
  const isLast = current === SLIDES.length - 1
  const isFirst = current === 0

  return (
    <dialog ref={dialogRef} className="modal modal-md beta-tour-modal" onClose={onClose}>
      <div className="modal-header">
        <span className="modal-title">Como funciona</span>
        <span className="beta-tour-counter">{current + 1} / {SLIDES.length}</span>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>

      <div className="beta-tour-body">
        <div key={current} className={`beta-tour-slide beta-tour-slide-${dir}`}>
          {slide.img ? (
            <div className="beta-tour-img-wrap">
              <img src={slide.img} alt={slide.title} className="beta-tour-img" />
            </div>
          ) : (
            <div className="beta-tour-img-wrap beta-tour-img-placeholder">
              <span style={{ fontSize: '3rem' }}>🚧</span>
            </div>
          )}

          <div className="beta-tour-text">
            <h3 className="beta-tour-title">{slide.title}</h3>
            <p className="beta-tour-desc">{slide.desc}</p>
          </div>
        </div>

        <div className="beta-tour-nav">
          <button
            className="beta-tour-arrow"
            onClick={() => go(current - 1)}
            disabled={isFirst}
            aria-label="Anterior"
          >
            ‹
          </button>

          <div className="beta-tour-dots">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                className={`beta-tour-dot${i === current ? ' active' : ''}`}
                onClick={() => go(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            className="beta-tour-arrow"
            onClick={() => go(current + 1)}
            disabled={isLast}
            aria-label="Próximo"
          >
            ›
          </button>
        </div>

        {isLast && (
          <div className="beta-tour-actions">
            <button className="btn-inline btn-muted" onClick={onClose}>Fechar</button>
            <button className="btn-inline" onClick={handleHide}>Não mostrar mais</button>
          </div>
        )}
        {!isLast && (
          <div className="beta-tour-actions">
            <button className="btn-inline btn-muted" onClick={onClose}>Pular</button>
            <button className="btn-inline" onClick={() => go(current + 1)}>Próximo →</button>
          </div>
        )}
      </div>
    </dialog>
  )
}
