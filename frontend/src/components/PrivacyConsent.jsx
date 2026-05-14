import React, { useState } from 'react'

export const CONSENT_KEY = 'lgpd_consent'

function safeGet(key) {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value) } catch { /* storage blocked */ }
}

function safeRemove(key) {
  try { localStorage.removeItem(key) } catch { /* storage blocked */ }
}

export function getCookieConsent() {
  return safeGet(CONSENT_KEY)
}

export default function CookieBanner({ onPrivacy }) {
  const [dismissed, setDismissed] = useState(() => !!safeGet(CONSENT_KEY))

  if (dismissed) return null

  function accept() {
    safeSet(CONSENT_KEY, 'all')
    setDismissed(true)
  }

  function essential() {
    safeSet(CONSENT_KEY, 'essential')
    safeRemove('muamba_recent')
    setDismissed(true)
  }

  return (
    <div className="cookie-banner" role="dialog" aria-label="Aviso de privacidade LGPD">
      <p className="cookie-banner__text">
        Usamos cookies essenciais para autenticação e cookies opcionais para salvar seu histórico de buscas.
        {' '}
        <button className="cookie-banner__link" onClick={onPrivacy} type="button">
          Política de Privacidade
        </button>
        .
      </p>
      <div className="cookie-banner__actions">
        <button className="cookie-banner__btn cookie-banner__btn--secondary" onClick={essential} type="button">
          Só essenciais
        </button>
        <button className="cookie-banner__btn cookie-banner__btn--primary" onClick={accept} type="button">
          Aceitar todos
        </button>
      </div>
    </div>
  )
}
