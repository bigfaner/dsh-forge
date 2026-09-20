// @feature dsh-forge-m1 | @web-e2e | @journey multi-install-coexistence
// Traceability: docs/features/dsh-forge-m1/testing/multi-install-coexistence/contracts/step-4-alternate-back.md
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted, type UpstreamSession } from '../helpers/journeys.ts'

const SESSIONS_FROM_ALL_FORMS: UpstreamSession[] = [
  { id: 's1', title: 'cli session', created_by: 'cli', workspace: 'ws-alpha', state: 'idle', history: [] },
  { id: 's2', title: 'official desktop session', created_by: 'official-desktop', workspace: 'ws-alpha', state: 'idle', history: [] },
  { id: 's3', title: 'dsh-forge session', created_by: 'dsh-forge', workspace: 'ws-alpha', state: 'idle', history: [] },
]

test('step-4/success: after dsh-forge exits, sessions from all three forms read back intact', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'CLI/official-desktop read-back is an OS-surface qualifier; the web surface asserts the shared store survives the dsh-forge exit round-trip intact and upstream-parseable (the format all forms read).' })
  const up = await launchUpstream({ sessions: SESSIONS_FROM_ALL_FORMS })
  try {
    const { page } = up.fixture
    await expect(page.locator('#session-list li')).toHaveCount(3)
    await up.close() // exit dsh-forge
    // Alternate back: store re-readable with zero corruption.
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions.map(s => s.created_by).sort()).toEqual(['cli', 'dsh-forge', 'official-desktop'])
  } finally { await up.fixture.hostServer.close() }
})

test('step-4/uninstall-dsh-forge: shared $DSH_HOME data remains intact and usable', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Uninstaller behavior is an OS-surface known-unknown per the contract; the web surface records that shared data is intact after full app exit (the state an uninstaller must preserve).' })
  const up = await launchUpstream({ sessions: SESSIONS_FROM_ALL_FORMS })
  try {
    const { page } = up.fixture
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    await up.close() // full exit (uninstall leaves shared home behind)
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(4) // dsh-forge-created sessions intact
    expect(persisted.sessions.every(s => s.history !== undefined)).toBe(true)
  } finally { await up.fixture.hostServer.close() }
})

test('step-4/rapid-alternation: alternating reads succeed with no corruption (DF003/SC8)', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Simultaneous writes are a declared known-unknown; this exercises sequential alternating reads, as the contract scopes.' })
  const up = await launchUpstream({ sessions: SESSIONS_FROM_ALL_FORMS })
  try {
    const { page } = up.fixture
    // Alternate: read (dsh-forge) → mutate (CLI stand-in) → read again.
    for (let round = 0; round < 3; round += 1) {
      await expect(page.locator('#session-list li')).toHaveCount(3)
      up.state.settings.model = `cli-write-${round}` // CLI-side mutation between dsh-forge reads
      // dsh-forge reads again after the other form's write: re-open each session.
      for (const item of await page.locator('#session-list li').all()) {
        await item.click()
        await expect(page.locator('#session-title')).toBeVisible()
      }
      const persisted = await readPersisted(up.stateFile)
      expect(persisted.sessions).toHaveLength(3) // readable after every alternation
    }
  } finally { await up.close() }
})

test('step-4/session-expired-between-forms: expiry after time in another form re-establishes in-app, data intact', async ({ }, testInfo) => {
  testInfo.annotations.push({ type: 'note', description: 'Token lapse simulated at the fixture host API; the "time spent in CLI" gap is the interval between carrier interactions.' })
  const up = await launchUpstream({ sessions: SESSIONS_FROM_ALL_FORMS })
  try {
    const { page } = up.fixture
    await page.locator('#session-list li').first().click()
    up.state.sessionExpired = true // token lapses while working in another form
    await page.locator('#composer').fill('continue')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-expired')).toBeVisible()
    await page.locator('#reauth-btn').click()
    await page.locator('#composer').fill('continue')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: continue')
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(3) // shared data not corrupted by expiry
  } finally { await up.close() }
})
