// Shared utility / formatting functions

export function formatMoney(amount, currency) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

export function sourceDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Source'
  }
}

export function confidenceClass(score) {
  if (score >= 0.8) return 'confidence-high'
  if (score >= 0.6) return 'confidence-mid'
  return 'confidence-low'
}

export function cheapestByCountry(offers, country) {
  const filtered = (offers || []).filter(o => (o.country || '').toLowerCase() === country)
  if (!filtered.length) return null
  return filtered.reduce((best, cur) =>
    cur.price.amount_brl < best.price.amount_brl ? cur : best
  )
}

export function estimateSellingPrice(pyOffer, brOffer, marginPct) {
  const margin   = Number.isFinite(marginPct) ? marginPct / 100 : 0.2
  const pyCost   = pyOffer?.price?.amount_brl ?? null
  const brMarket = brOffer?.price?.amount_brl ?? null
  if (pyCost == null) return null
  if (brMarket != null) return Math.max(pyCost, Math.min(pyCost * (1 + margin), brMarket * 0.97))
  return pyCost * (1 + margin)
}

export function estimatedSellForGroup(group, marginPct) {
  return estimateSellingPrice(
    cheapestByCountry(group.offers, 'py'),
    cheapestByCountry(group.offers, 'br'),
    marginPct,
  )
}

export function sortGroups(groups, groupOrder, marginPct) {
  if (groupOrder === 'default') return groups
  const indexed = groups.map((group, idx) => ({
    group, idx, estimate: estimatedSellForGroup(group, marginPct),
  }))
  indexed.sort((a, b) => {
    if (a.estimate == null && b.estimate == null) return a.idx - b.idx
    if (a.estimate == null) return 1
    if (b.estimate == null) return -1
    return groupOrder === 'estimated_desc'
      ? b.estimate - a.estimate
      : a.estimate - b.estimate
  })
  return indexed.map(e => e.group)
}

export function familyDisplayName(group) {
  if (group.family_key) return formatModelName(group.family_key)
  const raw = group.canonical_name.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return formatModelName(raw)
}

export function formatModelName(name) {
  const exceptions = {
    iphone: 'iPhone', ipad: 'iPad', airpods: 'AirPods',
    note: 'Note', galaxy: 'Galaxy', redmi: 'Redmi',
    xiaomi: 'Xiaomi', samsung: 'Samsung', apple: 'Apple',
    pro: 'Pro', max: 'Max', plus: 'Plus', ultra: 'Ultra',
    mini: 'Mini', lite: 'Lite', ram: 'RAM', gb: 'GB', tb: 'TB',
  }
  return name
    .toLowerCase()
    .replace(/\b\w+\b/g, w => exceptions[w] ?? (w[0].toUpperCase() + w.slice(1)))
}

export function buildConfigChip(group) {
  if (group.concentration || group.volume_ml) {
    return [group.concentration, group.volume_ml].filter(Boolean).join(' · ')
  }
  return (group.canonical_name.match(/\(([^)]+)\)/) || ['', ''])[1]
}
