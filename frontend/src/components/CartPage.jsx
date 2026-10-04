import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../CartContext.jsx'
import { formatMoney } from '../utils.js'
import { apiFetchFxRate } from '../api.js'
import CartCouponsModal from './CartCouponsModal.jsx'
import { useFeatures } from '../features.js'
import ProductImage from './ui/ProductImage.jsx'
import { ListSwitcher } from './ShoppingLists.jsx'

// Regras da cota de isenção (Receita Federal): por pessoa, 50% de imposto sobre o
// que passar. Mesmos números do ImportDutyCalculator.
const TAX_RULES = {
  terrestre: {
    quota: 500,
    rate: 0.5,
    icon: '🚗',
    label: 'Via Terrestre (Carro/Pessoa)',
    description: 'Cota de US$ 500 por pessoa. 50% de Imposto de Importação sobre o excedente.',
  },
  aereo: {
    quota: 1000,
    rate: 0.5,
    icon: '✈️',
    label: 'Via Aérea',
    description: 'Cota de US$ 1.000 por pessoa. 50% de Imposto de Importação sobre o excedente.',
  },
}

const SPEC_LABEL = {
  storage: v => v.toUpperCase(),
  ram: v => `${v.toUpperCase()} RAM`,
  color: v => v.charAt(0).toUpperCase() + v.slice(1),
  volume_ml: v => v.toUpperCase(),
  voltage: v => v,
  perfume_concentration: v => v.toUpperCase(),
  screen_size: v => v,
}

// Preferências da simulação ficam só neste navegador.
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* modo privado */ }
  }, [key, value])
  return [value, setValue]
}

/** Preço unitário do item em USD (itens em BRL são convertidos; PYG fica de fora). */
function unitUSD(item, fxRate) {
  if (item.price_currency === 'USD') return item.price_amount
  if (item.price_currency === 'BRL' && fxRate) return item.price_amount / fxRate
  return null
}

function CartItem({ item, fxRate, onQuantity, onRemove }) {
  const usd = unitUSD(item, fxRate)
  const pyBRL = usd != null && fxRate ? usd * fxRate : null
  const economy = pyBRL && item.br_price_brl
    ? Math.round(((item.br_price_brl - pyBRL) / item.br_price_brl) * 100)
    : null
  const specs = Object.entries(item.specs || {})
    .filter(([k]) => SPEC_LABEL[k])
    .map(([k, v]) => SPEC_LABEL[k](String(v)))
  const quantity = item.quantity || 1
  const flag = item.country === 'br' ? '🇧🇷' : '🇵🇾'

  return (
    <div className="cart-item">
      <div className="cart-item__image">
        <ProductImage src={item.image_url} title={item.title} />
      </div>

      <div className="cart-item__info">
        <a className="cart-item__name" href={item.offer_url} target="_blank" rel="noopener noreferrer" title={item.title}>
          {item.title}
        </a>
        <p className="cart-item__store">{flag} {item.store_name}</p>
        {specs.length > 0 && (
          <div className="cart-item__specs">
            {specs.map(s => <span key={s} className="cart-item__spec">{s}</span>)}
          </div>
        )}
      </div>

      <div className="cart-item__prices">
        <div className="cart-item__price-py">{flag} {formatMoney(item.price_amount, item.price_currency)}</div>
        {item.br_price_brl ? (
          <a
            className="cart-item__price-br"
            href={item.br_url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            title={`Menor preço no Brasil quando você adicionou${item.br_store ? ` (${item.br_store})` : ''}`}
          >
            🇧🇷 {formatMoney(item.br_price_brl, 'BRL')}
          </a>
        ) : (
          <div className="cart-item__price-br is-missing" title="Sem preço no Brasil para comparar">🇧🇷 —</div>
        )}
        {economy != null && (
          <div className={`cart-item__economy${economy < 0 ? ' is-negative' : ''}`}>
            {economy > 0 ? `-${economy}%` : `+${Math.abs(economy)}%`}
          </div>
        )}
      </div>

      <div className="cart-item__quantity" role="group" aria-label="Quantidade">
        <button type="button" className="qty-btn" onClick={() => onQuantity(item.id, quantity - 1)} disabled={quantity <= 1} aria-label="Diminuir quantidade">−</button>
        <span className="qty-value" aria-live="polite">{quantity}</span>
        <button type="button" className="qty-btn" onClick={() => onQuantity(item.id, quantity + 1)} disabled={quantity >= 99} aria-label="Aumentar quantidade">+</button>
      </div>

      <button type="button" className="cart-item__remove" onClick={() => onRemove(item.id)} aria-label="Remover do carrinho">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  )
}

export default function CartPage({ onNeedAuth }) {
  const navigate = useNavigate()
  const { items, loading, remove, clear, setQuantity, loggedIn } = useCart()
  const { coupons: couponsEnabled } = useFeatures()
  const [fxRate, setFxRate] = useState(null)
  const [couponsOpen, setCouponsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [people, setPeople] = usePersisted('muamba_cart_people', 1)
  const [mode, setMode] = usePersisted('muamba_cart_tax_mode', 'terrestre')

  useEffect(() => {
    apiFetchFxRate().then(r => { if (r) setFxRate(r) })
  }, [])

  const rule = TAX_RULES[mode] || TAX_RULES.terrestre
  const quota = rule.quota * people
  const subtotalUSD = items.reduce((sum, i) => sum + (unitUSD(i, fxRate) ?? 0) * (i.quantity || 1), 0)
  const subtotalBRL = fxRate ? subtotalUSD * fxRate : null
  const taxableUSD = Math.max(0, subtotalUSD - quota)
  const taxBRL = fxRate ? taxableUSD * rule.rate * fxRate : null
  const totalBRL = subtotalBRL != null ? subtotalBRL + taxBRL : null
  const hasPYG = items.some(i => i.price_currency === 'PYG')
  const brl = v => (v == null ? '—' : formatMoney(v, 'BRL'))

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return }
    clear()
    setConfirmClear(false)
  }

  return (
    <div className="cart-page">
      <h1 className="page-title">🛒 Meu Carrinho</h1>
      <ListSwitcher />

      <div className="cart-layout">
        <div className="cart-items">
          {loading && <div className="cart-loading">Carregando...</div>}

          {!loading && !loggedIn && (
            <div className="cart-empty-state">
              <div className="cart-empty-state__icon">🔐</div>
              <h3 className="cart-empty-state__title">Entre para usar o carrinho</h3>
              <p className="cart-empty-state__text">O carrinho fica salvo na sua conta e acompanha você em qualquer aparelho.</p>
              <button type="button" className="cart-primary-btn" onClick={onNeedAuth}>Entrar / Criar conta</button>
            </div>
          )}

          {!loading && loggedIn && items.length === 0 && (
            <div className="cart-empty-state">
              <div className="cart-empty-state__icon">🛒</div>
              <h3 className="cart-empty-state__title">Seu carrinho está vazio</h3>
              <p className="cart-empty-state__text">Adicione produtos para comparar preços e calcular impostos</p>
              <button type="button" className="cart-primary-btn" onClick={() => navigate('/')}>Explorar Produtos</button>
            </div>
          )}

          {!loading && items.map(item => (
            <CartItem key={item.id} item={item} fxRate={fxRate} onQuantity={setQuantity} onRemove={remove} />
          ))}

          {!loading && items.length > 0 && (
            <button
              type="button"
              className={`cart-clear-link${confirmClear ? ' is-confirm' : ''}`}
              onClick={handleClear}
              onBlur={() => setConfirmClear(false)}
            >
              {confirmClear ? 'Clique de novo para esvaziar o carrinho' : 'Esvaziar carrinho'}
            </button>
          )}
        </div>

        <aside className="cart-summary">
          <h3 className="cart-summary__title">Resumo da Compra</h3>

          <div className="people-counter">
            <div>
              <div className="people-counter__label">Número de Pessoas</div>
              <div className="people-counter__sublabel">Cota total: US$ {quota.toLocaleString('pt-BR')}</div>
            </div>
            <div className="people-counter__controls" role="group" aria-label="Número de pessoas">
              <button type="button" className="people-counter__btn" onClick={() => setPeople(p => Math.max(1, p - 1))} disabled={people <= 1} aria-label="Diminuir número de pessoas">−</button>
              <span className="people-counter__value" aria-live="polite">{people}</span>
              <button type="button" className="people-counter__btn" onClick={() => setPeople(p => Math.min(20, p + 1))} aria-label="Aumentar número de pessoas">+</button>
            </div>
          </div>

          <div className="tax-toggle" role="group" aria-label="Modal de transporte">
            {Object.entries(TAX_RULES).map(([key, r]) => (
              <button
                key={key}
                type="button"
                className={`tax-toggle__btn${mode === key ? ' active' : ''}`}
                onClick={() => setMode(key)}
              >
                {r.icon} {key === 'terrestre' ? 'Terrestre' : 'Aéreo'}
              </button>
            ))}
          </div>

          <div className="cart-summary__rows">
            <div className="summary-row"><span>Subtotal (USD)</span><span>{formatMoney(subtotalUSD, 'USD')}</span></div>
            <div className="summary-row"><span>Cotação</span><span>{fxRate ? `USD 1,00 = ${formatMoney(fxRate, 'BRL')}` : '—'}</span></div>
            <div className="summary-row"><span>Subtotal (BRL)</span><span>{brl(subtotalBRL)}</span></div>
            <div className="summary-row summary-row--divider" />
            <div className="summary-row"><span>Cota permitida</span><span>{formatMoney(quota, 'USD')}</span></div>
            <div className="summary-row"><span>Valor tributável</span><span>{formatMoney(taxableUSD, 'USD')}</span></div>
            <div className="summary-row"><span>Taxa de importação</span><span>{brl(taxBRL)}</span></div>
            <div className="summary-row summary-row--divider" />
            <div className="summary-row summary-row--total"><span>Total final (BRL)</span><span>{brl(totalBRL)}</span></div>
          </div>

          {hasPYG && (
            <p className="cart-summary__note">Itens em guarani (G$) ficam fora da soma — sem cotação confiável.</p>
          )}

          {couponsEnabled && items.length > 0 && (
            <button type="button" className="cart-coupons-cta" onClick={() => setCouponsOpen(true)}>
              🎟️ Gerar Cupons do Carrinho
            </button>
          )}

          <div className="tax-info">
            <p>{rule.icon} <strong>{rule.label}:</strong> {rule.description} ({people} pessoa{people > 1 ? 's' : ''})</p>
          </div>

          <button
            type="button"
            className="cart-primary-btn cart-primary-btn--lg"
            onClick={() => navigate('/map')}
            disabled={items.length === 0}
          >
            📍 Ver Rota das Lojas
          </button>
        </aside>
      </div>

      {couponsEnabled && <CartCouponsModal open={couponsOpen} onClose={() => setCouponsOpen(false)} />}
    </div>
  )
}
