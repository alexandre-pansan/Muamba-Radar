import React, { useEffect, useRef, useState } from 'react'

/** Autoplaying hero slide carousel (banner), distinct from Carousel — its autoplay/dot
 * behavior genuinely differs from the generic product-row scroller.
 * slides: [{ key, render() }] — each slide is fully custom content. */
export default function HeroBanner({ slides = [], intervalMs = 5000 }) {
  const [index, setIndex] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (slides.length <= 1) return
    timerRef.current = setInterval(() => {
      setIndex(i => (i + 1) % slides.length)
    }, intervalMs)
    return () => clearInterval(timerRef.current)
  }, [slides.length, intervalMs])

  if (slides.length === 0) return null

  function goTo(i) {
    setIndex(((i % slides.length) + slides.length) % slides.length)
  }

  return (
    <section className="ui-hero-banner">
      <button
        type="button"
        className="ui-hero-nav ui-hero-nav--prev"
        aria-label="Banner anterior"
        onClick={() => goTo(index - 1)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button
        type="button"
        className="ui-hero-nav ui-hero-nav--next"
        aria-label="Próximo banner"
        onClick={() => goTo(index + 1)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <div className="ui-hero-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map(slide => (
          <div className="ui-hero-slide" key={slide.key}>
            {slide.render()}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="ui-hero-dots">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              className={`ui-hero-dot${i === index ? ' is-active' : ''}`}
              aria-label={`Ir para banner ${i + 1}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
