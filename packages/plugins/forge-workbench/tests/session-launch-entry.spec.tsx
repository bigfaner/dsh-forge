// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  qualifyTaskKey, runSessionLaunchChain,
  SessionLaunchEntry, type SessionLaunchEntryProps,
} from '../src/client/views/tasks/SessionLaunchEntry.tsx'
import { ConfirmPanel } from '../src/client/views/tasks/launch/ConfirmPanel.tsx'
import { en, type WorkbenchKey } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import { MOCK_TASK_PROMPT } from '../src/client/mocks/workbench.ts'
import type { SessionLaunchServices } from '../src/client/contract.ts'
import type { SessionLaunchInput, SessionLaunchResult } from '../src/client/session-launch.ts'

// Task 5.10 — the UF5 launch entry BUILD units (mocked service face; 5.11
// wires the real remotes). AC map:
//   AC1 dual-mount consistency · AC2 confirm 态 (preview + default focus +
//   one-Enter launch) · AC3 chain state machine (three explicit terminals)
//   · AC4 degradation toast · AC5 disabled + reason · AC6 chain routing.

type Dict = Record<WorkbenchKey, string>
const bind = (dict: Dict) => (key: WorkbenchKey): string => dict[key]
const t = { en: bind(en), zh: bind(zh) }

/** A prompt whose bytes would not survive any trimming/re-wrap. */
const VERBATIM_PROMPT = '  leading spaces survive\n\n# Title\n\ttab line\n trailing space \nEnd.\n'

const TASK: SessionLaunchEntryProps['task'] = {
  projectId: 'proj-1',
  codeRoot: 'Z:\\repo\\demo',
  featureSlug: 'demo-feature',
  localId: '3.2',
  title: 'Demo task title',
}
const QUALIFIED_KEY = 'demo-feature/3.2'

const ok = (sessionId: string): SessionLaunchResult => ({ ok: true, sessionId })
const channelDown = (reasonCode: 'ERR_HOST_NOT_READY' | 'ERR_SESSION_CHANNEL_UNAVAILABLE', sessionId?: string): SessionLaunchResult => ({
  ok: false,
  reasonCode,
  detail: `${reasonCode} (test)`,
  ...(sessionId === undefined ? {} : { sessionId }),
})

/** Deferred promise helper for driving in-flight states deterministically. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/** A services face with every member spied; tier-1 succeeds by default. */
function makeServices(overrides: Partial<SessionLaunchServices> = {}) {
  return {
    probe: vi.fn(async () => ({ available: true as const, promptText: VERBATIM_PROMPT })),
    launch: vi.fn(async (): Promise<SessionLaunchResult> => ok('session-tier1')),
    launchViaClientChannel: vi.fn(async (): Promise<SessionLaunchResult> => ok('session-tier2')),
    copyPromptToClipboard: vi.fn(async () => true),
    bringMainWindowToFront: vi.fn(),
    recordSessionLink: vi.fn(async () => ({
      id: 'link-1',
      projectId: TASK.projectId,
      taskKey: QUALIFIED_KEY,
      sessionId: 'session-tier1',
      status: 'active' as const,
      startedAt: '2026-09-22T08:00:00.000Z',
      endedAt: null,
    })),
    ...overrides,
  }
}

/** Open the confirm dialog from a fresh available entry. */
async function openConfirm(props: Partial<SessionLaunchEntryProps> = {}) {
  const services = makeServices()
  render(
    <SessionLaunchEntry
      variant="panel-primary"
      t={t.en}
      task={TASK}
      services={services}
      onLaunched={vi.fn()}
      {...props}
    />,
  )
  await waitFor(() => {
    expect((screen.getByRole('button', { name: en['launch.primary'] }) as HTMLButtonElement).disabled).toBe(false)
  })
  fireEvent.click(screen.getByRole('button', { name: en['launch.primary'] }))
  const dialog = document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')
  expect(dialog).not.toBeNull()
  return { services, dialog: dialog as HTMLElement }
}

afterEach(() => cleanup())

// ---------------------------------------------------------------------------
// runSessionLaunchChain — the Interface 5 degradation routing (AC6)
// ---------------------------------------------------------------------------

describe('runSessionLaunchChain: tier routing (AC6)', () => {
  const input: SessionLaunchInput = { promptText: VERBATIM_PROMPT, title: 't', cwd: 'Z:\\repo' }

  it('tier 1 success resolves launched and never touches tier 2 or the fallback', async () => {
    const launch = vi.fn(async () => ok('session-a'))
    const launchViaClientChannel = vi.fn(async () => ok('session-b'))
    const copyPromptToClipboard = vi.fn(async () => true)
    const outcome = await runSessionLaunchChain(input, {
      launchHostChannel: launch, launchClientChannel: launchViaClientChannel,
      copyToClipboard: copyPromptToClipboard, bringToFront: vi.fn(),
    })
    expect(outcome).toEqual({ kind: 'launched', sessionId: 'session-a' })
    expect(launch).toHaveBeenCalledWith(input)
    expect(launchViaClientChannel).not.toHaveBeenCalled()
    expect(copyPromptToClipboard).not.toHaveBeenCalled()
  })

  it('ERR_HOST_NOT_READY routes into the tier-2 same-semantics retry (no sessionId to carry)', async () => {
    const launchViaClientChannel = vi.fn(async () => ok('session-tier2'))
    const outcome = await runSessionLaunchChain(input, {
      launchHostChannel: vi.fn(async () => channelDown('ERR_HOST_NOT_READY')),
      launchClientChannel: launchViaClientChannel,
      copyToClipboard: vi.fn(async () => true), bringToFront: vi.fn(),
    })
    expect(outcome).toEqual({ kind: 'launched', sessionId: 'session-tier2' })
    // The retry carries the SAME input verbatim — no recovery id existed.
    expect(launchViaClientChannel).toHaveBeenCalledWith(input)
  })

  it('ERR_SESSION_CHANNEL_UNAVAILABLE after an adopted session retries tier 2 WITH the recovery sessionId', async () => {
    const launchViaClientChannel = vi.fn(async () => ok('session-adopted'))
    const outcome = await runSessionLaunchChain(input, {
      launchHostChannel: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE', 'session-adopted')),
      launchClientChannel: launchViaClientChannel,
      copyToClipboard: vi.fn(async () => true), bringToFront: vi.fn(),
    })
    expect(outcome).toEqual({ kind: 'launched', sessionId: 'session-adopted' })
    expect(launchViaClientChannel).toHaveBeenCalledWith({ ...input, sessionId: 'session-adopted' })
  })

  it('both tiers failing lands the frozen tier-3 fallback: clipboard carries the VERBATIM prompt, window fronts, degrades — never errors', async () => {
    const copyPromptToClipboard = vi.fn(async () => true)
    const bringToFront = vi.fn()
    const outcome = await runSessionLaunchChain(input, {
      launchHostChannel: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE')),
      launchClientChannel: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE')),
      copyToClipboard: copyPromptToClipboard, bringToFront,
    })
    expect(outcome).toEqual({ kind: 'degraded' })
    expect(copyPromptToClipboard).toHaveBeenCalledWith(VERBATIM_PROMPT)
    expect(bringToFront).toHaveBeenCalledTimes(1)
  })

  it('a denied clipboard breaks deliverability — failed(clipboard-denied), the one chain error', async () => {
    const outcome = await runSessionLaunchChain(input, {
      launchHostChannel: vi.fn(async () => channelDown('ERR_HOST_NOT_READY')),
      launchClientChannel: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE')),
      copyToClipboard: vi.fn(async () => false), bringToFront: vi.fn(),
    })
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'clipboard-denied' })
  })

  it('a thrown rejection (assembly fault) is failed(unexpected) — surfaced, never swallowed', async () => {
    const outcome = await runSessionLaunchChain(input, {
      launchHostChannel: vi.fn(async () => { throw new Error('rpc assembly fault') }),
      launchClientChannel: vi.fn(async () => ok('nope')), copyToClipboard: vi.fn(async () => true), bringToFront: vi.fn(),
    })
    expect(outcome).toMatchObject({ kind: 'failed', reason: 'unexpected', detail: 'Error: rpc assembly fault' })
  })

  it('qualifyTaskKey emits the 2.5 dialect address', () => {
    expect(qualifyTaskKey('demo-feature', '3.2')).toBe('demo-feature/3.2')
  })
})

// ---------------------------------------------------------------------------
// Probe states + disabled reasons (AC5)
// ---------------------------------------------------------------------------

describe('SessionLaunchEntry: availability probe (AC5)', () => {
  it('disables while probing and shows the probing note as tooltip', () => {
    const services = makeServices({ probe: () => new Promise(() => {}) })
    render(<SessionLaunchEntry variant="node-hover" t={t.en} task={TASK} services={services} />)
    const trigger = screen.getByRole('button', { name: en['launch.entry'] }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    expect(trigger.title).toBe(en['launch.probing'])
    expect(trigger.getAttribute('data-probe')).toBe('probing')
  })

  it('ERR_NO_PROMPT disables with the readable inline reason (tooltip)', async () => {
    const services = makeServices({
      probe: vi.fn(async () => ({ available: false as const, reasonCode: 'ERR_NO_PROMPT' as const })),
    })
    render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} services={services} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: en['launch.primary'] }).title).toBe(en['launch.reason.noPrompt'])
    })
    expect((screen.getByRole('button', { name: en['launch.primary'] }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('ERR_FORGE_CLI_UNAVAILABLE disables with the CLI reason (recovery guidance copy)', async () => {
    const services = makeServices({
      probe: vi.fn(async () => ({
        available: false as const,
        reasonCode: 'ERR_FORGE_CLI_UNAVAILABLE' as const,
        detail: 'no forge binary',
      })),
    })
    render(<SessionLaunchEntry variant="node-hover" t={t.zh} task={TASK} services={services} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: zh['launch.entry'] }).title).toBe(zh['launch.reason.cliUnavailable'])
    })
  })

  it('probe is addressed with the project codeRoot + QUALIFIED task key', async () => {
    const services = makeServices()
    render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} services={services} />)
    await waitFor(() => { expect(services.probe).toHaveBeenCalled() })
    expect(services.probe).toHaveBeenCalledWith({ projectRoot: TASK.codeRoot, taskKey: QUALIFIED_KEY })
  })
})

// ---------------------------------------------------------------------------
// Dual-mount consistency (AC1)
// ---------------------------------------------------------------------------

describe('SessionLaunchEntry: dual mount, one machine (AC1)', () => {
  it('node-hover renders the named 28×28 icon trigger; panel-primary the labeled primary button', async () => {
    const hover = makeServices()
    const primary = makeServices()
    const hoverView = render(<SessionLaunchEntry variant="node-hover" t={t.en} task={TASK} services={hover} />)
    const primaryView = render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} services={primary} />)
    // Both variants carry the same English accessible name, so address them by
    // their mount attribute rather than the name.
    const iconTrigger = document.querySelector('[data-mount="node-hover"]') as HTMLButtonElement
    const mainTrigger = document.querySelector('[data-mount="panel-primary"]') as HTMLButtonElement
    expect(iconTrigger).not.toBeNull()
    expect(mainTrigger).not.toBeNull()
    expect(iconTrigger.getAttribute('aria-label')).toBe(en['launch.entry'])
    expect(iconTrigger.style.height).toBe('28px')
    expect(iconTrigger.style.width).toBe('28px')
    expect(mainTrigger.getAttribute('data-mount')).toBe('panel-primary')
    expect(mainTrigger.textContent).toBe(`▶${en['launch.primary']}`)

    // Both mount variants open the SAME confirm dialog and run the same chain.
    for (const trigger of [iconTrigger, mainTrigger]) {
      await waitFor(() => { expect(trigger.disabled).toBe(false) })
      fireEvent.click(trigger)
      expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).not.toBeNull()
      fireEvent.click(document.querySelector('[data-dsh-forge-launch-confirm-cancel]') as HTMLButtonElement)
      expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).toBeNull()
    }
    expect(hover.launch).not.toHaveBeenCalled()
    expect(primary.launch).not.toHaveBeenCalled()
    hoverView.unmount()
    primaryView.unmount()
  })
})

// ---------------------------------------------------------------------------
// Confirm 态 (AC2)
// ---------------------------------------------------------------------------

describe('SessionLaunchEntry: confirm 态 (AC2)', () => {
  it('focuses the confirm button on open — the default-focused control launches (≤1 click)', async () => {
    const { services } = await openConfirm()
    const confirmButton = document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement
    // The confirm button IS the dialog's default focus: in a real browser Enter
    // on it = click (native button semantics); jsdom needs the click dispatched.
    expect(document.activeElement).toBe(confirmButton)
    fireEvent.click(confirmButton)
    await waitFor(() => { expect(services.launch).toHaveBeenCalledTimes(1) })
  })

  it('shows the prompt preview collapsed, verbatim in the DOM, expanding on toggle', async () => {
    await openConfirm()
    const pre = document.querySelector('[data-dsh-forge-launch-prompt]') as HTMLElement
    const toggle = document.querySelector('[data-dsh-forge-launch-prompt-toggle]') as HTMLButtonElement
    // Byte-faithful: leading/trailing whitespace, tabs, blank lines all intact.
    expect(pre.textContent).toBe(VERBATIM_PROMPT)
    expect(pre.style.maxHeight).toBe('96px')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toBe(en['launch.confirm.expand'])
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect((document.querySelector('[data-dsh-forge-launch-prompt]') as HTMLElement).style.maxHeight).toBe('320px')
    expect(toggle.textContent).toBe(en['launch.confirm.collapse'])
  })

  it('carries the target session note: task identity, qualified key, cwd, explanation', async () => {
    await openConfirm()
    const dialog = document.querySelector('[data-dsh-forge-dialog="launch-confirm"]') as HTMLElement
    expect(dialog.textContent).toContain(TASK.title)
    expect(dialog.textContent).toContain(QUALIFIED_KEY)
    expect((document.querySelector('[data-dsh-forge-launch-cwd]') as HTMLElement).textContent).toBe(TASK.codeRoot)
    expect(dialog.textContent).toContain(en['launch.confirm.explain'])
  })

  it('Esc cancels and returns focus to the trigger', async () => {
    const services = makeServices()
    const view = render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} services={services} />)
    await waitFor(() => { expect((screen.getByRole('button', { name: en['launch.primary'] }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: en['launch.primary'] }))
    const card = document.querySelector('[data-dsh-forge-dialog="launch-confirm"]') as HTMLElement
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).toBeNull()
    expect(document.activeElement).toBe(view.container.querySelector('[data-dsh-forge-launch-trigger]'))
    expect(services.launch).not.toHaveBeenCalled()
  })

  it('traps Tab inside the dialog (wrap-around)', async () => {
    await openConfirm()
    const card = document.querySelector('[data-dsh-forge-dialog="launch-confirm"]') as HTMLElement
    const confirmButton = document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement
    const cancelButton = document.querySelector('[data-dsh-forge-launch-confirm-cancel]') as HTMLButtonElement
    // Focus order inside the card: close ✕, expand toggle, cancel, confirm.
    fireEvent.keyDown(card, { key: 'Tab' }) // confirm (last) wraps to first
    const first = document.querySelector('[data-dsh-forge-dialog-close]') as HTMLButtonElement
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(card, { key: 'Tab', shiftKey: true }) // first wraps back to last
    expect(document.activeElement).toBe(confirmButton)
    expect(cancelButton.disabled).toBe(false)
  })

  it('renders the zh copy when the zh seat is passed (locale balance)', async () => {
    const services = makeServices()
    render(<SessionLaunchEntry variant="panel-primary" t={t.zh} task={TASK} services={services} />)
    await waitFor(() => { expect((screen.getByRole('button', { name: zh['launch.primary'] }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: zh['launch.primary'] }))
    expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')?.textContent).toContain(zh['launch.confirm.explain'])
  })

  it('pointer-down inside the card does not dismiss (only the mask dismisses)', async () => {
    await openConfirm()
    const card = document.querySelector('[data-dsh-forge-dialog="launch-confirm"]') as HTMLElement
    fireEvent.pointerDown(card.querySelector('[data-dsh-forge-launch-prompt-toggle]') as HTMLElement)
    expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).not.toBeNull()
    // Shift+Tab from a middle focusable keeps natural order (the trap's no-op
    // branch — jsdom applies no default Tab move, so focus stays put).
    const toggle = card.querySelector('[data-dsh-forge-launch-prompt-toggle]') as HTMLButtonElement
    toggle.focus()
    fireEvent.keyDown(card, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(toggle)
  })

  it('mask pointer-down cancels like Esc (armed outside the initiating phase)', async () => {
    await openConfirm()
    const mask = document.querySelector('[data-dsh-forge-dialog-mask]') as HTMLElement
    fireEvent.pointerDown(mask)
    expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).toBeNull()
  })

  it('Esc while initiating is disarmed — the in-flight launch cannot be dismissed away', async () => {
    const gate = deferred<SessionLaunchResult>()
    const services = makeServices({ launch: vi.fn(() => gate.promise) })
    render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} services={services} />)
    await waitFor(() => { expect((screen.getByRole('button', { name: en['launch.primary'] }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: en['launch.primary'] }))
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement)
    const card = document.querySelector('[data-dsh-forge-dialog="launch-confirm"]') as HTMLElement
    fireEvent.keyDown(card, { key: 'Escape' })
    expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).not.toBeNull()
    gate.resolve(ok('session-late'))
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).toBeNull() })
  })
})

// ---------------------------------------------------------------------------
// Launch chain state machine through the component (AC3/AC4)
// ---------------------------------------------------------------------------

describe('SessionLaunchEntry: launch chain terminals (AC3/AC4)', () => {
  it('success: tier-1 launch posts the prompt byte-faithful, records the link with the QUALIFIED key, then hands over', async () => {
    const onLaunched = vi.fn()
    const { services } = await openConfirm({ onLaunched })
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement)
    // 5.11: the hand-over carries the task ref (the board's badge write key).
    await waitFor(() => { expect(onLaunched).toHaveBeenCalledWith('session-tier1', TASK) })
    expect(services.launch).toHaveBeenCalledTimes(1)
    expect(services.launch).toHaveBeenCalledWith({
      promptText: VERBATIM_PROMPT,
      title: TASK.title,
      cwd: TASK.codeRoot,
    })
    expect(services.recordSessionLink).toHaveBeenCalledWith({
      projectId: TASK.projectId,
      taskKey: QUALIFIED_KEY,
      sessionId: 'session-tier1',
    })
    // Success chain order: the link is recorded BEFORE the view handover.
    expect(services.recordSessionLink.mock.invocationCallOrder[0])
      .toBeLessThan(onLaunched.mock.invocationCallOrder[0])
    // The dialog is gone; the trigger keeps the done state observable.
    expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).toBeNull()
    expect(document.querySelector('[data-dsh-forge-launch-trigger]')?.getAttribute('data-stage')).toBe('done')
  })

  it('initiating: the confirm button shows the spinner label and disables while tier 1 is in flight', async () => {
    const gate = deferred<SessionLaunchResult>()
    const services = makeServices({ launch: vi.fn(() => gate.promise) })
    render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} services={services} />)
    await waitFor(() => { expect((screen.getByRole('button', { name: en['launch.primary'] }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: en['launch.primary'] }))
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement)
    const confirmButton = document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement
    expect(confirmButton.textContent).toContain(en['launch.initiating'])
    expect(confirmButton.disabled).toBe(true)
    expect(document.querySelector('[data-dsh-forge-launch-spinner]')).not.toBeNull()
    expect((document.querySelector('[data-dsh-forge-launch-confirm-cancel]') as HTMLButtonElement).disabled).toBe(true)
    gate.resolve(ok('session-late'))
    // Success closes the dialog and completes the success chain.
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dialog="launch-confirm"]')).toBeNull() })
    await waitFor(() => {
      expect(document.querySelector('[data-dsh-forge-launch-trigger]')?.getAttribute('data-stage')).toBe('done')
    })
  })

  it('degradation: both tiers down + clipboard ok → guidance toast (copied + manual guide), never an error dialog', async () => {
    const services = makeServices({
      launch: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE')),
      launchViaClientChannel: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE')),
    })
    render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} services={services} />)
    await waitFor(() => { expect((screen.getByRole('button', { name: en['launch.primary'] }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: en['launch.primary'] }))
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-launch-toast]')).not.toBeNull() })
    const toast = document.querySelector('[data-dsh-forge-launch-toast]') as HTMLElement
    expect(toast.getAttribute('role')).toBe('status')
    expect(toast.textContent).toContain(en['launch.degraded.copied'])
    expect(toast.textContent).toContain(en['launch.degraded.guide'])
    expect(services.copyPromptToClipboard).toHaveBeenCalledWith(VERBATIM_PROMPT)
    expect(services.bringMainWindowToFront).toHaveBeenCalledTimes(1)
    expect(services.recordSessionLink).not.toHaveBeenCalled()
    expect(document.querySelector('[data-dsh-forge-dialog="launch-error"]')).toBeNull()
    // Dismiss returns the entry to idle.
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-toast-dismiss]') as HTMLButtonElement)
    expect(document.querySelector('[data-dsh-forge-launch-toast]')).toBeNull()
  })

  it('failure: clipboard denied → error dialog (title + reason + recovery copy), retry re-runs the chain', async () => {
    const services = makeServices({
      launch: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE')),
      launchViaClientChannel: vi.fn(async () => channelDown('ERR_SESSION_CHANNEL_UNAVAILABLE')),
      copyPromptToClipboard: vi.fn(async () => false),
    })
    render(<SessionLaunchEntry variant="node-hover" t={t.en} task={TASK} services={services} />)
    await waitFor(() => { expect((screen.getByRole('button', { name: en['launch.entry'] }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: en['launch.entry'] }))
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement)
    await waitFor(() => { expect(document.querySelector('[data-dsh-forge-dialog="launch-error"]')).not.toBeNull() })
    const errorDialog = document.querySelector('[data-dsh-forge-dialog="launch-error"]') as HTMLElement
    expect(errorDialog.getAttribute('role')).toBe('alertdialog')
    expect(errorDialog.textContent).toContain(en['launch.error.title'])
    expect(errorDialog.textContent).toContain(en['launch.error.clipboard'])
    expect(document.querySelector('[data-dsh-forge-launch-error-detail]')?.textContent).toContain('clipboard denied')
    // Retry focuses by default and re-runs the whole chain once more.
    expect(document.activeElement).toBe(document.querySelector('[data-dsh-forge-launch-error-retry]'))
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-error-retry]') as HTMLButtonElement)
    await waitFor(() => { expect(services.launch).toHaveBeenCalledTimes(2) })
    // Close leaves the workbench (idle trigger), launch count untouched since.
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-error-close]') as HTMLButtonElement)
    expect(document.querySelector('[data-dsh-forge-dialog="launch-error"]')).toBeNull()
  })

  it('mock-default entry (no services prop) runs the shared mock face end to end', async () => {
    const onLaunched = vi.fn()
    render(<SessionLaunchEntry variant="panel-primary" t={t.en} task={TASK} onLaunched={onLaunched} />)
    await waitFor(() => { expect((screen.getByRole('button', { name: en['launch.primary'] }) as HTMLButtonElement).disabled).toBe(false) })
    fireEvent.click(screen.getByRole('button', { name: en['launch.primary'] }))
    const pre = document.querySelector('[data-dsh-forge-launch-prompt]') as HTMLElement
    expect(pre.textContent).toBe(MOCK_TASK_PROMPT)
    fireEvent.click(document.querySelector('[data-dsh-forge-launch-confirm-ok]') as HTMLButtonElement)
    await waitFor(() => { expect(onLaunched).toHaveBeenCalledTimes(1) })
  })
})

// ---------------------------------------------------------------------------
// ConfirmPanel unit: the read-only discipline (Hard Rule)
// ---------------------------------------------------------------------------

describe('ConfirmPanel: strictly read-only prompt (Hard Rule)', () => {
  it('renders the prompt as TEXT — no markdown pipeline, no executable content', () => {
    const malicious = '<img src=x onerror=alert(1)><script>never()</script>**bold**\n'
    render(
      <ConfirmPanel
        t={t.en}
        taskTitle="t"
        taskKeyId="f/1.1"
        cwd="Z:\\r"
        promptText={malicious}
        initiating={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const pre = document.querySelector('[data-dsh-forge-launch-prompt]') as HTMLElement
    expect(pre.textContent).toBe(malicious)
    expect(pre.querySelector('img')).toBeNull()
    expect(pre.querySelector('script')).toBeNull()
    expect(pre.innerHTML).not.toContain('<img')
    expect(pre.childElementCount).toBe(0)
  })
})
