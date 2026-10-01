import React, { useRef } from 'react'

/** Generic horizontal product-row scroller (native scroll, no library — same approach
 * as the prototype's scrollCarousel()). Pass any children as the track's items. */
export default function Carousel({ children, ariaLabel = 'Carrossel' }) {
  const trackRef = useRef(null)

  function scroll(direction) {
    const track = trackRef.current
    if (!track) return
    const firstItem = track.firstElementChild
    const itemWidth = firstItem?.offsetWidth || 280
    track.scrollBy({ left: direction * (itemWidth + 16), behavior: 'smooth' })
  }

  return (
    <div className="ui-carousel-container">
      <button
        type="button"
        className="ui-carousel-nav ui-carousel-nav--prev"
        aria-label={`${ariaLabel} — anterior`}
        onClick={() => scroll(-1)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div className="ui-carousel-viewport">
        <div className="ui-carousel-track" ref={trackRef}>
          {children}
        </div>
      </div>
      <button
        type="button"
        className="ui-carousel-nav ui-carousel-nav--next"
        aria-label={`${ariaLabel} — próximo`}
        onClick={() => scroll(1)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  )
}
