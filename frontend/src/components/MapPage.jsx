import React, { lazy, Suspense, useEffect, useMemo, useState, Component } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCart } from '../CartContext.jsx'
import { buildGroups, nearestNeighborOrder, routeColor, totalRouteDistanceKm } from '../cartGrouping.js'
import { apiWalkingRoute } from '../api.js'

const CartMapView = lazy(() => import('./CartMapView.jsx'))

class MapErrorBoundary extends Component {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() {
    if (this.state.error) return <div className="cart-map-error">Mapa indisponível.</div>
    return this.props.children
  }
}

// Ciudad del Este center — same fallback CartMapView itself uses, real coordinate.
const CDE = [-25.5163, -54.6132]

// Ritmo de caminhada usado só pra estimar — a distância é em linha reta entre as lojas,
// então o tempo real a pé tende a ser um pouco maior. A UI diz isso.
const WALK_KMH = 4.5

function StoreRow({ group, index, total, onMove, dragHandleProps, isDragging }) {
  const products = group.items
    .map(item => (item.title.length > 48 ? item.title.slice(0, 48) + '…' : item.title))
    .join(' · ')
  return (
    <div className={`store-route-item${isDragging ? ' is-dragging' : ''}`}>
      <span className="store-route-item__number" style={{ background: routeColor(index) }}>{index + 1}</span>
      <div className="store-route-item__info">
        <h4 className="store-route-item__name">{group.store_name}</h4>
        {group.store?.address && <p className="store-route-item__address">{group.store.address}</p>}
        {group.store?.lat == null && (
          <p className="store-route-item__address">Localização ainda não cadastrada — fora do mapa.</p>
        )}
        <p className="store-route-item__products">{products}</p>
      </div>
      <div className="store-route-item__actions">
        <button
          type="button"
          className="store-route-item__btn"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          title="Subir"
          aria-label={`Subir ${group.store_name}`}
        >▲</button>
        <span className="store-route-item__drag" {...dragHandleProps} aria-label="Arrastar para reordenar" title="Arrastar">
          <svg viewBox="0 0 20 20" width="12" height="12" fill="currentColor">
            <circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="5" r="1.5"/>
            <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
            <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
          </svg>
        </span>
        <button
          type="button"
          className="store-route-item__btn"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          title="Descer"
          aria-label={`Descer ${group.store_name}`}
        >▼</button>
      </div>
    </div>
  )
}

function SortableStoreRow(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.group.store_name })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <StoreRow {...props} dragHandleProps={{ ...attributes, ...listeners }} isDragging={isDragging} />
    </div>
  )
}

export default function MapPage() {
  const navigate = useNavigate()
  const { items } = useCart()
  // Modo e ordem customizada ficam na URL (?rota=customizada&ordem=Loja+A&ordem=Loja+B):
  // recarregar a página mantém a rota montada.
  const [params, setParams] = useSearchParams()
  const urlOrder = params.getAll('ordem')
  const customOrder = urlOrder.length ? urlOrder : null
  const mode = params.get('rota') === 'customizada' && customOrder ? 'custom' : 'recommended'
  function setRoute(nextMode, names) {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('rota')
      next.delete('ordem')
      if (nextMode === 'custom') {
        next.set('rota', 'customizada')
        ;(names || customOrder || []).forEach(n => next.append('ordem', n))
      } else if (names === undefined && customOrder) {
        // volta pra recomendada mas guarda a customizada pro botão "Customizada"
        customOrder.forEach(n => next.append('ordem', n))
      }
      return next
    }, { replace: true })
  }
  const setMode = m => setRoute(m)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const baseGroups = useMemo(() => buildGroups(items), [items])
  const hasCoords = g => g.store?.lat != null && g.store?.lng != null

  // Caminho a pé pelas ruas (OSRM local, via backend). Recomendada: o roteador escolhe
  // a melhor ordem. Customizada: segue a ordem do usuário. Se o roteador estiver fora,
  // `street` fica indisponível e tudo cai na linha reta + estimativa de antes.
  const [street, setStreet] = useState(null) // { key, available, order, geometry, distance_m, duration_s }

  const requestGroups = useMemo(() => {
    if (mode === 'custom' && customOrder) {
      const byName = new Map(baseGroups.map(g => [g.store_name, g]))
      return customOrder.map(name => byName.get(name)).filter(g => g && hasCoords(g))
    }
    return baseGroups.filter(hasCoords)
  }, [mode, customOrder, baseGroups])
  const optimize = !(mode === 'custom' && customOrder)
  const requestKey = `${optimize ? 'opt' : 'fix'}:${requestGroups.map(g => g.store_name).join('|')}`

  useEffect(() => {
    if (requestGroups.length < 2) { setStreet(null); return }
    let cancelled = false
    apiWalkingRoute(requestGroups.map(g => [g.store.lat, g.store.lng]), optimize).then(res => {
      if (!cancelled) setStreet({ key: requestKey, ...res })
    })
    return () => { cancelled = true }
  }, [requestKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const streetOk = street?.key === requestKey && street.available

  const recommendedGroups = useMemo(() => {
    if (optimize && streetOk) {
      const ordered = street.order.map(i => requestGroups[i])
      return [...ordered, ...baseGroups.filter(g => !hasCoords(g))]
    }
    return nearestNeighborOrder(baseGroups, CDE)
  }, [optimize, streetOk, street, requestGroups, baseGroups])

  const orderedGroups = useMemo(() => {
    if (mode === 'custom' && customOrder) {
      const byName = new Map(baseGroups.map(g => [g.store_name, g]))
      return customOrder.map(name => byName.get(name)).filter(Boolean)
    }
    return recommendedGroups
  }, [mode, customOrder, baseGroups, recommendedGroups])

  const storeOrder = orderedGroups.map(g => g.store_name)
  const distanceKm = streetOk ? street.distance_m / 1000 : totalRouteDistanceKm(orderedGroups, CDE)
  const walkMin = streetOk ? Math.round(street.duration_s / 60) : Math.round((distanceKm / WALK_KMH) * 60)

  function applyCustom(names) {
    setRoute('custom', names)
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const names = orderedGroups.map(g => g.store_name)
    applyCustom(arrayMove(names, names.indexOf(active.id), names.indexOf(over.id)))
  }

  function handleMove(index, direction) {
    const target = index + direction
    if (target < 0 || target >= orderedGroups.length) return
    applyCustom(arrayMove(orderedGroups.map(g => g.store_name), index, target))
  }

  function setRecommended() {
    setRoute('recommended', null)
  }

  return (
    <div className="map-page">
      <h1 className="page-title">📍 Rota das Lojas</h1>

      <div className="map-layout">
        <div className="map-container">
          <MapErrorBoundary>
            <Suspense fallback={<div className="cart-map-loading">Carregando mapa...</div>}>
              <CartMapView
                groups={orderedGroups}
                pickedIds={new Set()}
                storeOrder={storeOrder}
                showRoute
                showLabels
                routeGeometry={streetOk ? street.geometry : null}
              />
            </Suspense>
          </MapErrorBoundary>
        </div>

        <aside className="store-panel">
          <div className="store-panel__header">
            <h3 className="store-panel__title">Sua Rota</h3>
            <div className="map-mode-toggle">
              <button
                type="button"
                className={`map-mode-btn${mode === 'recommended' ? ' is-active' : ''}`}
                onClick={setRecommended}
              >
                Rota Recomendada
              </button>
              <button
                type="button"
                className={`map-mode-btn${mode === 'custom' ? ' is-active' : ''}`}
                onClick={() => setMode('custom')}
                disabled={!customOrder}
                title={!customOrder ? 'Reordene uma loja abaixo para customizar' : ''}
              >
                Customizada
              </button>
            </div>
          </div>

          {orderedGroups.length === 0 ? (
            <div className="map-page-empty">
              <div className="map-page-empty__icon">📍</div>
              <h4>Nenhuma loja na rota</h4>
              <p>Adicione produtos ao carrinho para ver a rota.</p>
            </div>
          ) : (
            <>
              <div className="route-info">
                <div className="route-info__item">
                  <span className="route-info__label">{streetOk ? 'Distância a pé' : 'Distância total'}</span>
                  <span className="route-info__value">≈ {distanceKm.toFixed(1)} km</span>
                </div>
                <div className="route-info__item">
                  <span className="route-info__label">{streetOk ? 'Caminhando' : 'A pé (estimado)'}</span>
                  <span className="route-info__value">≈ {walkMin} min</span>
                </div>
                <div className="route-info__item">
                  <span className="route-info__label">Lojas</span>
                  <span className="route-info__value">{orderedGroups.length}</span>
                </div>
              </div>

              <p className="map-page-hint">
                {streetOk
                  ? 'Caminho a pé pelas ruas (mapa do OpenStreetMap). Na Rota Recomendada a ordem é a de menor caminhada. Use ▲▼ ou arraste para mudar a ordem.'
                  : 'Distância em linha reta a partir do centro de Ciudad del Este — referência, não trajeto de rua. Use ▲▼ ou arraste para mudar a ordem.'}
              </p>

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={storeOrder} strategy={verticalListSortingStrategy}>
                  <div className="store-route-list">
                    {orderedGroups.map((group, i) => (
                      <SortableStoreRow
                        key={group.store_name}
                        group={group}
                        index={i}
                        total={orderedGroups.length}
                        onMove={handleMove}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </>
          )}

          <button type="button" className="map-page-back" onClick={() => navigate('/cart')}>
            ← Voltar ao Carrinho
          </button>
        </aside>
      </div>
    </div>
  )
}
