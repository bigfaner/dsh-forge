// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChromeButton, FOCUS_RING } from '../src/client/components/chrome/ChromeButton.tsx'
import { MOCK_EMPTY_WORKBENCH_STATE, MOCK_WORKBENCH_STATE } from '../src/client/mocks/workbench.ts'

// M4 task 1.7 (旧视图退役): the M2/M3 page chrome retired with the tab
// family — TabBar / TopBar / ProjectSwitcher are deleted (their suites went
// with them; the shell-level integration now lives in shell.spec.tsx's
// escape-door form). ChromeButton SURVIVES as the shared control surface
// (~40 consumers across the view families), so its contract is pinned here
// directly: native button activation, the brand focus ring through focus
// state, ref forwarding (the roving-focus currency), and the no-stylesheet
// discipline.

afterEach(() => cleanup())

describe('ChromeButton: the shared chrome control surface (5.1 AC4/AC6)', () => {
  it('is a native button — click / Enter / Space activation for free', () => {
    const { container } = render(<ChromeButton type="button">label</ChromeButton>)
    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button?.tagName).toBe('BUTTON')
    expect(button?.textContent).toBe('label')
  })

  it('applies the brand focus ring on focus and injects no stylesheet (AC4)', () => {
    const { container } = render(<ChromeButton type="button">go</ChromeButton>)
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.style.outline).toBe('')
    act(() => { button.focus() })
    expect(button.style.outline).toBe(FOCUS_RING.outline)
    expect(button.style.outline).toContain('var(--dsw-alias-link')
    expect(document.querySelectorAll('style')).toHaveLength(0)
  })

  it('keeps the caller\'s style object and merges the ring over it while focused', () => {
    const { container } = render(
      <ChromeButton type="button" style={{ borderRadius: '14px', background: 'transparent' }}>x</ChromeButton>,
    )
    const button = container.querySelector('button') as HTMLButtonElement
    expect(button.style.borderRadius).toBe('14px')
    act(() => { button.focus() })
    expect(button.style.borderRadius).toBe('14px') // the caller's style survives the merge
    expect(button.style.outline).toContain('var(--dsw-alias-link')
  })

  it('forwards the ref so containers can drive roving focus', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<ChromeButton ref={ref} type="button">target</ChromeButton>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    act(() => { ref.current?.focus() })
    expect(document.activeElement).toBe(ref.current)
  })
})

describe('mocks/workbench: the shared 5.x build fixture', () => {
  it('populated variant satisfies the single-activation invariant', () => {
    const ids = MOCK_WORKBENCH_STATE.projects.map(project => project.id)
    expect(MOCK_WORKBENCH_STATE.projects.length).toBeGreaterThanOrEqual(2)
    expect(ids).toContain(MOCK_WORKBENCH_STATE.activeProjectId)
    expect(new Set(MOCK_WORKBENCH_STATE.projects.map(project => project.codeRoot)).size)
      .toBe(MOCK_WORKBENCH_STATE.projects.length)
  })

  it('empty variant is the overview empty-state fixture (no projects, null pointer)', () => {
    expect(MOCK_EMPTY_WORKBENCH_STATE.projects).toHaveLength(0)
    expect(MOCK_EMPTY_WORKBENCH_STATE.activeProjectId).toBeNull()
  })
})
