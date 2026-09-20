// @feature dsh-forge-m1 | @web-e2e | @journey desktop-ui-parity
// Traceability: docs/features/dsh-forge-m1/testing/desktop-ui-parity/contracts/step-5-new-session-user-question.md
import { expect, test } from '@playwright/test'
import { launchUpstream, readPersisted } from '../helpers/journeys.ts'

test('step-5/success: new session created, user-question rendered, answer accepted, workflow resumes', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#session-title')).toHaveText('new session')
    // State: new session persisted to the shared store in the upstream format.
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(2)
    expect(persisted.sessions[1]!.created_by).toBe('dsh-forge')
    // Trigger a user-question and answer it (PRD SC7 smoke item).
    await page.locator('#composer').fill('question: which scope?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await page.locator('#answer-input').fill('scope-a')
    await page.locator('#answer-btn').click()
    await expect(page.locator('#user-question')).toBeHidden() // workflow resumed
    await expect(page.locator('#session-history .entry').last()).toContainText('answer:scope-a')
  } finally { await up.close() }
})

test('step-5/user-question-dismissed-without-answer: session stays usable after dismissal', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    await page.locator('#session-list .session-item').first().click()
    await page.locator('#composer').fill('question: which scope?')
    await page.locator('#send-btn').click()
    await expect(page.locator('#user-question')).toBeVisible()
    await page.locator('#dismiss-question-btn').click()
    await expect(page.locator('#question-dismissed')).toBeVisible()
    // No hang, no forced answer, session still interactable.
    await page.locator('#composer').fill('still usable')
    await page.locator('#send-btn').click()
    await expect(page.locator('#session-history .entry').last()).toContainText('assistant: echo: still usable')
  } finally { await up.close() }
})

test('step-5/new-session-creation-failure: failed shared-store write shows in-app error, no partial entry', async () => {
  const up = await launchUpstream()
  try {
    const { page } = up.fixture
    up.state.storageWriteFails = true // OS-level write fault on $DSH_HOME
    await page.locator('#new-session-btn').click()
    await expect(page.locator('#storage-error')).toBeVisible() // visible error, no silent failure
    const persisted = await readPersisted(up.stateFile)
    expect(persisted.sessions).toHaveLength(1) // no partial new-session entry
    expect(persisted.settings).toBeTruthy() // pre-existing data uncorrupted
  } finally { await up.close() }
})
