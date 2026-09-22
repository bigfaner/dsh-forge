import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, test, _electron } from '@playwright/test'

// Skeleton Playwright _electron baseline: proves the Electron binary can be
// launched under the test runner. Real shell journeys land with their tasks.
test('electron app launches and opens a window', async () => {
  const appDir = join(fileURLToPath(new URL('..', import.meta.url)))
  const electronApp = await _electron.launch({
    args: [join(appDir, 'dist', 'main.cjs')],
  })
  const window = await electronApp.firstWindow()
  expect(window).toBeDefined()
  await electronApp.close()
})
