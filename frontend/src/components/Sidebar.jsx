import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n } from '../i18n.jsx'
import { apiFetchSuggestions, apiRefreshCache } from '../api.js'

const MARGIN_VALUES = [10, 20, 30, 35, 40, 45, 50]

function debounce(fn, ms) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export default function Sidebar({
  isOpen,
  query,
  onQueryChange,
  sort,
  onSortChange,
  onSearch,
  showMargin,
  targetMargin,
  onMarginChange,
  recentSearches,
  onRecentClick,
  currentUser,
  onDonate,
  donateGoal = 80,
  donateRaised = 0,
  donateSupporters = 0,
}) {
  const { t } = useI18n()
  const [suggestions, setSuggestions] = useState([])
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [donatePulse, setDonatePulse] = useState(false)
  const inputRef = useRef(null)

  const DONATE_COPIES = [
    { text: 'Já economizou hoje? Nos pague um café', emoji: '☕' },
    { text: 'Sem anúncios, sem rastreio — só você e o preço justo', emoji: '🙏' },
    { text: 'Este comparador roda em servidores pagos de bolso', emoji: '💸' },
    { text: 'Nos ajude a manter este comparador vivo', emoji: '🚀' },
  ]
  const donateCopy = useRef(DONATE_COPIES[Math.floor(Math.random() * DONATE_COPIES.length)])

  const donatePct = donateGoal > 0 ? Math.min(100, Math.round((donateRaised / donateGoal) * 100)) : 0

  // Golden pulse a cada 10 minutos
  useEffect(() => {
    const pulse = () => {
      setDonatePulse(true)
      setTimeout(() => setDonatePulse(false), 1800 * 3 + 200)
    }
    const id = setInterval(pulse, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  // Debounced suggestions fetch
  const debouncedFetch = useCallback(
    debounce(async (q) => {
      if (!q || q.length < 2) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }
      try {
        const items = await apiFetchSuggestions(q)
        setSuggestions(items)
        setShowSuggestions(items.length > 0)
        setActiveSuggestion(-1)
      } catch (_) {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 300),
    []
  )

  function hideSuggestions() {
    setShowSuggestions(false)
    setSuggestions([])
    setActiveSuggestion(-1)
  }

  function selectSuggestion(text) {
    onQueryChange(text)
    hideSuggestions()
    onSearch(text)
  }

  function handleKeyDown(e) {
    if (!showSuggestions || !suggestions.length) {
      if (e.key === 'Enter') onSearch()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestion(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      if (activeSuggestion >= 0) {
        e.preventDefault()
        selectSuggestion(suggestions[activeSuggestion])
      } else {
        onSearch()
      }
    } else if (e.key === 'Escape') {
      hideSuggestions()
    }
  }

  function handleInput(e) {
    const val = e.target.value
    onQueryChange(val)
    debouncedFetch(val.trim())
  }

  return (
    <aside className={`sidebar${isOpen ? ' is-open' : ''}`} id="sidebar">
      {/* Search block */}
      <div className="sb-block">
        <div className="autocomplete-wrap">
          <input
            ref={inputRef}
            className="sb-input"
            type="text"
            placeholder={t('search.placeholder')}
            autoComplete="off"
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(hideSuggestions, 150)}
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="suggestions-list">
              {suggestions.map((text, i) => (
                <li
                  key={text}
                  className={activeSuggestion === i ? 'is-active' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectSuggestion(text)
                  }}
                >
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sb-row">
          <label className="sb-label" htmlFor="sortSelect">{t('search.sort_label')}</label>
          <select
            id="sortSelect"
            className="sb-select"
            value={sort}
            onChange={e => onSortChange(e.target.value)}
          >
            <option value="best_match">{t('search.sort_best')}</option>
            <option value="lowest_price">{t('search.sort_lowest')}</option>
          </select>
        </div>

        <button className="compare-btn" onClick={() => onSearch()}>
          <span className="btn-label">{t('search.btn')}</span>
        </button>
      </div>

      {showMargin && <div className="sb-sep" />}

      {/* Margin block */}
      {showMargin && (
        <div className="sb-block">
          <div className="sb-block-head">
            <span className="sb-section-title">{t('sidebar.margin_title')}</span>
          </div>
          <div className="margin-chips">
            {MARGIN_VALUES.map(m => (
              <button
                key={m}
                type="button"
                className={`margin-chip${targetMargin === m ? ' is-active' : ''}`}
                onClick={() => onMarginChange(m)}
              >
                {m}%
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sb-sep" />

      {/* Recent searches */}
      <div className="sb-block sb-block-grow">
        <span className="sb-section-title">{t('sidebar.recents_title')}</span>
        <ul className="recent-list">
          {recentSearches.length === 0 ? (
            currentUser ? (
              <li className="recent-empty">{t('sidebar.no_recents')}</li>
            ) : (
              <li className="recent-empty recent-cta">
                {t('sidebar.recents_cta')}
              </li>
            )
          ) : (
            recentSearches.map((q, i) => (
              <li
                key={i}
                className="recent-item"
                role="button"
                tabIndex={0}
                onClick={() => onRecentClick(q)}
                onKeyDown={e => e.key === 'Enter' && onRecentClick(q)}
              >
                {q}
              </li>
            ))
          )}
        </ul>
      </div>

      <div className={`sb-donate${donatePulse ? ' sb-donate--pulse' : ''}`}>

        {/* Header: ícone de café animado + copy rotativo */}
        <div className="sb-donate-header">
          <svg className="sb-donate-cup" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
            <defs>
              <clipPath id="cup-fill-clip">
                <rect x="0" className="cup-liquid-rect" width="24" height="24" />
              </clipPath>
            </defs>
            {/* liquid fill */}
            <path d="M5 10h14l-1.5 9H6.5L5 10z" fill="#fbbf24" opacity="0.35" clipPath="url(#cup-fill-clip)" />
            {/* cup outline */}
            <path d="M5 10h14l-1.5 9H6.5L5 10z" stroke="#fbbf24" strokeWidth="1.4" strokeLinejoin="round" />
            {/* handle */}
            <path d="M19 12h1.5a1.5 1.5 0 010 3H19" stroke="#fbbf24" strokeWidth="1.4" strokeLinecap="round" />
            {/* steam */}
            <path d="M9 7c0-1 1-1 1-2M12 7c0-1 1-1 1-2M15 7c0-1 1-1 1-2" stroke="#fbbf24" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
          </svg>
          <p className="sb-donate-text">
            {donateCopy.current.text} {donateCopy.current.emoji}
          </p>
        </div>

        {/* Social proof */}
        <p className="sb-donate-social">
          <span className="sb-donate-social-dot" aria-hidden="true" />
          {donateSupporters} pessoas já apoiaram
        </p>

        {/* Progress bar */}
        <div className="sb-donate-progress"
          role="progressbar"
          aria-valuenow={donatePct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`R$${donateRaised} de R$${donateGoal} arrecadados este mês`}
        >
          <div className="sb-donate-progress-bar" style={{ width: `${donatePct}%` }} />
        </div>
        <p className="sb-donate-progress-label">R$ {donateRaised} de R$ {donateGoal}/mês</p>

        {/* Button com shimmer */}
        <div className="sb-donate-btn-wrap">
          <button className="sb-donate-btn" onClick={onDonate}>
            Doe agora
          </button>
          <span className="sb-donate-btn-hint">via PIX · leva 10 segundos</span>
        </div>

      </div>

    </aside>
  )
}
