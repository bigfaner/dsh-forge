// expert-squad 1.31 旅程 e2e：内置专家与同名遮蔽定制（builtin-expert-lifecycle journey）真机取证——
// journey = .forge/docs/features/expert-squad/testing/builtin-expert-lifecycle/journey.md
// contracts = 同目录 contracts/step-1..5（每 Outcome 一测试 + 一条 happy-path 冒烟）。
// 内置层真机来源 = 随包 experts/（resolvePluginExpertsRoot——scan.ts 三层 root 正门；
// 随包内置 code-reviewer 在 panel-grid run1 实测在场）。project 层 = 夹具工作区
// .dsh/experts/（遮蔽裁决 project > user > plugin——scan.ts PRIORITY 定序）。
// 观测面：面板卡片（呈现裁决）+ 取用 API get（origin 字段——取用裁决）——两处遮蔽
// 裁决一致性同屏取证；包零触碰 = Node 侧包目录文件清单+内容快照比对（step-4）。
// 不落脚本 Outcome（契约层保留，run-tests 台账注记）：builtin-delegatable / step-5
// upgrade 系列（registerRoot 换包与包升级动作在 e2e 载体无通道——插件装载形态由宿主
// 组合承担；升级语义由 registry/scan 单测与结构 pin 承载）、root-declaration-missing
// （registerRoot 缺席装配形态非浏览器可达）、delete-then-dispatch-consistent（派发面
// 需模型通道）。
// 拦截纪律（fix-3 判例）：取用 API 经页面上下文 fetch，不用 page.route。
// Hard Rules：零产品源码改动；夹具 = 仓外 tmp；插件包目录只读。
// e2e-fast-shared-launch 存量迁移（1.5）：共享 launch fixture（e2e/support/fixtures.js B2
// 形态——launchHost 整 spec 一次 + 用例间 tmp 夹具档案重播种 + crash 自动重启续跑）。
// 遮蔽写径（shadowMd 写入/删除）保留在用例内、落 wsDir/.dsh 子树——重播种自然复位。
// @feature expert-squad @web-e2e
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSharedLaunchFixture } from '../support/fixtures.js'
import { expect, type Page } from '@playwright/test'

const PANEL_ROW = 'button[aria-label="专家团"]'
const PANEL_ROOT = '[data-dswf-expert-panel]'
const cardOf = (key: string): string => `.dswf-xcard[data-expert-key="${key}"]`

/** 随包内置专家键（packages/plugins/expert-squad/experts/code-reviewer.md——正本事实） */
const BUILTIN_KEY = 'code-reviewer'
// 包目录以本 spec 文件位置锚定（e2e/specs/ → 仓根两级上），不随 Playwright cwd 漂移
const PLUGIN_PKG_DIR = fileURLToPath(new URL('../../packages/plugins/expert-squad', import.meta.url))
const BUILTIN_SRC = join(PLUGIN_PKG_DIR, 'experts', `${BUILTIN_KEY}.md`)

/** 随包内置档案的 title（遮蔽/回落断言的期望值——以包内正本为期望单源） */
function builtinTitle(): string {
  return /^title: (.+)$/m.exec(readFileSync(BUILTIN_SRC, 'utf8'))?.[1] ?? ''
}

/** project 层遮蔽档案（同键 BUILTIN_KEY，内容可区分） */
function shadowMd(): string {
  return [
    '---',
    `name: ${BUILTIN_KEY}`,
    'description: >-',
    '  Project-layer shadow fixture for builtin shadow e2e.',
    'title: 夹具遮蔽评审·定制版',
    'tools: [read]',
    'skills: [shadow]',
    '---',
    '',
    '## 职责',
    '',
    '遮蔽定制人设正文：与包内内置版内容可区分。',
    '',
  ].join('\n')
}

// ── 共享 launch fixture（spec 级单次 launchHost；夹具重播种 + crash 自动重启） ──
// 基准夹具 = 空 experts 目录；遮蔽档案由各用例内写入（重播种复位）。

function seedWorkspace(dir: string): void {
  mkdirSync(join(dir, '.dsh', 'experts'), { recursive: true })
}

const { test } = createSharedLaunchFixture({
  seedWorkspace,
  workspaceName: 'xsq-shadow-fixture',
})

/** 包目录文件清单+内容快照（step-4 包零触碰比对基准） */
function packageFingerprint(): string {
  const hash = createHash('sha256')
  const expertsDir = join(PLUGIN_PKG_DIR, 'experts')
  for (const name of readdirSync(expertsDir).sort()) {
    hash.update(name)
    hash.update(readFileSync(join(expertsDir, name)))
  }
  return hash.digest('hex')
}

async function installListCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as typeof window & { __xsqListUrls?: string[]; __xsqCaptureInstalled?: boolean }
    if (w.__xsqCaptureInstalled) return
    w.__xsqCaptureInstalled = true
    w.__xsqListUrls = []
    const original = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/api/expert-squad/list')) w.__xsqListUrls?.push(url)
      return original(input as RequestInfo, init)
    }
  })
}

async function captureWorkspaceParam(page: Page): Promise<string> {
  let hit: string | null = null
  await expect
    .poll(
      async () => {
        const urls = await page.evaluate(() => {
          const w = window as typeof window & { __xsqListUrls?: string[] }
          return w.__xsqListUrls ?? []
        })
        hit = urls.reverse().find((url) => url.includes('workspace=')) ?? null
        return hit
      },
      { timeout: 30_000, message: 'list 请求捕获缓冲出现 workspace 参数' },
    )
    .toBeTruthy()
  const match = /workspace=([^&]+)/.exec(hit ?? '')
  if (match === null) throw new Error(`list 请求缺 workspace 参数：${String(hit)}`)
  return decodeURIComponent(match[1])
}

/** 页面上下文取用 API（GET /api/expert-squad/get；非 2xx → ok=false + 文本原因）。 */
async function fetchExpert(page: Page, workspace: string, key: string): Promise<{ ok: boolean; body: unknown; text: string }> {
  return page.evaluate(async ({ ep, payload }) => {
    const response = await fetch(`${ep}?key=${encodeURIComponent(payload.key)}&workspace=${encodeURIComponent(payload.workspace)}`)
    const text = await response.text()
    let body: unknown = null
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = null
    }
    return { ok: response.ok, body, text }
  }, { ep: '/api/expert-squad/get', payload: { workspace, key } })
}

/** 用例内导航收敛（共享会话每用例执行——捕获器安装 + 面板数据态）。 */
async function openPanel(page: Page): Promise<void> {
  await installListCapture(page)
  const row = page.locator(PANEL_ROW)
  await expect(row, '左栏「专家团」行在场').toBeVisible({ timeout: 30_000 })
  await row.click()
  await expect(page.locator(PANEL_ROOT), '专家面板挂载').toBeVisible({ timeout: 30_000 })
  await expect(page.locator(cardOf(BUILTIN_KEY)), '内置专家卡在场（开箱即用）').toBeVisible({ timeout: 30_000 })
}

// ── step-1 success：内置专家同呈可用 ──

test('@feature expert-squad shadow step-1：内置专家开箱即用——面板在场，取用 origin=plugin', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page } = sharedLaunch
  await openPanel(page)
  const wsParam = await captureWorkspaceParam(page)
  await expect(page.locator(cardOf(BUILTIN_KEY)).locator('.xc-name'), '内置卡名称').toHaveText(BUILTIN_KEY)
  const got = await fetchExpert(page, wsParam, BUILTIN_KEY)
  expect(got.ok, `内置专家可取用（${got.text}）`).toBe(true)
  const entry = got.body as { origin?: string; enabled?: boolean; name?: string }
  expect(entry.origin, 'origin=plugin（plugin 层 root 扫描产物）').toBe('plugin')
  expect(entry.enabled, '启用态（开箱即用）').toBe(true)
  expect(entry.name, 'name = 键正本').toBe(BUILTIN_KEY)
})

// ── step-2/3 success：project 层同名遮蔽——面板与取用双裁决一致 ──

test('@feature expert-squad shadow step-2/3：同名遮蔽命中定制版——聚组展示（生效卡为 project 卡 + 多来源对比钮/Dialog 具名对比态）+ origin=project', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page, wsDir } = sharedLaunch
  await openPanel(page)
  const wsParam = await captureWorkspaceParam(page)
  writeFileSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`), shadowMd())
  // 聚组呈现裁决（1.60 用户裁决）：同键全层承载于单卡——生效卡（project 定制）+ 多来源对比钮/对比 Dialog（f0536f25 摘要行退役）
  const group = page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"]`)
  await expect(group, '聚组容器在场').toBeVisible({ timeout: 30_000 })
  await expect(group.locator('.xg-cnt'), '组内来源数标注').toHaveText('2 个来源')
  const effectiveCard = group.locator(`${cardOf(BUILTIN_KEY)}[data-effective="true"]`)
  await expect(effectiveCard.locator('.xc-title'), '生效卡呈 project 层定制岗位').toContainText('夹具遮蔽评审·定制版')
  await expect(effectiveCard.locator('.eff-badge'), '卡片无「生效」标（1.68 裁决③）').toHaveCount(0)
  await expect(effectiveCard.locator('.origin-badge.origin-project'), '生效卡来源角标·项目').toContainText('项目')
  await expect(effectiveCard.locator('.xc-creed'), '呈定制人设摘要').toContainText('遮蔽定制人设正文')
  // 被遮蔽内置来源承载（f0536f25 摘要行退役）：多来源卡内「对比」钮，点击直开详情
  // Dialog 对比态（差异承载面裁决 2026-10-26——差异一律 Dialog 承载）
  const compareBtn = group.locator(`button[aria-label="对比 ${BUILTIN_KEY} 其它来源"]`)
  await expect(compareBtn, '多来源对比钮在场（摘要行退役——卡内对比承载）').toBeVisible()
  await compareBtn.click()
  const dialog = page.locator('[data-dswf-detail-dialog]')
  await expect(dialog, '详情 Dialog 打开').toBeVisible()
  await expect(dialog.locator('.dswf-xcompare'), 'Dialog 对比态（字段对齐表）').toBeVisible()
  // 6da4a152 具名化：内置多来源角标呈「内置 · <插件名>」——具名角标现承载于对比对象
  // pick-list（.dswf-cmp-opt 内 origin-badge）；code-reviewer 随包正本在 expert-squad
  // 包 experts/（spec 头部正本事实）→ 具名 = 「内置 · expert-squad」
  await expect(dialog.locator('.dswf-cmp-pick-list .dswf-cmp-opt .origin-badge.origin-plugin'), '对比对象源角标·内置具名').toContainText('内置 · expert-squad')
  await expect(dialog.locator('td.diff').first(), '差异格高亮在场').toBeVisible()
  // 取用裁决：origin=project（与面板生效标一致——遮蔽裁决两处一致）
  await expect
    .poll(async () => {
      const got = await fetchExpert(page, wsParam, BUILTIN_KEY)
      return (got.body as { origin?: string } | null)?.origin ?? ''
    }, { timeout: 30_000, message: '取用 origin 换代为 project' })
    .toBe('project')
})

// ── step-4 success + plugin-package-untouched：删除回落内置版，包零触碰 ──

test('@feature expert-squad shadow step-4：删定制回落内置版；插件包目录逐字零触碰', async ({ sharedLaunch }) => {
  test.setTimeout(180_000)
  const { page, wsDir } = sharedLaunch
  await openPanel(page)
  const wsParam = await captureWorkspaceParam(page)
  const expectedTitle = builtinTitle()
  // 前置：遮蔽生效（聚组：生效卡在 project 层 + 多来源对比钮在场）
  writeFileSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`), shadowMd())
  await expect(page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"] ${cardOf(BUILTIN_KEY)}[data-effective="true"] .xc-title`), '遮蔽生效前置').toContainText('夹具遮蔽评审·定制版', {
    timeout: 30_000,
  })
  // 删除定制档案（只动 project 层）→ 回落内置（组退化为单来源，对比钮退场）
  const fingerprintBefore = packageFingerprint()
  rmSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`))
  await expect(page.locator(`${cardOf(BUILTIN_KEY)} .xc-title`), '面板回落内置岗位').toContainText(expectedTitle, {
    timeout: 30_000,
  })
  await expect(page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"] button[aria-label="对比 ${BUILTIN_KEY} 其它来源"]`), '对比钮退场（单来源组）').toHaveCount(0)
  await expect
    .poll(async () => {
      const got = await fetchExpert(page, wsParam, BUILTIN_KEY)
      return (got.body as { origin?: string } | null)?.origin ?? ''
    }, { timeout: 30_000, message: '取用回落 origin=plugin' })
    .toBe('plugin')
  // 包零触碰：包 experts/ 清单+内容逐字不变
  expect(packageFingerprint(), '插件包 experts/ 目录指纹不变（定制不回写包）').toBe(fingerprintBefore)
})

// ── Journey 冒烟（恰一条——内置在场 → 遮蔽 → 回落全依序） ──

test('@feature expert-squad shadow 冒烟：内置在场 → project 遮蔽单卡 → 删除回落内置', async ({ sharedLaunch }) => {
  test.setTimeout(240_000)
  const { page, wsDir, pageErrors } = sharedLaunch
  // 步骤1：内置在场（openPanel 已收敛）；另备一枚对照卡
  await openPanel(page)
  await expect(page.locator(cardOf(BUILTIN_KEY))).toBeVisible()
  // 步骤2-3：遮蔽定制（聚组：生效卡在 project 层，多来源对比钮在场——摘要行退役）
  writeFileSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`), shadowMd())
  const group = page.locator(`.dswf-xgroup[data-expert-key="${BUILTIN_KEY}"]`)
  await expect(group.locator(`${cardOf(BUILTIN_KEY)}[data-effective="true"] .xc-title`), '遮蔽定制卡（生效位）').toContainText('夹具遮蔽评审·定制版', {
    timeout: 30_000,
  })
  await expect(group.locator(`button[aria-label="对比 ${BUILTIN_KEY} 其它来源"]`), '多来源对比钮在场').toBeVisible()
  // 步骤4：删除回落（单来源组，对比钮退场）
  rmSync(join(wsDir, '.dsh', 'experts', `${BUILTIN_KEY}.md`))
  await expect(page.locator(`${cardOf(BUILTIN_KEY)} .xc-title`), '回落内置岗位').toContainText(builtinTitle(), {
    timeout: 30_000,
  })
  await expect(group.locator(`button[aria-label="对比 ${BUILTIN_KEY} 其它来源"]`), '对比钮退场').toHaveCount(0)
  // 不变量：renderer 零未捕获异常
  expect(pageErrors, 'renderer 零未捕获异常').toEqual([])
})
