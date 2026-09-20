// disc-1 e2e: upstream web dist missing + first host boot failing → the
// dsh-app://app/ document is the built-in shell fallback (not an empty
// document), so the UF4 crash-recovery overlay reaches its terminal `failed`
// presentation — a visible dialog with the failure reason — instead of the
// blank white window.
import { expect, test } from '@playwright/test'
import { launchFixtureApp } from './helpers/fixture-app.ts'

test('missing web dist + host boot failure → UF4 failed overlay, not a blank window', async () => {
  const fixture = await launchFixtureApp({ webIndexMissing: true, failingHost: true })
  try {
    const { page } = fixture

    // AC: the document is the shell fallback (mount point + status node),
    // served over dsh-app:// — not an empty about-blank body.
    await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 15_000 })
    await expect(page.locator('#dsh-forge-shell-fallback-status')).toBeVisible()

    // AC: main-side recovery reached the terminal failed state over real IPC.
    type RecoveryBridge = { dshForge?: { recovery: { getState: () => Promise<string> } } }
    await expect
      .poll(() => page.evaluate(() => (globalThis as RecoveryBridge).dshForge?.recovery.getState()), { timeout: 20_000 })
      .toBe('failed')

    // AC: the UF4 failed dialog renders (title + reason block + restart).
    const overlay = page.locator('#dsh-forge-crash-recovery')
    await expect(overlay).toBeVisible()
    await expect(overlay.locator('#dfw-crash-title')).toHaveText('连接已中断')
    await expect(overlay.locator('.dfw-crash-status-text')).toHaveText('恢复失败')
    await expect(overlay.locator('.dfw-crash-reason')).not.toHaveText('')
    await expect(overlay.locator('.dfw-crash-restart')).toBeVisible()
  } finally {
    await fixture.close()
  }
})
