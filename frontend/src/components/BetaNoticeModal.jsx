import React, { useEffect, useRef } from 'react'
import { apiSavePrefs } from '../api.js'

const DEFAULT_TITLE = '🚧 Versão Beta'
const DEFAULT_BODY1 = 'O <strong>MuambaRadar</strong> está em desenvolvimento ativo. Algumas funcionalidades podem estar incompletas, os preços são obtidos automaticamente e podem conter inconsistências.'
const DEFAULT_BODY2 = 'Use as informações como referência e sempre confirme o preço final diretamente na loja antes de comprar.'

const LS_KEY = (v) => `muamba_beta_dismissed_v${v}`

export function shouldShowBetaNotice({ user, prefs, version }) {
  if (localStorage.getItem(LS_KEY(version))) return false
  if (user && prefs?.hide_beta_notice) return false
  return true
}

export default function BetaNoticeModal({ open, onClose, isLoggedIn, betaVersion, betaTitle, betaBody1, betaBody2 }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open) el.showModal()
    else { try { el.close() } catch (_) {} }
  }, [open])

  async function handleHide() {
    localStorage.setItem(LS_KEY(betaVersion), '1')
    if (isLoggedIn) {
      try { await apiSavePrefs({ hide_beta_notice: true }) } catch (_) {}
    }
    onClose()
  }

  return (
    <dialog ref={dialogRef} className="modal modal-sm" onClose={onClose}>
      <div className="modal-header">
        <span className="modal-title">{betaTitle || DEFAULT_TITLE}</span>
        <button className="modal-close" onClick={onClose} aria-label="Fechar">✕</button>
      </div>
      <div className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ margin: 0, lineHeight: '1.6' }} dangerouslySetInnerHTML={{ __html: betaBody1 || DEFAULT_BODY1 }} />
        <p style={{ margin: 0, lineHeight: '1.6', color: 'var(--muted)' }} dangerouslySetInnerHTML={{ __html: betaBody2 || DEFAULT_BODY2 }} />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <button className="btn-inline btn-muted" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-inline" onClick={handleHide}>
            Não mostrar mais
          </button>
        </div>
      </div>
    </dialog>
  )
}
