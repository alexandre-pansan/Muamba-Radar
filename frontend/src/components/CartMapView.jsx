import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBase } from '../api.js'
import { routeColor } from '../cartGrouping.js'

// Pin numerado. A cor segue a parada da rota (mesma cor da bolinha na lista lateral);
// loja já toda conferida fica verde com ✓ no carrinho.
function makeNumberedPin(num, done) {
  const color = done ? '#16a34a' : num != null ? routeColor(num - 1) : '#64748b'
  const label = num != null ? String(num) : ''
  const fs = label.length > 1 ? 11 : 13
  return L.divIcon({
    className: '',
    iconSize:   [32, 44],
    iconAnchor: [16, 44],
    popupAnchor:[0, -42],
    html: `<svg width="32" height="44" viewBox="0 0 32 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 28 16 28S32 28 32 16C32 7.163 24.837 0 16 0z"
            fill="${color}" opacity="0.95"/>
      <text x="16" y="21" text-anchor="middle"
            font-size="${fs}" font-weight="700"
            font-family="Inter,system-ui,sans-serif" fill="white">${label}</text>
    </svg>`,
  })
}

// Ciudad del Este, PY — fallback center
const CDE = [-25.5163, -54.6132]

// Fits the map to all markers whenever the list of coords changes
function FitBounds({ coords }) {
  const map = useMap()
  useEffect(() => {
    if (coords.length === 0) {
      map.setView(CDE, 14)
    } else if (coords.length === 1) {
      map.setView(coords[0], 16)
    } else {
      map.fitBounds(coords, { padding: [48, 48], maxZoom: 17 })
    }
  }, [JSON.stringify(coords)]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// OpenStreetMap: aberto, sem chave. (Os basemaps da CARTO passaram a exigir API key e
// devolviam tile com marca d'água "API KEY REQUIRED".) OSM não tem estilo escuro, então
// o modo escuro é um filtro CSS nos tiles ("Leaflet map theme integration" em styles.css).
const OSM_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
}

/**
 * showRoute: linha ligando as lojas na ordem da rota (página /map).
 * routeGeometry: caminho real pelas ruas ([[lat, lng], ...], do OSRM). Sem ele, a linha
 *   é reta entre as lojas (tracejada, pra não parecer trajeto de verdade).
 * showLabels: nome da loja fixo acima de cada pin.
 */
export default function CartMapView({ groups, pickedIds = new Set(), storeOrder = [], showRoute = false, showLabels = false, routeGeometry = null }) {

  const withCoords = groups.filter(g => g.store?.lat && g.store?.lng)
  const coords = withCoords.map(g => [g.store.lat, g.store.lng])
  // Linha em linha reta entre as paradas, na ordem da rota — não é trajeto de rua.
  const routeCoords = [...withCoords]
    .filter(g => storeOrder.includes(g.store_name))
    .sort((a, b) => storeOrder.indexOf(a.store_name) - storeOrder.indexOf(b.store_name))
    .map(g => [g.store.lat, g.store.lng])

  return (
    <MapContainer
      center={CDE}
      zoom={14}
      style={{ position: 'absolute', inset: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution={OSM_TILES.attribution}
        url={OSM_TILES.url}
        maxZoom={OSM_TILES.maxZoom}
      />
      <FitBounds coords={coords} />
      {showRoute && routeGeometry?.length > 1 && (
        <Polyline
          positions={routeGeometry}
          pathOptions={{ color: '#F47B20', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
        />
      )}
      {showRoute && !routeGeometry && routeCoords.length > 1 && (
        <Polyline
          positions={routeCoords}
          pathOptions={{ color: '#F47B20', weight: 4, opacity: 0.85, dashArray: '10 8', lineCap: 'round' }}
        />
      )}
      {withCoords.map(group => {
        const allPicked = group.items.length > 0 && group.items.every(i => pickedIds.has(i.id))
        const num = storeOrder.indexOf(group.store_name) + 1 || null
        return (
          <Marker
            key={group.store_name}
            position={[group.store.lat, group.store.lng]}
            icon={makeNumberedPin(num, allPicked)}
          >
            {showLabels && (
              <Tooltip permanent direction="top" offset={[0, -44]} className="map-pin-label">
                {group.store_name}
              </Tooltip>
            )}
            <Popup className="cart-map-popup">
              <div style={{ minWidth: 200 }}>
                {group.store.photo_url && (
                  <img
                    src={group.store.photo_url.startsWith('/static') ? `${getApiBase()}${group.store.photo_url}` : group.store.photo_url}
                    alt={group.store_name}
                    style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6, marginBottom: 8, display: 'block' }}
                  />
                )}
                <strong style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                  {allPicked ? '✓ ' : ''}{group.store_name}
                </strong>
                {group.store.address && (
                  <p style={{ margin: '0 0 6px', fontSize: 11, opacity: 0.7 }}>{group.store.address}</p>
                )}
                <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11 }}>
                  {group.items.map(item => (
                    <li key={item.id} style={{ marginBottom: 2, opacity: pickedIds.has(item.id) ? 0.45 : 1 }}>
                      <a href={item.offer_url} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>
                        {pickedIds.has(item.id) ? '✓ ' : ''}
                        {item.title.length > 42 ? item.title.slice(0, 42) + '…' : item.title}
                      </a>
                    </li>
                  ))}
                </ul>
                {group.store.google_maps_url && (
                  <a
                    href={group.store.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, display: 'block', marginTop: 8, color: '#818cf8' }}
                  >
                    Abrir no Google Maps →
                  </a>
                )}
              </div>
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
