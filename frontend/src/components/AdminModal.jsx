import React, { useEffect, useRef, useState } from 'react'
import { apiFetchSources, apiTestSearch } from '../api.js'

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function AdapterCard({ adapter }) {
  const timingClass =
    adapter.timing_ms > 5000 ? 'very-slow' : adapter.timing_ms > 2000 ? 'slow' : ''

  const cardClass =
    'adapter-card' +
    (adapter.error ? ' has-error' : adapter.filtered_count > 0 ? ' has-results' : '')

  return (
    <div className={cardClass}>
      <div className="adapter-card-header">
        <span className="adapter-name">{adapter.adapter_id}</span>
        <span className={`country-pill country-${adapter.country}`}>
          {adapter.country.toUpperCase()}
        </span>
        <span className={`timing${timingClass ? ' ' + timingClass : ''}`}>
          {adapter.timing_ms}ms
        </span>
      </div>
      <div className="adapter-card-body">
        <div className="counts">
          <span className="count-chip">
            Raw <strong>{adapter.raw_count}</strong>
          </span>
          <span className="count-chip filtered">
            Filtered <strong>{adapter.filtered_count}</strong>
          </span>
        </div>
        {adapter.error && (
          <div className="error-box">{adapter.error}</div>
        )}
        {adapter.sample_offers.length > 0 ? (
          <div className="offers-list">
            {adapter.sample_offers.map((o, i) => (
              <div key={i} className="offer-row">
                <span className="offer-title" title={o.title}>{o.title}</span>
                <span className="offer-price">
                  {o.currency} {o.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <a href={o.url} target="_blank" rel="noopener noreferrer">&#x2197;</a>
              </div>
            ))}
          </div>
        ) : !adapter.error ? (
          <p className="no-results-msg">No results passed the filter.</p>
        ) : null}
      </div>
    </div>
  )
}

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
      // Sort: errors first, then by filtered_count desc
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

  // Group adapters by country
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
      style={{
        border: 'none',
        borderRadius: '12px',
        padding: 0,
        width: 'min(900px, 96vw)',
        maxHeight: '90vh',
        background: '#0d0d0d',
        color: '#e0e0e0',
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        gridTemplateColumns: '280px 1fr',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        fontSize: '14px',
      }}
    >
      {/* Left panel */}
      <div style={{
        background: '#111',
        borderRight: '1px solid #2a2a2a',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header inside left panel */}
        <div style={{
          background: '#111',
          borderBottom: '1px solid #2a2a2a',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}>
          <h1 style={{ fontSize: '18px', color: '#fff' }}>MuambaRadar Dev Tools</h1>
          <span style={{
            background: '#c00', color: '#fff',
            fontSize: '10px', fontWeight: 'bold',
            padding: '2px 6px', borderRadius: '4px',
            textTransform: 'uppercase', letterSpacing: '1px',
          }}>Admin</span>
          <button
            style={{
              marginLeft: 'auto',
              background: 'none', border: 'none',
              color: '#5a9cf8', cursor: 'pointer', fontSize: '13px',
            }}
            onClick={onClose}
          >
            ✕ Close
          </button>
        </div>

        {/* Test Search */}
        <div style={{ padding: '16px', borderBottom: '1px solid #1e1e1e' }}>
          <h3 style={{
            fontSize: '11px', textTransform: 'uppercase',
            letterSpacing: '1px', color: '#555', marginBottom: '10px',
          }}>Test Search</h3>
          <input
            type="text"
            placeholder="e.g. iphone 15 128gb"
            value={testQuery}
            onChange={e => setTestQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRun()}
            style={{
              width: '100%',
              background: '#1a1a1a', border: '1px solid #333',
              color: '#e0e0e0', padding: '8px 10px',
              borderRadius: '6px', fontSize: '14px',
              marginBottom: '8px', outline: 'none',
            }}
          />
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              width: '100%',
              background: running ? '#333' : '#5a9cf8',
              color: '#fff', border: 'none',
              padding: '9px', borderRadius: '6px',
              fontSize: '14px', fontWeight: '600',
              cursor: running ? 'default' : 'pointer',
              opacity: running ? 0.7 : 1,
              transition: 'background 0.15s',
            }}
          >
            {running ? 'Running\u2026' : 'Run Search'}
          </button>
        </div>

        {/* Adapters */}
        <div style={{ padding: '16px', borderBottom: '1px solid #1e1e1e' }}>
          <h3 style={{
            fontSize: '11px', textTransform: 'uppercase',
            letterSpacing: '1px', color: '#555', marginBottom: '10px',
          }}>Adapters</h3>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '0' }}>
            {['Select All', 'Deselect All'].map((label, i) => (
              <button
                key={label}
                style={{
                  flex: 1, background: '#1e1e1e',
                  border: '1px solid #333', color: '#aaa',
                  padding: '5px', borderRadius: '5px',
                  fontSize: '12px', cursor: 'pointer',
                }}
                onClick={() => toggleAll(i === 0)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 16px' }}>
          {Object.entries(byCountry).map(([country, group]) => {
            if (!group.length) return null
            return (
              <React.Fragment key={country}>
                <div style={{
                  fontSize: '11px', textTransform: 'uppercase',
                  letterSpacing: '1px', color: '#444',
                  margin: '10px 0 6px',
                }}>
                  {country === 'br' ? 'Brasil' : 'Paraguai'}
                </div>
                {group.map(a => (
                  <label
                    key={a.source}
                    style={{
                      display: 'flex', alignItems: 'center',
                      gap: '8px', padding: '5px 6px',
                      borderRadius: '5px', cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[a.source]}
                      onChange={() => toggleOne(a.source)}
                      style={{ accentColor: '#5a9cf8' }}
                    />
                    <span style={{ color: '#ccc', fontSize: '13px' }}>{a.source}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: '11px',
                      padding: '1px 6px', borderRadius: '10px',
                      fontWeight: '600',
                      ...(country === 'br'
                        ? { background: '#1a3a1a', color: '#4caf50' }
                        : { background: '#1a2a3a', color: '#5a9cf8' }),
                    }}>
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
      <div style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #1e1e1e',
          display: 'flex', alignItems: 'center', gap: '16px',
          background: '#0d0d0d',
        }}>
          <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#888' }}>Results</h3>
          {totalRaw != null && (
            <div style={{
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              borderRadius: '6px', padding: '4px 10px',
              fontSize: '12px', color: '#aaa',
            }}>
              Raw: <strong style={{ color: '#e0e0e0' }}>{totalRaw}</strong>
            </div>
          )}
          {totalFiltered != null && (
            <div style={{
              background: '#1a1a1a', border: '1px solid #2a2a2a',
              borderRadius: '6px', padding: '4px 10px',
              fontSize: '12px', color: '#aaa',
            }}>
              Filtered: <strong style={{ color: '#e0e0e0' }}>{totalFiltered}</strong>
            </div>
          )}
        </div>
        <div style={{
          flex: 1, overflowY: 'auto', padding: '16px 20px',
          display: 'flex', flexDirection: 'column', gap: '12px',
          background: '#0d0d0d',
        }}>
          {error && (
            <div style={{
              background: '#1a0a0a', border: '1px solid #5a1a1a',
              borderRadius: '5px', padding: '8px 10px',
              fontFamily: 'monospace', fontSize: '12px',
              color: '#e55', wordBreak: 'break-all',
            }}>
              {error}
            </div>
          )}
          {!results && !error && (
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', height: '100%',
              color: '#333', fontSize: '16px',
            }}>
              Run a search to see per-adapter debug output
            </div>
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

  const cardBorderColor = adapter.error ? '#5a1a1a' : adapter.filtered_count > 0 ? '#1a3a1a' : '#222'

  return (
    <div style={{
      background: '#111', border: `1px solid ${cardBorderColor}`,
      borderRadius: '8px', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '10px 14px', background: '#151515',
        borderBottom: '1px solid #1e1e1e',
      }}>
        <span style={{ fontWeight: '600', fontSize: '14px', color: '#e0e0e0' }}>
          {adapter.adapter_id}
        </span>
        <span style={{
          fontSize: '11px', padding: '1px 7px', borderRadius: '10px', fontWeight: '600',
          ...(adapter.country === 'br'
            ? { background: '#1a3a1a', color: '#4caf50' }
            : { background: '#1a2a3a', color: '#5a9cf8' }),
        }}>
          {adapter.country.toUpperCase()}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: '12px',
          color: timingClass === 'very-slow' ? '#e55' : timingClass === 'slow' ? '#e5a244' : '#555',
        }}>
          {adapter.timing_ms}ms
        </span>
      </div>
      <div style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#777' }}>
            Raw <strong style={{ fontSize: '15px', color: '#aaa' }}>{adapter.raw_count}</strong>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#777' }}>
            Filtered <strong style={{ fontSize: '15px', color: '#4caf50' }}>{adapter.filtered_count}</strong>
          </span>
        </div>
        {adapter.error && (
          <div style={{
            background: '#1a0a0a', border: '1px solid #5a1a1a',
            borderRadius: '5px', padding: '8px 10px',
            fontFamily: 'monospace', fontSize: '12px',
            color: '#e55', wordBreak: 'break-all', marginBottom: '8px',
          }}>
            {adapter.error}
          </div>
        )}
        {adapter.sample_offers.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {adapter.sample_offers.map((o, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: '10px',
                padding: '5px 8px', background: '#0d0d0d', borderRadius: '5px',
                fontSize: '12px',
              }}>
                <span style={{
                  flex: 1, color: '#bbb',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }} title={o.title}>
                  {o.title}
                </span>
                <span style={{ whiteSpace: 'nowrap', fontWeight: '600', color: '#4caf50' }}>
                  {o.currency} {o.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#5a9cf8', textDecoration: 'none', fontSize: '11px', whiteSpace: 'nowrap' }}
                >
                  &#x2197;
                </a>
              </div>
            ))}
          </div>
        ) : !adapter.error ? (
          <p style={{ color: '#444', fontSize: '13px', fontStyle: 'italic' }}>
            No results passed the filter.
          </p>
        ) : null}
      </div>
    </div>
  )
}
