// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReplicaPanelShared } from '../src/client/index.ts'
import { en } from '../src/client/locales.ts'
import { createCollisionStore } from '../src/client/store.ts'

// The replica panel's interaction loop (twin of hello-world's): a click
// dispatches the store-seat action, the selector hook observes the engine,
// React re-renders — the fixture is a live runtime link, not static injection.

type Dict = typeof en

/** English translate bound like the locale face does (t(key, params)). */
const t = (key: keyof Dict, params?: Record<string, unknown>): string =>
  (en as Record<string, string>)[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))

function renderPanel() {
  // A real engine instance from the real defineStore handle — the same
  // instance shape the render machinery binds for the store seat.
  const instance = createCollisionStore().create('test-session')
  const view = render(
    <ReplicaPanelShared
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

describe('collision-replica panel: interaction loop through the store seat', () => {
  // vitest runs without globals, so RTL's auto-cleanup never registers.
  afterEach(cleanup)

  it('renders the fixture-identified greeting, counter, and the sub-slot default content', () => {
    renderPanel()
    expect(screen.getByText(en.greet)).toBeTruthy()
    expect(screen.getByText('Replica hellos: 0')).toBeTruthy()
    expect(screen.getByText(en.panelDefault)).toBeTruthy()
  })

  it('carries its own plugin marker so live UI observation can tell it from hello-world', () => {
    const { view } = renderPanel()
    expect(view.container.querySelector('[data-dsh-forge-plugin="hello-world-collision"]')).not.toBeNull()
  })

  it('updates the store seat and re-renders on click', () => {
    const { instance } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: en.increment }))
    expect(screen.getByText('Replica hellos: 1')).toBeTruthy()
    expect(instance.getSnapshot().hellos).toBe(1)
  })
})
