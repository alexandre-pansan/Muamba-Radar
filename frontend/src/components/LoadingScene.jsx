import React, { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { apiFetchFeaturedImages } from '../api.js'
import { getLoadingTexts } from '../loadingTexts.js'

function launchFlyer(wrap, pool, state) {
  if (!wrap.isConnected) return
  const scene = wrap.closest('.loading-scene')
  if (!scene) return

  const sceneW   = scene.offsetWidth
  const sceneH   = scene.offsetHeight
  const tileSize = 120

  const topPx = Math.round(sceneH * 0.10 + Math.random() * sceneH * 0.68)
  wrap.style.top = `${topPx}px`

  const goLtr = Math.random() > 0.5
  const dist   = sceneW + tileSize * 2 + 40
  wrap.style.left = goLtr ? `${-(tileSize + 20)}px` : `${sceneW + 20}px`
  wrap.style.setProperty('--fly-dx', `${goLtr ? dist : -dist}px`)

  const dur = (2.6 + Math.random() * 2.4).toFixed(2)

  state.index = (state.index + 1) % pool.length
  const img = wrap.querySelector('img')
  if (img) img.src = pool[state.index]

  wrap.style.animation = 'none'
  void wrap.offsetWidth
  wrap.style.animation = `lf-fly ${dur}s linear forwards`
}

export default function LoadingScene({ images: imagesProp = [], query = '' }) {
  const { locale } = useI18n()
  const sceneRef   = useRef(null)
  const [images, setImages]   = useState(imagesProp)
  const texts = getLoadingTexts(query, locale)
  const [displayed, setDisplayed] = useState('')

  // Fetch images if none passed in yet
  useEffect(() => {
    if (imagesProp.length) { setImages(imagesProp); return }
    apiFetchFeaturedImages().then(imgs => { if (imgs?.length) setImages(imgs) })
  }, [imagesProp])

  // Typewriter effect — types current text, then advances to next after pause
  useEffect(() => {
    const startIdx = Math.floor(Math.random() * texts.length)
    let idx = startIdx
    let charPos = 0
    let timeout

    function typeChar() {
      const full = texts[idx]
      charPos++
      setDisplayed(full.slice(0, charPos))
      if (charPos < full.length) {
        timeout = setTimeout(typeChar, 38)
      } else {
        // Pause at end, then move to next text
        timeout = setTimeout(() => {
          idx = (idx + 1) % texts.length
          charPos = 0
          setDisplayed('')
          timeout = setTimeout(typeChar, 120)
        }, 3800)
      }
    }

    setDisplayed('')
    timeout = setTimeout(typeChar, 300)
    return () => clearTimeout(timeout)
  }, [query, locale])

  // Flying images animation
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !images.length) return

    const pool = images
    const N = 4
    const cleanups = []

    for (let i = 0; i < N; i++) {
      const wrap = document.createElement('div')
      wrap.className = 'lf-flyer-wrap'

      const tile = document.createElement('div')
      tile.className = 'lf-flyer'

      const img = document.createElement('img')
      img.alt = ''
      img.src = pool[i % pool.length]

      tile.appendChild(img)
      wrap.appendChild(tile)
      scene.appendChild(wrap)

      const state = { index: i }
      const onAnimEnd = () => launchFlyer(wrap, pool, state)
      wrap.addEventListener('animationend', onAnimEnd)
      const timer = setTimeout(() => launchFlyer(wrap, pool, state), i * 780)

      cleanups.push(() => {
        clearTimeout(timer)
        wrap.removeEventListener('animationend', onAnimEnd)
        wrap.remove()
      })
    }

    return () => cleanups.forEach(fn => fn())
  }, [images])

  return (
    <div className="loading-scene" ref={sceneRef}>
      <div className="lf-center">
        <div className="lf-glow"></div>
        <img src="/logo.png" alt="MuambaRadar" className="lf-logo" />
        <p className="lf-tagline">{displayed}<span className="lf-cursor">|</span></p>
        <div className="lf-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  )
}
