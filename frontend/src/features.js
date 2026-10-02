import { useEffect, useState } from 'react'
import { apiFetchConfig } from './api.js'

// Chaves de funcionalidade vindas do backend (GET /config). Tudo começa desligado e só
// liga quando o backend confirma — um recurso desativado em produção nunca pisca na tela.
const DEFAULTS = { coupons: false }

let _cache = null
let _pending = null

function load() {
  if (_cache) return Promise.resolve(_cache)
  if (!_pending) {
    _pending = apiFetchConfig()
      .then(cfg => {
        _cache = { coupons: cfg?.coupons_enabled === true }
        return _cache
      })
      .catch(() => {
        _pending = null // tenta de novo no próximo uso
        return DEFAULTS
      })
  }
  return _pending
}

export function useFeatures() {
  const [features, setFeatures] = useState(_cache || DEFAULTS)
  useEffect(() => {
    let alive = true
    load().then(f => { if (alive) setFeatures(f) })
    return () => { alive = false }
  }, [])
  return features
}
