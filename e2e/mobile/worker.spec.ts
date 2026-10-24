// @feature:mobile-ui
// 1.17 worker 会话双形态 e2e（mobile project——390×844 触摸移动 UA）：
// 真组件 createWorkerListView + createWorkerSessionView（worker-entry.ts 探针入口）。
// AC：workers 列表 = 官方 session.list 视图过滤（parentSessionId + origin subagent——
// 异父/非 worker 行不出现）· mode/label 取父会话 subagent/catalog 投影 + activity 取
// SessionSummary.running · one-shot 只读无发送入口 / continuable composer 注入下一轮
// （prompt steer）· 模式只读继承 · ← 图标退出 · 流式镜像帧瞬态行。
// 截图归档 .forge/docs/proposals/mobile-ui/walkthrough/1-17-worker/（留盘不进 git）。
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const WORKTREE = join(fileURLToPath(import.meta.url), '..', '..', '..')
const OUT_DIR = join(fileURLToPath(import.meta.url), '..', 'test-artifacts')
const WALKTHROUGH_DIR = join(
  WORKTREE,
  '.forge',
  'docs',
  'proposals',
  'mobile-ui',
  'walkthrough',
  '1-17-worker',
)

declare global {
  interface Window {
    __probe: {
      openList(): void
      openWorker(id: string): void
      pushFrame(event: unknown): void
      exitCurrent(): void
      prompted: { sessionId: string; text: string }[]
    }
  }
}

/** 探针页面构建（esbuild 内联单文件——run-once，无 watch）。 */
async function buildProbePage(): Promise<string> {
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(WALKTHROUGH_DIR, { recursive: true })
  const { build } = createRequire(join(WORKTREE, 'apps', 'mobile', 'package.json'))('esbuild')
  const result = await build({
    entryPoints: [join(WORKTREE, 'e2e', 'mobile', 'worker-entry.ts')],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
  })
  const css = readFileSync(join(WORKTREE, 'apps', 'mobile', 'src', 'style.css'), 'utf8')
  const html = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<style>${css}</style>`,
    '</head>',
    '<body><div id="app"></div>',
    `<script>${result.outputFiles[0]!.text}</script>`,
    '</body>',
    '</html>',
  ].join('\n')
  const htmlPath = join(OUT_DIR, 'worker-probe.html')
  writeFileSync(htmlPath, html, 'utf8')
  return htmlPath
}

test('worker 双形态：列表过滤 + catalog 投影 + 子会话流（one-shot 只读 / continuable 可发送）', async ({ page }) => {
  const htmlPath = await buildProbePage()
  await page.goto(`file:///${htmlPath.replaceAll('\\', '/')}`)

  // ── 列表形态：官方 session.list 视图过滤——只出本父会话的 subagent 行 ──
  const rows = page.locator('.worker-row')
  await expect(rows).toHaveCount(2)
  // 异父（w-foreign）与 origin user（plain/main）不出现
  await expect(page.locator('.worker-row')).not.toContainText(['w-foreign'])
  // mode/label 取 catalog 投影；activity 取 running
  const continuable = rows.filter({ hasText: '评审提案工程可行性' })
  await expect(continuable).toHaveCount(1)
  await expect(continuable.locator('.wk-mode')).toHaveText('可续聊')
  await expect(continuable.locator('.wk-act')).toHaveText('运行中')
  const oneshot = rows.filter({ hasText: '跑定向测试' })
  await expect(oneshot).toHaveCount(1)
  await expect(oneshot.locator('.wk-mode')).toHaveText('一次性')
  await expect(oneshot.locator('.wk-act')).toHaveText('已结束')
  // running 置前（continuable 行在 one-shot 行之上）
  const cBox = await continuable.boundingBox()
  const oBox = await oneshot.boundingBox()
  expect(cBox!.y).toBeLessThan(oBox!.y)
  await page.screenshot({ path: join(WALKTHROUGH_DIR, 'impl-worker-list.png') })

  // ── continuable 子会话流：镜像帧渲染消息流 + composer 注入下一轮 ──
  await continuable.click()
  const face = page.locator('.worker-session-face')
  await expect(face.locator('.topbar .title')).toContainText('评审提案工程可行性')
  await expect(face.locator('.topbar .wk-mode')).toHaveText('可续聊')
  await expect(face.locator('.view')).toContainText('评审结论：链路成立，可续聊注入下一轮确认。')
  // 模式/worktree 只读继承（composer chip disabled）
  await expect(face.locator('.composer .plugin.disabled')).toHaveCount(1)
  const input = face.locator('.composer input')
  await input.fill('请复核第 2 条结论')
  await face.locator('.composer .send').click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __probe: { prompted: { sessionId: string; text: string }[] } }).__probe.prompted),
    )
    .toEqual([{ sessionId: 'w-continuable', text: '请复核第 2 条结论' }])
  await page.screenshot({ path: join(WALKTHROUGH_DIR, 'impl-worker-continuable.png') })

  // 流式镜像帧：assistant/live-chunk 出瞬态行
  await page.evaluate(() => {
    ;(window as unknown as { __probe: { pushFrame(e: unknown): void } }).__probe.pushFrame({
      type: 'assistant/live-chunk',
      seq: 3,
      time: 3,
      data: { attemptId: 'a1', chunk: { type: 'text-delta', text: '流式增量回复中…' } },
    })
  })
  await expect(face.locator('.view')).toContainText('流式增量回复中…')

  // ← 图标退出 → 回列表
  await face.locator('.topbar .iconbtn').first().click()
  await expect(page.locator('.worker-list-face')).toBeVisible()

  // ── one-shot 只读：无发送入口 ──
  await oneshot.click()
  const oneFace = page.locator('.worker-session-face')
  await expect(oneFace.locator('.topbar .title')).toContainText('跑定向测试')
  await expect(oneFace.locator('.topbar .wk-mode')).toHaveText('一次性')
  await expect(oneFace.locator('.view')).toContainText('一次性产出：17/17 通过。')
  await expect(oneFace.locator('.composer')).toHaveCount(0)
  await expect(oneFace.locator('.worker-readonly-hint')).toContainText('只读')
  await page.screenshot({ path: join(WALKTHROUGH_DIR, 'impl-worker-oneshot.png') })
  // ← 退出
  await oneFace.locator('.topbar .iconbtn').first().click()
  await expect(page.locator('.worker-list-face')).toBeVisible()
})
