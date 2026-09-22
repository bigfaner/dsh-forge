// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { HelloWorldPanel } from '../src/client/HelloWorldPanel.tsx'
import { en } from '../src/client/locales.ts'
import { createHelloWorldStore } from '../src/client/store.ts'

// Task 1 AC6: the interaction loop — a click dispatches the client half's
// store-seat action, the selector hook observes the engine, and React
// re-renders. This proves a live runtime link, not static injection.

type Dict = typeof en

/** English translate bound like the locale face does (t(key, params)). */
const t = (key: keyof Dict, params?: Record<string, unknown>): string =>
  (en as Record<string, string>)[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))

function renderPanel() {
  // A real engine instance from the real defineStore handle — the same
  // instance shape the render machinery binds for the store seat.
  const instance = createHelloWorldStore().create('test-session')
  const view = render(
    <HelloWorldPanel
      messageId="msg-1"
      t={t}
      actions={instance.actions}
      useStore={sel => sel(useSyncExternalStore(
        cb => instance.subscribe(cb),
        () => instance.getSnapshot(),
      ))}
      renderSlot={(_key, _owner, opts) => opts?.fallback ?? null}
      renderFactorySlot={() => null}
    />,
  )
  return { instance, view }
}

describe('hello-world panel: interaction loop through the store seat (AC6)', () => {
  // vitest runs without globals, so RTL's auto-cleanup never registers.
  afterEach(cleanup)

  it('renders the greeting, counter, and the sub-slot default content', () => {
    renderPanel()
    expect(screen.getByText(en.greet)).toBeTruthy()
    expect(screen.getByText('Hellos: 0')).toBeTruthy()
    expect(screen.getByText(en.panelDefault)).toBeTruthy()
  })

  it('updates the store seat and re-renders on click', () => {
    const { instance } = renderPanel()
    const button = screen.getByRole('button', { name: en.increment })

    fireEvent.click(button)
    expect(screen.getByText('Hellos: 1')).toBeTruthy()
    expect(instance.getSnapshot().hellos).toBe(1)

    fireEvent.click(button)
    expect(screen.getByText('Hellos: 2')).toBeTruthy()
  })
})
