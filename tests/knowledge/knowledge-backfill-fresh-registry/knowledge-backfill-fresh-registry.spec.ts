// host-integration-fixes/1.10 · 旅程 C——全新环境装载 knowledge 插件（注册表回填 /
// fail-soft / dsh-forge 零差异回归）Playwright spec（journey = knowledge-backfill-
// fresh-registry，module = knowledge——约定树，desktop-journeys project 发现）。
//
// 断言-契约溯源：每条断言注 CT-KBACKFILL-* 条目 id（契约 =
// .forge/docs/proposals/host-integration-fixes/testing/knowledge-backfill-fresh-registry/
// contracts/knowledge-backfill-fresh-registry.contracts.md）。
//
// 锚核对（契约意向锚 vs 实实现锚——双核对 2026-11-14 @ 4e79d07f；divergence = fix/disc
// 上报，禁止脚本内就地调和；spec 以下列实锚断言）：
//   [实锚吻合] AN-8 = knowledge_registry 落盘面（SQLite knowledge.db，表列
//       ws_path/knowledge_dir/scope——plugins/knowledge/host/service/service.ts:254-268
//       既判机械锚）；AN-11 = knowledge-register diag 缝（既有缝，日志面取证）。
//   [disc-HIF-C-1] AN-9 意向锚 data-dswf-knowledge-entries 未实现——条目容器实锚 =
//       data-dswf-kn-cards（KnowledgeCardGrid.tsx:318 条目卡网格根）+ 卡级
//       data-dswf-entry（:153 e2e 详情锚）。
//   [disc-HIF-C-2] AN-10 意向锚 data-dswf-knowledge-project-missing 未实现——
//       「项目不存在」状态语义锚 = data-dswf-kn-error（KnowledgeCardGrid.tsx:261
//       错误态锚）+ 文案「项目不存在」（service.ts:314 typed 错误语义面经 UI 呈现）。
//       [disc-HIF-C-3] 契约文档本体编码缺陷：contracts 文件为双重编码形态
//       （UTF-8 字节二次编码，readable 但非规范正本）——契约维护面 fix/disc 上报。
//
// 留痕 skip（通道缺失记账——非退役候选，SMOKE-LEDGER §9）：
//   - CT-KBACKFILL-1/2/4（全新环境回填/幂等重启/face 缺席 fail-soft）：全新
//     registry（零项目行）环境需隔离 harness home + 装载通道（真机收口轮构造），
//     共享官方宿主舞台 registry 不可清空重置（破坏性操作）。
//   - CT-KBACKFILL-3（会话中期新注册双态）：②次装载期（重启宿主/重载插件）归
//     舞台管理（官方宿主为 harness 域外进程——a-faces CT-J2-E5 同判例）。
//   - AN-11 diag 日志面取证：emitDiag → main appender 日志文件 = 宿主进程域面，
//     本 harness 无已核销日志定位通道——真机收口轮承载。
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import {
  officialHostStage,
  openOfficialPage,
  installPkgViaPluginManager,
  type OfficialHostStage,
} from '../../web/support/hif-stage.js'
import { KNOWLEDGE_ENTRY } from '../../../e2e/support/anchors.js'

const stage: OfficialHostStage | null = officialHostStage()
test.skip(stage === null, '官方宿主舞台缺席（E2E_OFFICIAL_WEB_URL 未注入）——统一口径 setup 不可伪造，留痕 skip（e2e/SMOKE-LEDGER.md §9）')

test.describe.configure({ mode: 'serial' })

const HERE = fileURLToPath(import.meta.url)
const KNOWLEDGE_PKG_DIR = join(HERE, '..', '..', '..', '..', 'plugins', 'knowledge')
const requireFromCore = createRequire(join(HERE, '..', '..', '..', '..', 'packages', 'core', 'package.json'))

let harness: Awaited<ReturnType<typeof openOfficialPage>>
const setupLog: string[] = []

test.beforeAll(async () => {
  harness = await openOfficialPage(stage as OfficialHostStage)
  await installPkgViaPluginManager(harness.page, stage as OfficialHostStage, KNOWLEDGE_PKG_DIR, '@dsh-forge/knowledge', setupLog)
})

test.afterAll(async () => {
  if (harness !== undefined) await harness.close()
})

// ─── AN-8 落盘面直查（knowledge.db 有界深搜 + knowledge_registry 行读） ───
interface KnowledgeDb {
  prepare(sql: string): { all(...args: unknown[]): unknown[] }
  close(): void
}

function findKnowledgeDb(root: string, depth: number): string | undefined {
  if (depth > 6) return undefined
  let names: string[]
  try {
    names = readdirSync(root)
  } catch {
    return undefined
  }
  for (const name of names) {
    if (name === 'knowledge.db' && root.includes('knowledge')) return join(root, name)
  }
  for (const name of names) {
    const hit = findKnowledgeDb(join(root, name), depth + 1)
    if (hit !== undefined) return hit
  }
  return undefined
}

function registryRows(dshHome: string): readonly { ws_path: string; scope: string }[] | undefined {
  const dbFile = findKnowledgeDb(dshHome, 0)
  if (dbFile === undefined) return undefined
  const Db = requireFromCore('better-sqlite3') as new (path: string) => KnowledgeDb
  const db = new Db(dbFile)
  try {
    return db.prepare('SELECT ws_path, scope FROM knowledge_registry').all() as readonly {
      ws_path: string
      scope: string
    }[]
  } finally {
    db.close()
  }
}

test('@hif-e2e @knowledge-backfill CT-KBACKFILL-5 dsh-forge 宿主零差异回归：行已在座幂等跳过 + 知识页零差异', async () => {
  test.setTimeout(300_000)
  const page = harness.page
  // Input：装载含裁决 6 改动的 knowledge 插件（beforeAll 已装）→ 打开知识页
  const entry = page.locator(KNOWLEDGE_ENTRY).first()
  await expect(entry, 'CT-KBACKFILL-5/INV-C1：装载成功（knowledge 插件面正常——O4 反向）').toBeVisible({ timeout: 30_000 })
  await entry.click({ force: true })
  await page.waitForTimeout(3_000)
  // Output（CT-KBACKFILL-5-O1）：知识视图在座、条目面正常加载（AN-9 实锚——INV-C4 正常态）
  await expect(
    page.locator('[data-dswf-knowledge-view]').first(),
    'CT-KBACKFILL-5-O1：知识视图在座（零白屏）',
  ).toBeVisible({ timeout: 30_000 })
  // AN-8 落盘面对账（env 缺席 = 如实降级单校，不伪造 db 断言）：
  if (stage?.dshHome !== undefined) {
    const rows = registryRows(stage.dshHome)
    test.skip(rows === undefined, 'CT-KBACKFILL-5 前置：knowledge.db 探针缺席（实体库定位零候选）——留痕 skip')
    const all = rows as readonly { ws_path: string; scope: string }[]
    const projectRows = all.filter((r) => r.scope !== 'global')
    expect(
      projectRows.length,
      'CT-KBACKFILL-5/INV-C3：项目行在座（dsh-forge 宿主 boot 回填径既有行——幂等基线）',
    ).toBeGreaterThan(0)
    expect(
      all.some((r) => r.scope === 'global'),
      'CT-KBACKFILL-5：global 行不受回填污染（CT-KBACKFILL-2-O4 同语义负向锚）',
    ).toBe(true)
    const paths = projectRows.map((r) => r.ws_path)
    expect(new Set(paths).size, 'CT-KBACKFILL-5-O2 反向：行键零重复（幂等）').toBe(paths.length)
  } else {
    setupLog.push('CT-KBACKFILL-5 db 对账降级：E2E_OFFICIAL_DSH_HOME 缺席（UI 单校形态，如实标注）')
  }
  // INV-C4 正常加载 + 零未捕获异常（装载异常 = O4 反向）
  expect(harness.consoleErrors.filter((e) => e.startsWith('pageerror')), 'CT-KBACKFILL-5-O4 反向/INV-C1：零未捕获异常').toEqual([])
})

test('@hif-e2e @knowledge-backfill CT-KBACKFILL-1/2/4 全新 registry 回填/幂等重启/face 缺席 fail-soft', async () => {
  test.skip(true, '全新 registry（零项目行）隔离环境构造通道缺席（共享舞台 registry 不可清空重置）——真机收口轮专用，留痕 skip（SMOKE-LEDGER §9）')
})

test('@hif-e2e @knowledge-backfill CT-KBACKFILL-3 会话中期新注册项目双态（中期诚实缺行 + 次装载期补齐）', async () => {
  test.skip(true, '②次装载期（重启宿主/重载插件）归舞台管理（官方宿主 = harness 域外进程）——真机收口轮承载，留痕 skip（SMOKE-LEDGER §9）')
})

