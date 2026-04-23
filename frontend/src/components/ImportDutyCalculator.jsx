import React, { useState, useEffect, useRef } from 'react'
import { apiFetchFxRate } from '../api.js'

const EXEMPTIONS = {
  bridge: { label: 'Ponte da Amizade', sublabel: 'fronteira terrestre', limit: 500 },
  air:    { label: 'Viagem Aérea',     sublabel: 'via aérea',           limit: 1000 },
}

function fmtUSD(v) {
  return `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtBRL(v) {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function ImportDutyCalculator({ open, onClose, initialUSD }) {
  const dialogRef = useRef(null)
  const [totalUSD, setTotalUSD] = useState('')
  const [entryType, setEntryType] = useState('bridge')
  const [people, setPeople] = useState(1)
  const [fxRate, setFxRate] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      if (initialUSD != null) setTotalUSD(initialUSD.toFixed(2))
      apiFetchFxRate().then(r => { if (r) setFxRate(r) })
    } else if (!open && dialog.open) {
      dialog.close()
      setTotalUSD('')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleBackdropClick(e) {
    if (e.target === dialogRef.current) onClose()
  }

  const val = parseFloat(String(totalUSD).replace(',', '.')) || 0
  const { limit, sublabel } = EXEMPTIONS[entryType]
  const totalExemption = limit * people
  const excess = Math.max(0, val - totalExemption)
  const tax = excess * 0.5
  const isExempt = val > 0 && excess === 0

  return (
    <dialog
      ref={dialogRef}
      className="modal modal-sm"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="modal-header">
        <span className="modal-title">Calculadora de Declaração</span>
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>&times;</button>
      </div>

      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Entry type */}
        <div>
          <div className="ucm-subsection-label" style={{ marginTop: 0 }}>Tipo de entrada</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(EXEMPTIONS).map(([key, { label, limit }]) => (
              <button
                key={key}
                type="button"
                className={`cart-sort-chip${entryType === key ? ' is-active' : ''}`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 10px' }}
                onClick={() => setEntryType(key)}
              >
                <span>{label}</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>até US$ {limit}</span>
              </button>
            ))}
          </div>
        </div>

        {/* People */}
        <div>
          <div className="ucm-subsection-label">Pessoas na viagem</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 32, height: 32 }}
              onClick={() => setPeople(p => Math.max(1, p - 1))}
            >−</button>
            <span style={{ fontWeight: 700, fontSize: 16, minWidth: 24, textAlign: 'center', color: 'var(--ink)' }}>{people}</span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 32, height: 32 }}
              onClick={() => setPeople(p => p + 1)}
            >+</button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              cota total: <strong style={{ color: 'var(--ink)' }}>{fmtUSD(totalExemption)}</strong>
            </span>
          </div>
        </div>

        {/* Value input */}
        <div>
          <div className="ucm-subsection-label">Valor total da compra</div>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            <span style={{ padding: '0 10px', color: 'var(--muted)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>US$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalUSD}
              onChange={e => setTotalUSD(e.target.value)}
              placeholder="0,00"
              style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 10px 10px 0', fontSize: 15, fontWeight: 600, color: 'var(--ink)', outline: 'none', width: 0 }}
            />
          </div>
        </div>

        {/* Result */}
        {val > 0 && (
          <div style={{
            background: isExempt ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${isExempt ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            borderRadius: 10,
            padding: '14px 16px',
          }}>
            {isExempt ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>✅</div>
                <div style={{ fontWeight: 700, color: '#16a34a', fontSize: 14 }}>Dentro da cota — sem imposto</div>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Você não precisa declarar esta compra.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Cota de isenção</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{fmtUSD(totalExemption)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Valor excedente</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>{fmtUSD(excess)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Imposto a pagar <span style={{ opacity: 0.7 }}>(50%)</span></span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#ef4444' }}>{fmtUSD(tax)}</div>
                    {fxRate && (
                      <div style={{ fontSize: 11, color: '#ef4444', opacity: 0.8 }}>{fmtBRL(tax * fxRate)}</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
          Isenção de US$ {limit}/pessoa pela {sublabel}. Excedente sujeito a 50% de Imposto de Importação.
        </div>
      </div>
    </dialog>
  )
}
