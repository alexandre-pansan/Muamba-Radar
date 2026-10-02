import React, { useEffect, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { getLoadingTexts } from '../loadingTexts.js'

const CARD_COUNT = 8
const TEXT_INTERVAL_MS = 2600

/** Carregamento da busca no estilo do protótipo: esqueleto dos cards com brilho
 *  (shimmer) no lugar dos resultados + uma linha discreta com as frases da casa. */
export default function ResultsSkeleton({ query = '' }) {
  const { locale } = useI18n()
  const texts = getLoadingTexts(query, locale)
  const [index, setIndex] = useState(() => Math.floor(Math.random() * texts.length))

  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % texts.length), TEXT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [texts.length])

  return (
    <div className="results-skeleton" aria-busy="true" aria-live="polite">
      <p className="results-skeleton__status">
        <span className="results-skeleton__spinner" aria-hidden="true" />
        <span key={index} className="results-skeleton__text">{texts[index % texts.length]}</span>
      </p>
      <div className="product-grid">
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <div className="skeleton-card" key={i} aria-hidden="true">
            <div className="skeleton skeleton-image" />
            <div className="skeleton-card__body">
              <div className="skeleton skeleton-text skeleton-text--title" />
              <div className="skeleton skeleton-chip" />
              <div className="skeleton-row">
                <div className="skeleton skeleton-text skeleton-text--short" />
                <div className="skeleton skeleton-text skeleton-text--price" />
              </div>
              <div className="skeleton-row">
                <div className="skeleton skeleton-text skeleton-text--short" />
                <div className="skeleton skeleton-text skeleton-text--price" />
              </div>
              <div className="skeleton skeleton-button" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
