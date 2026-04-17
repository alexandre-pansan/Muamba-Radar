import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { apiFetchCart, apiAddToCart, apiRemoveFromCart, apiClearCart, getToken } from './api.js'

const CartContext = createContext(null)

export function CartProvider({ children, currentUser }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const loadedFor = useRef(null)

  const reload = useCallback(async () => {
    if (!currentUser) { setItems([]); return }
    setLoading(true)
    try {
      const data = await apiFetchCart()
      setItems(data)
    } catch (_) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [currentUser])

  // Reload whenever user changes
  useEffect(() => {
    if (currentUser?.id !== loadedFor.current) {
      loadedFor.current = currentUser?.id ?? null
      reload()
    }
  }, [currentUser, reload])

  const savedUrls = new Set(items.map(i => i.offer_url))

  const toggle = useCallback(async (offer, onNeedAuth) => {
    if (!currentUser) {
      onNeedAuth?.()
      return
    }
    const isSaved = savedUrls.has(offer.url)
    if (isSaved) {
      const item = items.find(i => i.offer_url === offer.url)
      if (!item) return
      // Optimistic remove
      setItems(prev => prev.filter(i => i.offer_url !== offer.url))
      try {
        await apiRemoveFromCart(item.id)
      } catch (_) {
        // Revert
        setItems(prev => [...prev, item])
      }
    } else {
      // Optimistic add (placeholder)
      const placeholder = {
        id: `tmp-${Date.now()}`,
        offer_url: offer.url,
        source: offer.source,
        country: offer.country,
        store_name: offer.store,
        title: offer.title,
        price_amount: offer.price.amount,
        price_currency: offer.price.currency,
        image_url: offer.image_url,
        store_id: null,
        store: null,
        added_at: new Date().toISOString(),
      }
      setItems(prev => [placeholder, ...prev])
      try {
        const created = await apiAddToCart({
          offer_url: offer.url,
          source: offer.source,
          country: offer.country,
          store_name: offer.store,
          title: offer.title,
          price_amount: offer.price.amount,
          price_currency: offer.price.currency,
          image_url: offer.image_url,
        })
        setItems(prev => prev.map(i => i.id === placeholder.id ? created : i))
      } catch (_) {
        // Revert
        setItems(prev => prev.filter(i => i.id !== placeholder.id))
      }
    }
  }, [currentUser, items, savedUrls])

  const remove = useCallback(async (itemId) => {
    const item = items.find(i => i.id === itemId)
    setItems(prev => prev.filter(i => i.id !== itemId))
    try {
      await apiRemoveFromCart(itemId)
    } catch (_) {
      if (item) setItems(prev => [...prev, item])
    }
  }, [items])

  const clear = useCallback(async () => {
    const backup = [...items]
    setItems([])
    try {
      await apiClearCart()
    } catch (_) {
      setItems(backup)
    }
  }, [items])

  return (
    <CartContext.Provider value={{ items, loading, savedUrls, toggle, remove, clear, reload }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside CartProvider')
  return ctx
}
