import React from 'react'

export default function Button({
  variant = 'primary',
  size = 'md',
  icon = false,
  className = '',
  children,
  ...rest
}) {
  const classes = [
    'ui-btn',
    `ui-btn--${variant}`,
    size !== 'md' ? `ui-btn--${size}` : '',
    icon ? 'ui-btn--icon' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  )
}
