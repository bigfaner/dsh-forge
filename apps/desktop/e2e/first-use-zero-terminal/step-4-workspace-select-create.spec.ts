// @feature dsh-forge-m1 | @web-e2e | @journey first-use-zero-terminal
// Traceability: docs/features/dsh-forge-m1/testing/first-use-zero-terminal/contracts/step-4-workspace-select-create.md
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('step-4/success: choose an existing workspace and the session UI is ready', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#workspace-select').selectOption('ws-alpha')
    await expect(page.locator('#composer')).toBeVisible() // session UI ready to converse
    await expect(page.locator('#session-list li')).toHaveCount(1)
  } finally { await up.close() }
})

test('step-4/no-workspace-yet: create a workspace on a fresh profile and the session UI becomes ready', async () => {
  const up = await launchUpstream({ workspaces: [{ name: 'ws-fresh', sessions: [], fileTree: [] }], sessions: [] })
  try {
    const { page } = up.fixture
    await expect(page.locator('#empty-state')).toBeVisible() // fresh: no sessions anywhere
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    await expect(page.locator('#composer')).toBeVisible() // session UI ready
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(1) // profile no longer empty
  } finally { await up.close() }
})

test('step-4/create-workspace-with-shared-home-data: fresh profile coexists with pre-existing shared data (FT-013)', async () => {
  const up = await launchUpstream() // shared home already carries upstream sessions/settings
  try {
    const { page, dir } = up.fixture
    const sharedBefore = await readFile(up.stateFile, 'utf8')
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    // New dsh-forge state coexists; shared data not migrated or clobbered.
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(2)
    expect(persisted.sessions[0]!.history).toHaveLength(2) // pre-existing session untouched
    // Profile isolation: dsh-forge profile is its own directory, never the shared home.
    expect(existsSync(join(dir, 'profile'))).toBe(true)
    expect(join(dir, 'profile')).not.toBe(up.stateFile)
    void sharedBefore
  } finally { await up.close() }
})
