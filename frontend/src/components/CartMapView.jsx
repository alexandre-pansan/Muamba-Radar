import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getApiBase } from '../api.js'

// Numbered SVG pin icon — number + color
function makeNumberedPin(num, done) {
  const color = done ? '#16a34a' : '#4f46e5'
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

const TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
}

function useTheme() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light'
  )
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}

export default function CartMapView({ groups, pickedIds = new Set(), storeOrder = [] }) {
  const isDark = useTheme()
  const tile = isDark ? TILES.dark : TILES.light

  const withCoords = groups.filter(g => g.store?.lat && g.store?.lng)
  const coords = withCoords.map(g => [g.store.lat, g.store.lng])

  return (
    <MapContainer
      center={CDE}
      zoom={14}
      style={{ position: 'absolute', inset: 0 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution={tile.attribution}
        url={tile.url}
        subdomains="abcd"
        maxZoom={20}
      />
      <FitBounds coords={coords} />
      {withCoords.map(group => {
        const allPicked = group.items.length > 0 && group.items.every(i => pickedIds.has(i.id))
        const num = storeOrder.indexOf(group.store_name) + 1 || null
        return (
          <Marker
            key={group.store_name}
            position={[group.store.lat, group.store.lng]}
            icon={makeNumberedPin(num, allPicked)}
          >
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
