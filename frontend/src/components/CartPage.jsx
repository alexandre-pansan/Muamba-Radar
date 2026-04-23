import React, { lazy, Suspense, useState, useEffect, Component } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCart } from '../CartContext.jsx'
import { formatMoney } from '../utils.js'
import { getApiBase, apiFetchFxRate } from '../api.js'

const CartMapView = lazy(() => import('./CartMapView.jsx'))

class MapErrorBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return (
      <div className="cart-map-error">Mapa indisponível.</div>
    )
    return this.props.children
  }
}

const SORT_OPTIONS = [
  { value: 'store',      label: 'Loja' },
  { value: 'price_asc',  label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'title',      label: 'Nome' },
]

function formatPrice(amount, currency) {
  if (currency === 'PYG') return `G$ ${Math.round(amount).toLocaleString('pt-BR')}`
  return formatMoney(amount, currency)
}

function cartTotalLabel(items) {
  const t = {}
  for (const i of items) t[i.price_currency] = (t[i.price_currency] || 0) + i.price_amount
  return Object.entries(t).map(([cur, amt]) => formatPrice(amt, cur)).join(' + ')
}

function cartTotalBRL(items, fxRate) {
  if (!fxRate) return null
  let total = 0
  for (const i of items) {
    if (i.price_currency === 'BRL') total += i.price_amount
    else if (i.price_currency === 'USD') total += i.price_amount * fxRate
    // PYG: skip (no reliable rate available)
  }
  return total > 0
    ? `≈ R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null
}

function sortItems(items, sort) {
  return [...items].sort((a, b) => {
    if (sort === 'store')      return a.store_name.localeCompare(b.store_name)
    if (sort === 'price_asc')  return a.price_amount - b.price_amount
    if (sort === 'price_desc') return b.price_amount - a.price_amount
    if (sort === 'title')      return a.title.localeCompare(b.title)
    return 0
  })
}

// Returns ordered unique store names from sorted list → used for pin numbers
function getStoreOrder(sortedItems) {
  const seen = new Set()
  const order = []
  for (const item of sortedItems) {
    if (!seen.has(item.store_name)) { seen.add(item.store_name); order.push(item.store_name) }
  }
  return order
}

function buildGroups(items) {
  const groups = {}
  for (const item of items) {
    const key = item.store_name
    if (!groups[key]) groups[key] = { store_name: key, store: item.store, items: [] }
    groups[key].items.push(item)
  }
  return Object.values(groups)
}

function storePhotoSrc(store) {
  if (!store?.photo_url) return null
  return store.photo_url.startsWith('/static')
    ? `${getApiBase()}${store.photo_url}`
    : store.photo_url
}

function ItemCard({ item, onRemove, picked, onTogglePick, storeNum, dragHandleProps, isDragging }) {
  const photo = storePhotoSrc(item.store)

  return (
    <div className={`ci-card${picked ? ' is-picked' : ''}${isDragging ? ' is-dragging' : ''}`}>
      {/* Drag handle — left strip */}
      <div className="ci-drag-handle" {...dragHandleProps} aria-label="Arrastar para reordenar">
        <svg viewBox="0 0 20 20" width="12" height="12" fill="currentColor">
          <circle cx="7" cy="5"  r="1.5"/><circle cx="13" cy="5"  r="1.5"/>
          <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
          <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
        </svg>
      </div>

      {/* Content */}
      <div className="ci-content">

      {/* Split cover */}
      <div className="ci-cover">
        <div className="ci-cover-product">
          {item.image_url
            ? <img src={item.image_url} alt={item.title} loading="lazy" />
            : <span className="ci-cover-placeholder">📦</span>
          }
        </div>
        <div className="ci-cover-store">
          {photo
            ? <img src={photo} alt={item.store_name} loading="lazy" />
            : <span className="ci-cover-placeholder">🏪</span>
          }
        </div>
      </div>

      {/* Body */}
      <div className="ci-body">
        <a className="ci-title" href={item.offer_url} target="_blank" rel="noopener noreferrer">
          {item.title}
        </a>
        <span className="ci-price">
          {formatPrice(item.price_amount, item.price_currency)}
          <span className="ci-country">{item.country.toUpperCase()}</span>
        </span>
        <span className="ci-store">
          {storeNum != null && <span className="ci-store-num">{storeNum}</span>}
          {item.store_name}
        </span>
      </div>

      {/* Footer row: checkbox + remove */}
      <div className="ci-footer">
        <button
          className={`ci-pick-btn${picked ? ' is-picked' : ''}`}
          onClick={() => onTogglePick(item.id)}
          aria-label={picked ? 'Desmarcar como pego' : 'Marcar como pego'}
          title={picked ? 'Desmarcar' : 'Já peguei este item'}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {picked ? 'Pego' : 'Marcar como pego'}
        </button>

        <button className="ci-remove" onClick={() => onRemove(item.id)} aria-label="Remover">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      </div>{/* end ci-content */}
    </div>
  )
}

function SortableCard(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <ItemCard {...props} dragHandleProps={{ ...attributes, ...listeners }} isDragging={isDragging} />
    </div>
  )
}

export default function CartPage({ onBack, onOpenImportCalc }) {
  const { items, loading, remove, clear } = useCart()
  const [sort, setSort]                   = useState('store')
  const [manualOrder, setManualOrder]     = useState(null)  // null = use sort; array of IDs = custom
  const [confirmClear, setConfirmClear]   = useState(false)
  const [pickedIds, setPickedIds]         = useState(new Set())
  const [fxRate, setFxRate]               = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 6 },
  }))

  useEffect(() => {
    apiFetchFxRate().then(r => { if (r) setFxRate(r) })
  }, [])

  // When items change (remove), keep manualOrder in sync
  useEffect(() => {
    if (!manualOrder) return
    const ids = new Set(items.map(i => i.id))
    setManualOrder(prev => prev.filter(id => ids.has(id)))
  }, [items]) // eslint-disable-line react-hooks/exhaustive-deps

  const autoSorted = sortItems(items, sort)
  const sorted = manualOrder
    ? manualOrder.map(id => items.find(i => i.id === id)).filter(Boolean)
    : autoSorted
  const storeOrder = getStoreOrder(sorted)
  const groups     = buildGroups(items)

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const ids = sorted.map(i => i.id)
    const oldIndex = ids.indexOf(active.id)
    const newIndex = ids.indexOf(over.id)
    setManualOrder(arrayMove(ids, oldIndex, newIndex))
  }

  function resetSort(value) {
    setSort(value)
    setManualOrder(null)
  }

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return }
    clear()
    setConfirmClear(false)
  }

  function togglePick(id) {
    setPickedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="cart-page">
      {/* ── Header ── */}
      <div className="cart-page-header">
        <h1 className="cart-page-title">
          Lista de compras
          {items.length > 0 && <span className="cart-page-count">{items.length}</span>}
        </h1>

        <div className="cart-page-actions">
          <div className="cart-sort-chips">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                className={`cart-sort-chip${sort === opt.value && !manualOrder ? ' is-active' : ''}`}
                onClick={() => resetSort(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            {manualOrder && (
              <button className="cart-sort-chip is-manual" onClick={() => setManualOrder(null)} title="Resetar para ordem automática">
                Personalizado ×
              </button>
            )}
          </div>
          {items.length > 0 && (
            <button
              className={`cart-clear-btn${confirmClear ? ' is-confirm' : ''}`}
              onClick={handleClear}
              onBlur={() => setConfirmClear(false)}
            >
              {confirmClear ? 'Confirmar?' : 'Limpar'}
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="cart-body">

        {/* Cards column */}
        <div className="cart-cards-col">

          {/* Back button at top of list */}
          <button className="cart-back-btn" onClick={onBack} aria-label="Voltar à busca">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            <span>Voltar à busca</span>
          </button>

          {loading && <div className="cart-loading">Carregando...</div>}

          {!loading && items.length === 0 && (
            <div className="cart-empty">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="cart-empty-icon">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              <p>Sua lista está vazia.</p>
              <p className="cart-empty-hint">Clique no ❤ de um produto para salvar.</p>
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sorted.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="ci-grid">
                  {sorted.map(item => (
                    <SortableCard
                      key={item.id}
                      item={item}
                      onRemove={remove}
                      picked={pickedIds.has(item.id)}
                      onTogglePick={togglePick}
                      storeNum={storeOrder.indexOf(item.store_name) + 1}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Total — sticky footer */}
          {!loading && items.length > 0 && (
            <div className="cart-col-total">
              <span className="cart-col-total-label">TOTAL ESTIMADO</span>
              {onOpenImportCalc && (
                <button
                  className="cart-import-calc-btn"
                  onClick={() => {
                    let total = 0
                    for (const i of items) {
                      if (i.price_currency === 'USD') total += i.price_amount
                      else if (i.price_currency === 'BRL' && fxRate) total += i.price_amount / fxRate
                    }
                    onOpenImportCalc(total > 0 ? total : undefined)
                  }}
                  title="Calcular imposto de declaração"
                >
                  🧾 Calcular imposto
                </button>
              )}
              {cartTotalBRL(items, fxRate) ? (
                <>
                  <span className="cart-col-total-brl-main">{cartTotalBRL(items, fxRate)}</span>
                  <div className="cart-col-total-secondary">
                    <span className="cart-col-total-usd">{cartTotalLabel(items)}</span>
                    <span className="cart-col-total-disclaimer">cotação aprox., valor no local pode variar</span>
                  </div>
                </>
              ) : (
                <span className="cart-col-total-brl-main">{cartTotalLabel(items)}</span>
              )}
            </div>
          )}
        </div>

        {/* Map column */}
        <div className="cart-map-col">
          <MapErrorBoundary>
            <Suspense fallback={<div className="cart-map-loading">Carregando mapa...</div>}>
              <CartMapView groups={groups} pickedIds={pickedIds} storeOrder={storeOrder} />
            </Suspense>
          </MapErrorBoundary>
        </div>

      </div>
    </div>
  )
}
