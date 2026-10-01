import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { apiFetchFavorites, apiAddFavorite, apiRemoveFavorite } from './api.js'

const FavoritesContext = createContext(null)

function storageKey(userId) {
  return `muamba_favorites_${userId ?? 'anon'}`
}

function loadFavorites(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function snapshotFromOffer(offer) {
  return {
    offer_url: offer.url,
    source: offer.source,
    title: offer.title,
    image_url: offer.image_url,
    store_name: offer.store,
    price_amount: offer.price.amount,
    price_currency: offer.price.currency,
    price_amount_brl: offer.price.amount_brl ?? null,
    country: offer.country,
    added_at: new Date().toISOString(),
  }
}

// Anonymous favorites stay client-only (localStorage), namespaced per user id so
// switching accounts on the same browser doesn't leak favorites between them — zero
// login friction, unchanged from before. Logged-in favorites now sync through the real
// `/favorites` API (backend Phase 1) so they follow the account across devices/browsers;
// any favorites already sitting in local storage from before login get merged up once.
export function FavoritesProvider({ children, currentUser }) {
  const userId = currentUser?.id ?? null
  const [items, setItems] = useState(() => loadFavorites(userId))
  const loadedFor = useRef(undefined)

  useEffect(() => {
    if (loadedFor.current === userId) return
    loadedFor.current = userId

    if (!userId) {
      setItems(loadFavorites(null))
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const server = await apiFetchFavorites()
        const serverUrls = new Set(server.map(i => i.offer_url))
        const localOnly = loadFavorites(null).filter(i => !serverUrls.has(i.offer_url))
        const uploaded = []
        for (const local of localOnly) {
          try {
            uploaded.push(await apiAddFavorite(local))
          } catch {
            // one bad local item shouldn't block the rest of the merge
          }
        }
        if (cancelled) return
        setItems([...uploaded, ...server])
      } catch {
        if (!cancelled) setItems([])
      }
    })()

    return () => { cancelled = true }
  }, [userId])

  const favoritedUrls = new Set(items.map(i => i.offer_url))

  const toggle = useCallback(async (offer) => {
    const exists = favoritedUrls.has(offer.url)

    if (!userId) {
      setItems(prev => {
        const next = exists
          ? prev.filter(i => i.offer_url !== offer.url)
          : [snapshotFromOffer(offer), ...prev]
        try {
          localStorage.setItem(storageKey(null), JSON.stringify(next))
        } catch {
          // non-fatal
        }
        return next
      })
      return
    }

    if (exists) {
      const item = items.find(i => i.offer_url === offer.url)
      if (!item) return
      setItems(prev => prev.filter(i => i.offer_url !== offer.url))
      try {
        await apiRemoveFavorite(item.id)
      } catch {
        setItems(prev => [item, ...prev]) // roll back on failure
      }
    } else {
      try {
        const created = await apiAddFavorite(snapshotFromOffer(offer))
        setItems(prev => [created, ...prev])
      } catch {
        // non-fatal — item just doesn't get added
      }
    }
  }, [userId, items, favoritedUrls])

  const remove = useCallback(async (offerUrl) => {
    const item = items.find(i => i.offer_url === offerUrl)
    if (!item) return
    setItems(prev => prev.filter(i => i.offer_url !== offerUrl))
    if (userId) {
      try {
        await apiRemoveFavorite(item.id)
      } catch {
        setItems(prev => [item, ...prev]) // roll back on failure
      }
    } else {
      try {
        localStorage.setItem(storageKey(null), JSON.stringify(items.filter(i => i.offer_url !== offerUrl)))
      } catch {
        // non-fatal
      }
    }
  }, [items, userId])

  return (
    <FavoritesContext.Provider value={{
      items,
      favoritedUrls,
      isFavorited: (url) => favoritedUrls.has(url),
      toggle,
      remove,
      synced: !!userId,
    }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used inside FavoritesProvider')
  return ctx
}
