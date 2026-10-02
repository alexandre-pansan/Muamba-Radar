// Shared cart-item grouping/sorting helpers — used by both CartPage.jsx and MapPage.jsx
// so the two don't duplicate the same logic (extracted during Phase 5 of the port plan).

export function sortItems(items, sort) {
  return [...items].sort((a, b) => {
    if (sort === 'store')      return a.store_name.localeCompare(b.store_name)
    if (sort === 'price_asc')  return a.price_amount - b.price_amount
    if (sort === 'price_desc') return b.price_amount - a.price_amount
    if (sort === 'title')      return a.title.localeCompare(b.title)
    return 0
  })
}

// Returns ordered unique store names from a sorted list — used for map pin numbers.
export function getStoreOrder(sortedItems) {
  const seen = new Set()
  const order = []
  for (const item of sortedItems) {
    if (!seen.has(item.store_name)) { seen.add(item.store_name); order.push(item.store_name) }
  }
  return order
}

export function buildGroups(items) {
  const groups = {}
  for (const item of items) {
    const key = item.store_name
    if (!groups[key]) groups[key] = { store_name: key, store: item.store, items: [] }
    groups[key].items.push(item)
  }
  return Object.values(groups)
}

// Real haversine distance (km) between two [lat, lng] points — no fabricated routing engine.
function haversineKm([lat1, lng1], [lat2, lng2]) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// A simple, honest nearest-neighbor ordering from a starting point — NOT a real routing
// engine (no roads/traffic considered), just straight-line distance. Groups without real
// coordinates are appended at the end in their original order. Label this as "ordem
// sugerida" in the UI, never "optimized" or "melhor rota".
export function nearestNeighborOrder(groups, start) {
  const withCoords = groups.filter(g => g.store?.lat != null && g.store?.lng != null)
  const withoutCoords = groups.filter(g => g.store?.lat == null || g.store?.lng == null)

  const remaining = [...withCoords]
  const ordered = []
  let currentPoint = start

  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    remaining.forEach((g, i) => {
      const d = haversineKm(currentPoint, [g.store.lat, g.store.lng])
      if (d < bestDist) { bestDist = d; bestIdx = i }
    })
    const [next] = remaining.splice(bestIdx, 1)
    ordered.push(next)
    currentPoint = [next.store.lat, next.store.lng]
  }

  return [...ordered, ...withoutCoords]
}

export function totalRouteDistanceKm(orderedGroups, start) {
  const withCoords = orderedGroups.filter(g => g.store?.lat != null && g.store?.lng != null)
  if (withCoords.length === 0) return 0
  let total = 0
  let currentPoint = start
  for (const g of withCoords) {
    total += haversineKm(currentPoint, [g.store.lat, g.store.lng])
    currentPoint = [g.store.lat, g.store.lng]
  }
  return total
}

// Cor de cada parada da rota (pin no mapa = bolinha numerada na lista). Paleta do
// protótipo, com o amarelo claro trocado por âmbar: número branco precisa de contraste.
// Sem verde: verde é o pin de "loja já conferida" no carrinho.
export const ROUTE_COLORS = ['#F47B20', '#0EA5A4', '#3B82F6', '#E11D48', '#D97706', '#A855F7']

export function routeColor(index) {
  return ROUTE_COLORS[index % ROUTE_COLORS.length]
}
