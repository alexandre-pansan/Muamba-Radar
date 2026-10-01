import React, { lazy, Suspense, useMemo, useState, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCart } from '../CartContext.jsx'
import { buildGroups, nearestNeighborOrder, totalRouteDistanceKm } from '../cartGrouping.js'

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

function StoreRow({ group, index, dragHandleProps, isDragging }) {
  return (
    <div className={`map-store-row${isDragging ? ' is-dragging' : ''}`}>
      <span className="map-store-num">{index + 1}</span>
      <div className="map-store-info">
        <span className="map-store-name">{group.store_name}</span>
        <span className="map-store-count">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="map-store-drag" {...dragHandleProps} aria-label="Arrastar para reordenar">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
          <circle cx="7" cy="5" r="1.5"/><circle cx="13" cy="5" r="1.5"/>
          <circle cx="7" cy="10" r="1.5"/><circle cx="13" cy="10" r="1.5"/>
          <circle cx="7" cy="15" r="1.5"/><circle cx="13" cy="15" r="1.5"/>
        </svg>
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
  const [mode, setMode] = useState('recommended') // 'recommended' | 'custom'
  const [customOrder, setCustomOrder] = useState(null) // array of store_names

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const baseGroups = useMemo(() => buildGroups(items), [items])
  const recommendedGroups = useMemo(() => nearestNeighborOrder(baseGroups, CDE), [baseGroups])

  const orderedGroups = useMemo(() => {
    if (mode === 'custom' && customOrder) {
      const byName = new Map(baseGroups.map(g => [g.store_name, g]))
      return customOrder.map(name => byName.get(name)).filter(Boolean)
    }
    return recommendedGroups
  }, [mode, customOrder, baseGroups, recommendedGroups])

  const storeOrder = orderedGroups.map(g => g.store_name)
  const distanceKm = totalRouteDistanceKm(orderedGroups, CDE)

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const names = orderedGroups.map(g => g.store_name)
    const oldIndex = names.indexOf(active.id)
    const newIndex = names.indexOf(over.id)
    setCustomOrder(arrayMove(names, oldIndex, newIndex))
    setMode('custom')
  }

  function setRecommended() {
    setMode('recommended')
    setCustomOrder(null)
  }

  return (
    <div className="map-page">
      <div className="map-page-map">
        <MapErrorBoundary>
          <Suspense fallback={<div className="cart-map-loading">Carregando mapa...</div>}>
            <CartMapView groups={orderedGroups} pickedIds={new Set()} storeOrder={storeOrder} />
          </Suspense>
        </MapErrorBoundary>
      </div>

      <div className="map-page-panel">
        <button className="map-page-back" onClick={() => navigate('/cart')}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Voltar ao carrinho
        </button>

        <h1 className="map-page-title">Sua rota</h1>

        <div className="map-mode-toggle">
          <button
            className={`map-mode-btn${mode === 'recommended' ? ' is-active' : ''}`}
            onClick={setRecommended}
          >
            Ordem sugerida
          </button>
          <button
            className={`map-mode-btn${mode === 'custom' ? ' is-active' : ''}`}
            onClick={() => setMode('custom')}
            disabled={!customOrder}
            title={!customOrder ? 'Arraste uma loja abaixo para customizar' : ''}
          >
            Personalizada
          </button>
        </div>

        <p className="map-page-hint">
          Ordem sugerida por distância em linha reta a partir do centro de Ciudad del Este — não é uma rota de trânsito real, só uma referência. Arraste as lojas abaixo para reordenar do seu jeito.
        </p>

        {orderedGroups.length === 0 ? (
          <p className="map-page-empty">Seu carrinho está vazio — não há lojas para mostrar no mapa.</p>
        ) : (
          <>
            <div className="map-route-summary">
              <span className="map-route-distance">≈ {distanceKm.toFixed(1)} km</span>
              <span className="map-route-stores">{orderedGroups.length} loja{orderedGroups.length !== 1 ? 's' : ''}</span>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={storeOrder} strategy={verticalListSortingStrategy}>
                <div className="map-store-list">
                  {orderedGroups.map((group, i) => (
                    <SortableStoreRow key={group.store_name} group={group} index={i} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>
    </div>
  )
}
