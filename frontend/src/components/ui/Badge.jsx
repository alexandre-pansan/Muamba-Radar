import React from 'react'

export default function Badge({ variant = 'default', className = '', children }) {
  return (
    <span className={`ui-badge ui-badge--${variant} ${className}`.trim()}>
      {children}
    </span>
  )
}
