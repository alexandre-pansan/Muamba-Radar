import React, { useEffect, useRef, useState } from 'react'
import { mergeRates } from '../taxRates.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

// Compound-interest multiplier: total = P * installmentMultiplier(n, r)
function installmentMultiplier(n, r) {
  if (n === 1 || r === 0) return 1
  const factor = Math.pow(1 + r, n)
  return n * r * factor / (factor - 1)
}

const CREDIT_LABELS = { 'na-hora': 'Na hora', '14-dias': '14 dias', '30-dias': '30 dias' }

function fmt(v) {
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function pct(f) { return (f * 100).toFixed(2).replace('.', ',') + '%' }
function ceil(v) { return Math.ceil(v * 100) / 100 }

function calcFee(amount, fee, mode) {
  if (mode === 'charge') return { customer: amount, merchant: amount * (1 - fee) }
  return { customer: amount / (1 - fee), merchant: amount }
}
function calcBoleto(amount, fixed, mode) {
  if (mode === 'charge') return { customer: amount, merchant: amount - fixed }
  return { customer: amount + fixed, merchant: amount }
}

// ── UI pieces ─────────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '14px 0 6px' }}>
      {children}
    </div>
  )
}

function Block({ accent, header, children }) {
  return (
    <div style={{ background: 'var(--card-bg)', border: `1px solid var(--line)`, borderRadius: 10, overflow: 'hidden', marginBottom: 8, borderLeft: accent ? `3px solid ${accent}` : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderBottom: children ? '1px solid var(--line)' : 'none' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>{header.title}</span>
        {header.badge && <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--muted)', padding: '2px 8px', borderRadius: 20 }}>{header.badge}</span>}
      </div>
      {children}
    </div>
  )
}

function Row({ label, sub, right, receive, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{right}</div>
        {receive && <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600, marginTop: 1 }}>{receive}</div>}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const DEFAULT_POS = () => ({ x: Math.max(20, window.innerWidth - 520), y: 80 })

export default function TaxCalculator({ open, onClose, savedRates }) {
  const [pos, setPos]               = useState(DEFAULT_POS)
  const [minimized, setMinimized]   = useState(false)
  const [amount, setAmount]         = useState('')
  const [mode, setMode]             = useState('charge')
  const [creditTiming, setCreditTiming] = useState('na-hora')

  const dragging = useRef(false)
  const origin   = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const rates = mergeRates(savedRates)

  // Drag handlers
  useEffect(() => {
    function onMove(e) {
      if (!dragging.current) return
      setPos({
        x: origin.current.px + e.clientX - origin.current.mx,
        y: origin.current.py + e.clientY - origin.current.my,
      })
    }
    function onUp() { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  function startDrag(e) {
    if (e.button !== 0) return
    dragging.current = true
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    e.preventDefault()
  }

  if (!open) return null

  const value = parseFloat(amount)
  const hasValue = value > 0

  const cFee = rates[{ 'na-hora': 'credit_na_hora', '14-dias': 'credit_14d', '30-dias': 'credit_30d' }[creditTiming]]

  const creditRows = hasValue ? [1,2,3,4,5,6,7,8,9,10,11,12].map(n => {
    const merchantReceive = mode === 'charge' ? value * (1 - cFee) : value
    const baseCustomer    = mode === 'charge' ? value : value / (1 - cFee)
    const instRate        = n === 1 ? 0 : (rates[`installment_${n}x`] ?? 0)
    const total           = ceil(baseCustomer * installmentMultiplier(n, instRate))
    const perInstallment  = ceil(total / n)
    const extra           = ceil(total - baseCustomer)
    const subParts        = [`${pct(cFee)} taxa`]
    if (n > 1) subParts.push(`${pct(instRate)} a.m.`, `Total: ${fmt(total)}`, `Acréscimo: ${fmt(extra)}`)
    return { n, label: n === 1 ? 'À vista' : `${n}x`, sub: subParts.join(' · '), right: n === 1 ? fmt(perInstallment) : `${n}x ${fmt(perInstallment)}`, receive: `Você recebe: ${fmt(merchantReceive)}` }
  }) : []

  const otherMethods = [
    { key: 'pix',   name: '⚡ Pix',               accent: 'var(--success)', fee: rates.pix,           timing: 'Na hora' },
    { key: 'of',    name: '🏦 Open Finance',       accent: 'var(--info)',    fee: rates.open_finance,  timing: 'Na hora' },
    { key: 'mp',    name: '💛 Carteira Digital',    accent: null,      fee: rates.mp_saldo,      timing: 'Na hora' },
    { key: 'pre',   name: '💳 Cartão Pré-pago',    accent: null,      fee: rates.prepago,       timing: 'Na hora' },
    { key: 'lc',    name: '📋 Linha de Crédito',   accent: null,      fee: rates.linha_credito, timing: 'Na hora' },
    { key: 'bolt',  name: '🎫 Boleto',             accent: null,      fixed: rates.boleto_fixed, timing: '3 dias' },
  ]

  return (
    <div className="tax-calc-panel" style={{
      position: 'fixed', left: pos.x, top: pos.y, width: 'min(440px, calc(100vw - 32px))',
      background: 'var(--card)', border: '1px solid var(--line)',
      borderRadius: 12, boxShadow: 'var(--shadow-lg)',
      zIndex: 500, display: 'flex', flexDirection: 'column',
      maxHeight: 'calc(100vh - 100px)', overflow: 'hidden',
      userSelect: dragging.current ? 'none' : 'auto',
    }}>
      {/* Draggable header */}
      <div
        onMouseDown={startDrag}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'grab', background: 'var(--card)', borderBottom: minimized ? 'none' : '1px solid var(--line)', flexShrink: 0, userSelect: 'none' }}
      >
        <span style={{ fontSize: 16 }}>💰</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', flex: 1 }}>Calculadora de Taxas</span>
        <button onClick={() => setMinimized(m => !m)} aria-label={minimized ? 'Expandir calculadora' : 'Minimizar calculadora'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>
          {minimized ? '□' : '—'}
        </button>
        <button onClick={onClose} aria-label="Fechar calculadora" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
      </div>

      {!minimized && (
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 14px' }}>
          {/* Amount input */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Valor</div>
            <div className="tax-input-wrap" style={{ display: 'flex', alignItems: 'center', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--muted)', marginRight: 6 }}>R$</span>
              <input
                type="number" placeholder="0,00" step="0.01" min="0"
                value={amount} onChange={e => setAmount(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: 22, fontWeight: 800, width: '100%', background: 'transparent', color: 'var(--ink)' }}
              />
            </div>
            <div style={{ display: 'flex', background: 'var(--card)', borderRadius: 8, padding: 3, marginTop: 10 }}>
              {[['charge','Vou cobrar'],['receive','Quero receber']].map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex: 1, padding: '7px 6px', border: 'none', borderRadius: 6, fontSize: 12,
                  fontWeight: mode === m ? 700 : 500, cursor: 'pointer',
                  background: mode === m ? 'var(--card-bg)' : 'transparent',
                  color: mode === m ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                  transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {!hasValue ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '30px 0', fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🧮</div>
              Digite um valor para ver as opções
            </div>
          ) : (
            <>
              <SectionLabel>💳 Cartão de Crédito</SectionLabel>
              <Block accent="#a78bfa" header={{ title: '💳 Cartão de Crédito', badge: `Receber: ${CREDIT_LABELS[creditTiming]}` }}>
                <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
                  {[['na-hora','Na hora — 4,98%'],['14-dias','14d — 4,49%'],['30-dias','30d — 3,98%']].map(([t, label]) => (
                    <button key={t} onClick={() => setCreditTiming(t)} style={{
                      padding: '4px 10px', border: `1.5px solid ${creditTiming === t ? 'var(--accent)' : 'var(--line)'}`,
                      borderRadius: 20, background: creditTiming === t ? 'var(--accent)' : 'transparent',
                      color: creditTiming === t ? 'var(--ink-on-accent, #fff)' : 'var(--muted)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    }}>{label}</button>
                  ))}
                </div>
                {creditRows.map((row, i) => (
                  <Row key={row.n} label={row.label} sub={row.sub} right={row.right} receive={row.receive} last={i === creditRows.length - 1} />
                ))}
              </Block>

              <SectionLabel>💸 Outros métodos</SectionLabel>
              {otherMethods.map((m, i) => {
                let right, receive, badge
                if (m.fixed != null) {
                  const r = calcBoleto(value, m.fixed, mode)
                  right   = fmt(r.customer)
                  receive = `Você recebe: ${fmt(r.merchant)}`
                  badge   = `${m.timing} · R$ ${m.fixed.toFixed(2).replace('.', ',')} fixo`
                } else {
                  const r = calcFee(value, m.fee, mode)
                  right   = fmt(r.customer)
                  receive = `Você recebe: ${fmt(r.merchant)}`
                  badge   = `${m.timing} · ${m.fee === 0 ? 'Sem taxa' : pct(m.fee)}`
                }
                return (
                  <Block key={m.key} accent={m.accent} header={{ title: m.name, badge }}>
                    <Row label="Valor cobrado" right={right} receive={receive} last />
                  </Block>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
