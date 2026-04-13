import React, { useEffect, useRef, useState } from 'react'
import { apiFetchSources, apiTestSearch } from '../api.js'

export default function AdminModal({ open, onClose }) {
  const dialogRef = useRef(null)

  const [testQuery, setTestQuery]   = useState('')
  const [adapters, setAdapters]     = useState([])
  const [checked, setChecked]       = useState({})
  const [running, setRunning]       = useState(false)
  const [results, setResults]       = useState(null)
  const [error, setError]           = useState('')
  const [totalRaw, setTotalRaw]     = useState(null)
  const [totalFiltered, setTotalFiltered] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      loadAdapters()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  async function loadAdapters() {
    try {
      const list = await apiFetchSources()
      setAdapters(list)
      const initialChecked = {}
      list.forEach(a => { initialChecked[a.source] = true })
      setChecked(initialChecked)
    } catch (_) {
      setAdapters([])
    }
  }

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onClose()
  }

  function toggleAll(val) {
    const next = {}
    adapters.forEach(a => { next[a.source] = val })
    setChecked(next)
  }

  function toggleOne(source) {
    setChecked(prev => ({ ...prev, [source]: !prev[source] }))
  }

  async function handleRun() {
    const query = testQuery.trim()
    if (!query) return
    const selected = adapters.filter(a => checked[a.source]).map(a => a.source)
    setRunning(true)
    setError('')
    setResults(null)
    setTotalRaw(null)
    setTotalFiltered(null)
    try {
      const data = await apiTestSearch(query, selected)
      setTotalRaw(data.total_raw)
      setTotalFiltered(data.total_filtered)
      const sorted = [...data.adapters].sort((a, b) => {
        if (a.error && !b.error) return -1
        if (!a.error && b.error) return 1
        return b.filtered_count - a.filtered_count
      })
      setResults(sorted)
    } catch (err) {
      setError(err.message)
    } finally {
      setRunning(false)
    }
  }

  const byCountry = { br: [], py: [] }
  adapters.forEach(a => {
    const list = byCountry[a.country]
    if (list) list.push(a)
  })

  return (
    <dialog
      ref={dialogRef}
      className="admin-modal-dialog"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      {/* Left panel */}
      <div className="adm-left">
        <div className="adm-header">
          <h1 className="adm-title">MuambaRadar Dev Tools</h1>
          <span className="adm-admin-badge">Admin</span>
          <button className="adm-close-btn" onClick={onClose}>✕ Close</button>
        </div>

        <div className="adm-section">
          <h3 className="adm-section-label">Test Search</h3>
          <input
            type="text"
            className="adm-search-input"
            placeholder="e.g. iphone 15 128gb"
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRun()}
          />
          <button
            className={`adm-run-btn${running ? ' is-running' : ''}`}
            onClick={handleRun}
            disabled={running}
          >
            {running ? 'Running\u2026' : 'Run Search'}
          </button>
        </div>

        <div className="adm-section">
          <h3 className="adm-section-label">Adapters</h3>
          <div className="adm-action-bar">
            {['Select All', 'Deselect All'].map((label, i) => (
              <button key={label} className="adm-action-btn" onClick={() => toggleAll(i === 0)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="adm-adapters">
          {Object.entries(byCountry).map(([country, group]) => {
            if (!group.length) return null
            return (
              <React.Fragment key={country}>
                <div className="adm-country-label">
                  {country === 'br' ? 'Brasil' : 'Paraguai'}
                </div>
                {group.map(a => (
                  <label key={a.source} className="adm-adapter-label">
                    <input
                      type="checkbox"
                      className="adm-checkbox"
                      checked={!!checked[a.source]}
                      onChange={() => toggleOne(a.source)}
                    />
                    <span className="adm-adapter-name">{a.source}</span>
                    <span className={`adm-pill adm-pill-${country}`}>
                      {country.toUpperCase()}
                    </span>
                  </label>
                ))}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* Right panel */}
      <div className="adm-right">
        <div className="adm-results-header">
          <h3 className="adm-results-title">Results</h3>
          {totalRaw != null && (
            <div className="adm-stat-chip">
              Raw <strong>{totalRaw}</strong>
            </div>
          )}
          {totalFiltered != null && (
            <div className="adm-stat-chip">
              Filtered <strong className="adm-stat-filtered">{totalFiltered}</strong>
            </div>
          )}
        </div>
        <div className="adm-results-body">
          {error && <div className="adm-error-box">{error}</div>}
          {!results && !error && (
            <div className="adm-empty-msg">Run a search to see per-adapter debug output</div>
          )}
          {results && results.map((adapter, i) => (
            <AdminAdapterCard key={i} adapter={adapter} />
          ))}
        </div>
      </div>
    </dialog>
  )
}

function AdminAdapterCard({ adapter }) {
  const timingClass =
    adapter.timing_ms > 5000 ? 'very-slow' : adapter.timing_ms > 2000 ? 'slow' : ''

  const cardClass =
    'adm-card' +
    (adapter.error ? ' has-error' : adapter.filtered_count > 0 ? ' has-results' : '')

  return (
    <div className={cardClass}>
      <div className="adm-card-header">
        <span className="adm-card-name">{adapter.adapter_id}</span>
        <span className={`adm-pill adm-pill-${adapter.country}`}>
          {adapter.country.toUpperCase()}
        </span>
        <span className={`adm-timing${timingClass ? ' ' + timingClass : ''}`}>
          {adapter.timing_ms}ms
        </span>
      </div>
      <div className="adm-card-body">
        <div className="adm-counts">
          <span className="adm-count">Raw <strong>{adapter.raw_count}</strong></span>
          <span className="adm-count adm-count-filtered">
            Filtered <strong>{adapter.filtered_count}</strong>
          </span>
        </div>
        {adapter.error && (
          <div className="adm-error-box adm-error-box-sm">{adapter.error}</div>
        )}
        {adapter.sample_offers.length > 0 ? (
          <div className="adm-offers">
            {adapter.sample_offers.map((o, i) => (
              <div key={i} className="adm-offer-row">
                <span className="adm-offer-title" title={o.title}>{o.title}</span>
                <span className="adm-offer-price">
                  {o.currency} {o.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="adm-offer-link"
                >
                  &#x2197;
                </a>
              </div>
            ))}
          </div>
        ) : !adapter.error ? (
          <p className="adm-no-results">No results passed the filter.</p>
        ) : null}
      </div>
    </div>
  )
}
