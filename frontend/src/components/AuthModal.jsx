import React, { useEffect, useRef } from 'react'
import { useI18n } from '../i18n.jsx'
import { LoginForm, RegisterForm } from './AuthForms.jsx'

export default function AuthModal({
  open,
  tab,
  onTabChange,
  onClose,
  onLoginSuccess,
  onRegisterSuccess,
  onOpenLegal,
}) {
  const { t } = useI18n()
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setTimeout(() => dialog.querySelector('input')?.focus(), 50)
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  function handleTabChange(newTab) {
    onTabChange(newTab)
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-sm"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="modal-header">
        <nav className="auth-tabs">
          <button
            className={`auth-tab${tab === 'login' ? ' is-active' : ''}`}
            onClick={() => handleTabChange('login')}
          >
            {t('auth.login')}
          </button>
          <button
            className={`auth-tab${tab === 'register' ? ' is-active' : ''}`}
            onClick={() => handleTabChange('register')}
          >
            {t('auth.register')}
          </button>
        </nav>
        <button
          className="modal-close"
          type="button"
          aria-label="Fechar"
          onClick={onClose}
        >
          &times;
        </button>
      </div>

      <div className="modal-body">
        {tab === 'login' && <LoginForm onSuccess={onLoginSuccess} />}
        {tab === 'register' && <RegisterForm onSuccess={onRegisterSuccess} onOpenLegal={onOpenLegal} />}
      </div>
    </dialog>
  )
}
