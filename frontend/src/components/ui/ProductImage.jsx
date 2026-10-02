import React, { useEffect, useState } from 'react'

/**
 * Foto de produto vinda de site de terceiros (loja/agregador). Esses endereços quebram
 * sem aviso (o Compras Paraguai já trocou de bucket uma vez) — se falhar ou não houver
 * URL, mostra a inicial do produto num quadrado em vez do ícone de imagem quebrada.
 */
export default function ProductImage({ src, title = '', className = '', loading = 'lazy' }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])

  if (!src || failed) {
    return (
      <span className={`product-image-fallback ${className}`.trim()} aria-hidden="true">
        {(title.trim().charAt(0) || '?').toUpperCase()}
      </span>
    )
  }
  return <img className={className} src={src} alt="" loading={loading} onError={() => setFailed(true)} />
}
