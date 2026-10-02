// Helpers do produto (grupo comparado) usados pela página de lojas (/product/:key/lojas)
// e pela página de detalhe (/product/:key).
import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { apiCompare } from './api.js'

export const offerCountry = o => (o.country || '').toLowerCase()

// Foto "sem imagem" dos sites não conta como foto.
export const isRealImage = url => Boolean(url) && !/sem-imagem|sem_imagem|no-?image|placeholder/i.test(url)

/** Uma linha por loja do Paraguai: a oferta mais barata dela + quantas ofertas tem. */
export function storeRowsFrom(offers) {
  const byStore = new Map()
  for (const o of (offers || []).filter(o => offerCountry(o) === 'py')) {
    const cur = byStore.get(o.store)
    if (!cur) byStore.set(o.store, { store: o.store, best: o, offers: [o], info: o.store_info })
    else {
      cur.offers.push(o)
      if (o.price.amount_brl < cur.best.price.amount_brl) cur.best = o
      cur.info = cur.info || o.store_info
    }
  }
  return [...byStore.values()]
    .map(r => ({ ...r, count: r.offers.length }))
    .sort((a, b) => a.best.price.amount_brl - b.best.price.amount_brl)
}

/** Quantas lojas diferentes do Paraguai vendem o produto. */
export function pyStoreCount(group) {
  return new Set((group?.offers || []).filter(o => offerCountry(o) === 'py').map(o => o.store)).size
}

/**
 * O grupo do produto: vem pelo state da navegação; aberto do zero (F5, link
 * compartilhado) refaz a busca de origem (?q=) e procura ESTA chave. Nunca cai em
 * "primeiro resultado qualquer" — produto errado é pior que "não encontrado".
 */
export function useProductGroup(productKey) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const stateGroup = location.state?.group?.product_key === productKey ? location.state.group : null
  const [group, setGroup] = useState(stateGroup)
  const [loading, setLoading] = useState(!stateGroup)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (stateGroup) { setGroup(stateGroup); setLoading(false); setNotFound(false); return }
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    const guess = searchParams.get('q') || productKey.replace(/[-_]/g, ' ')
    apiCompare(guess, 'best_match')
      .then(({ data }) => {
        if (cancelled) return
        const found = data.groups?.find(g => g.product_key === productKey) || null
        if (found) setGroup(found)
        else setNotFound(true)
      })
      .catch(() => { if (!cancelled) setNotFound(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { group, loading, notFound }
}

/** URL da lista de lojas / do detalhe, sempre levando o termo da busca junto. */
export function productUrls(group, query) {
  const q = query ? `?q=${encodeURIComponent(query)}` : ''
  return {
    stores: `/product/${group.product_key}/lojas${q}`,
    detail: (store) => {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (store) params.set('loja', store)
      const s = params.toString()
      return `/product/${group.product_key}${s ? `?${s}` : ''}`
    },
  }
}
