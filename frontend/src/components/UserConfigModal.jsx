import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { apiUpdateMe, apiFetchUserSearches } from '../api.js'
import { DEFAULT_RATES, mergeRates } from '../taxRates.js'

export default function UserConfigModal({
  open,
  onClose,
  currentUser,
  currentPrefs,
  savedTaxRates,
  onUserUpdate,
  onPrefChange,
  onSearchClick,
}) {
  const { t } = useI18n()
  const dialogRef = useRef(null)

  const [profileName, setProfileName]       = useState('')
  const [profileError, setProfileError]     = useState('')
  const [profileSaving, setProfileSaving]   = useState(false)
  const [profileSaved, setProfileSaved]     = useState(false)

  const [newPassword, setNewPassword]       = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError]   = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSaved, setPasswordSaved]   = useState(false)

  const [userSearches, setUserSearches]     = useState([])
  const [searchesLoading, setSearchesLoading] = useState(false)

  const [taxRates, setTaxRates]           = useState(() => mergeRates(savedTaxRates))
  const [taxSaved, setTaxSaved]           = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Pre-populate
      setProfileName(currentUser?.name || '')
      setProfileError('')
      setPasswordError('')
      setNewPassword('')
      setConfirmPassword('')
      setProfileSaved(false)
      setPasswordSaved(false)
      loadUserSearches()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, currentUser])

  async function loadUserSearches() {
    if (!currentUser) return
    setSearchesLoading(true)
    try {
      const data = await apiFetchUserSearches()
      setUserSearches(data)
    } catch (_) {
      setUserSearches([])
    } finally {
      setSearchesLoading(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onClose()
  }

  async function handleProfileSubmit(e) {
    e.preventDefault()
    setProfileError('')
    setProfileSaving(true)
    try {
      const user = await apiUpdateMe({ name: profileName.trim() || null })
      onUserUpdate(user)
      setProfileSaved(true)
      setTimeout(() => setProfileSaved(false), 2000)
    } catch (err) {
      setProfileError(err.message || t('config.save_error'))
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePasswordSubmit(e) {
    e.preventDefault()
    setPasswordError('')
    if (newPassword !== confirmPassword) {
      setPasswordError(t('config.password_mismatch'))
      return
    }
    setPasswordSaving(true)
    try {
      await apiUpdateMe({ password: newPassword })
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSaved(true)
      setTimeout(() => setPasswordSaved(false), 2000)
    } catch (err) {
      setPasswordError(err.message || t('config.save_error'))
    } finally {
      setPasswordSaving(false)
    }
  }

  async function handlePrefToggle(e) {
    await onPrefChange({ show_margin: e.target.checked })
  }

  async function handleTaxSave(e) {
    e.preventDefault()
    await onPrefChange({ tax_rates: taxRates })
    setTaxSaved(true)
    setTimeout(() => setTaxSaved(false), 2000)
  }

  async function handleTaxReset() {
    const defaults = { ...DEFAULT_RATES }
    setTaxRates(defaults)
    await onPrefChange({ tax_rates: defaults })
    setTaxSaved(true)
    setTimeout(() => setTaxSaved(false), 2000)
  }

  return (
    <dialog
      ref={dialogRef}
      className="user-config-modal"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="ucm-header">
        <h2 className="ucm-title">{t('config.title')}</h2>
        <button className="ucm-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
      </div>

      {/* Profile section */}
      <section className="ucm-section">
        <h3 className="ucm-section-title">{t('config.profile_section')}</h3>
        <form className="ucm-form" onSubmit={handleProfileSubmit}>
          <label className="field">
            <span>{t('config.name_label')}</span>
            <input
              type="text"
              autoComplete="name"
              value={profileName}
              onChange={e => setProfileName(e.target.value)}
            />
          </label>
          {profileError && <p className="ucm-error">{profileError}</p>}
          <button
            type="submit"
            className="btn-save"
            disabled={profileSaving}
          >
            {profileSaved ? t('config.saved') : t('config.save_name')}
          </button>
        </form>

        <form className="ucm-form ucm-form-sep" onSubmit={handlePasswordSubmit}>
          <label className="field">
            <span>{t('config.new_password')}</span>
            <input
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('config.confirm_password')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
          </label>
          {passwordError && <p className="ucm-error">{passwordError}</p>}
          <button
            type="submit"
            className="btn-save"
            disabled={passwordSaving}
          >
            {passwordSaved ? t('config.saved') : t('config.change_password')}
          </button>
        </form>
      </section>

      {/* Preferences section */}
      <section className="ucm-section">
        <h3 className="ucm-section-title">{t('config.prefs_section')}</h3>
        <label className="pref-row">
          <span>{t('config.show_margin')}</span>
          <input
            type="checkbox"
            className="pref-toggle"
            role="switch"
            checked={currentPrefs?.show_margin ?? false}
            onChange={handlePrefToggle}
          />
        </label>
      </section>

      {/* Tax rates section */}
      <section className="ucm-section">
        <h3 className="ucm-section-title">Taxas de Pagamento</h3>
        <form className="ucm-form" onSubmit={handleTaxSave}>
          <div className="tax-rates-grid">
            {[
              { key: 'credit_na_hora', label: 'Crédito — Na hora (%)', pct: true },
              { key: 'credit_14d',     label: 'Crédito — 14 dias (%)',  pct: true },
              { key: 'credit_30d',     label: 'Crédito — 30 dias (%)',  pct: true },
              { key: 'pix',            label: 'Pix (%)',                pct: true },
              { key: 'open_finance',   label: 'Open Finance (%)',        pct: true },
              { key: 'mp_saldo',       label: 'Carteira Digital (%)',     pct: true },
              { key: 'prepago',        label: 'Pré-pago (%)',            pct: true },
              { key: 'linha_credito',  label: 'Linha de Crédito (%)',    pct: true },
              { key: 'boleto_fixed',   label: 'Boleto (R$ fixo)',        pct: false },
            ].map(({ key, label, pct }) => (
              <label key={key} className="field tax-rate-field">
                <span>{label}</span>
                <input
                  type="number"
                  step={pct ? '0.01' : '0.01'}
                  min="0"
                  value={pct
                    ? (taxRates[key] * 100).toFixed(2)
                    : taxRates[key].toFixed(2)
                  }
                  onChange={e => {
                    const v = parseFloat(e.target.value)
                    if (!isNaN(v)) setTaxRates(prev => ({ ...prev, [key]: pct ? v / 100 : v }))
                  }}
                />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button type="submit" className="btn-save">
              {taxSaved ? 'Salvo ✓' : 'Salvar taxas'}
            </button>
            <button type="button" className="btn-save btn-save-secondary" onClick={handleTaxReset}>
              Restaurar padrões
            </button>
          </div>
        </form>
      </section>

      {/* Recent searches section */}
      <section className="ucm-section">
        <h3 className="ucm-section-title">{t('config.searches_section')}</h3>
        <ul className="ucm-search-list">
          {searchesLoading ? (
            <li className="ucm-empty">&hellip;</li>
          ) : userSearches.length === 0 ? (
            <li className="ucm-empty">{t('sidebar.no_recents')}</li>
          ) : (
            userSearches.map((s, i) => (
              <li
                key={i}
                className="ucm-search-item"
                onClick={() => onSearchClick(s.query)}
              >
                {s.query}
              </li>
            ))
          )}
        </ul>
      </section>
    </dialog>
  )
}
