/**
 * The shared chrome control surface (task 5.1): a native button — click /
 * Enter / Space activation for free — carrying the ui-design 焦点环 through
 * focus state. The plugin ships no stylesheet pipeline (Hard Rule: styles are
 * scoped to this plugin's own elements, never a global sheet), so the ring is
 * an inline outline driven by React focus state; the theme rides the host
 * `--dsw-alias-link` var (the rail's active-indicator precedent).
 */
import { forwardRef, useState, type ComponentProps } from 'react'

/** The brand focus ring applied while a chrome control holds focus. */
export const FOCUS_RING = {
  outline: '2px solid var(--dsw-alias-link, currentColor)',
  outlineOffset: '-2px',
} as const

/**
 * Button + focus ring. Forwards the ref so containers can drive roving
 * focus (tab strip arrows, menu arrows).
 */
export const ChromeButton = forwardRef<HTMLButtonElement, ComponentProps<'button'>>(function ChromeButton(props, ref) {
  const { style, onFocus, onBlur, ...rest } = props
  const [focused, setFocused] = useState(false)
  return (
    <button
      {...rest}
      ref={ref}
      onFocus={(event) => {
        setFocused(true)
        onFocus?.(event)
      }}
      onBlur={(event) => {
        setFocused(false)
        onBlur?.(event)
      }}
      style={focused && style !== undefined ? { ...style, ...FOCUS_RING } : focused ? { ...FOCUS_RING } : style}
    />
  )
})
