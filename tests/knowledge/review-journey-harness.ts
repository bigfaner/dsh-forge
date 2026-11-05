// knowledge-review-ui 旅程 e2e 共通夹具/装载（journey.md「共通锚与口径」的 e2e 侧承载）：
// - corpus 预播：{wsDir}/.knowledge/<域>/<slug>.md frontmatter 驱动（status 直书 confirmed
//   —— parser.ts 同键解析，预置 confirmed 条目不经通道注入）；
// - 装载：boot1 RPC 直注注册（registerProject——运行期 projectId）→ 停机窗落插件自持库
//   注册行 + config.projects 绑定叠层 → boot2（叠层携带）→ 知识视图锚定 + 浏览面就绪；
// - 取证：走查截图统一落 E2E_EVIDENCE_DIR（任务日志产物目录——过程产物不进 git）。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { closeApp, launchHost, stablePhase, type Launched } from '../../e2e/support/launch.js'
import { registerProject } from '../../e2e/support/rpc.js'
import {
  openKnowledgeDb,
  seedKnowledgeRegistryRow,
  writeKnowledgeBindingsOverlay,
} from '../../e2e/support/knowledge-db.js'
import { KNOWLEDGE_ENTRY, KNOWLEDGE_VIEW } from '../../e2e/support/anchors.js'
import type { SeedDb } from '../../packages/core/src/testutil/db-seeds.js'

/** corpus 条目规格（id = frontmatter slug——DB slug 键断言锚；domain = 落点目录段） */
export interface CorpusEntry {
  readonly domain: string
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly keywords: readonly string[]
  /** 缺省 unconfirmed；'confirmed' 直书 frontmatter（预置已确认条目） */
  readonly status?: 'confirmed'
  readonly body?: string
}

/** 预播 corpus（{root}/demo-proj/.knowledge/<域>/<id>.md）——返回 wsDir 供注册/清理 */
export function makeReviewCorpus(entries: readonly CorpusEntry[]): { root: string; wsDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kreview-'))
  const wsDir = join(root, 'demo-proj')
  for (const e of entries) {
    const dir = join(wsDir, '.knowledge', e.domain)
    mkdirSync(dir, { recursive: true })
    const front = [
      '---',
      `id: ${e.id}`,
      `title: ${e.title}`,
      `summary: ${e.summary}`,
      'keywords:',
      ...e.keywords.map((k) => `  - ${k}`),
      ...(e.status === 'confirmed' ? ['status: confirmed'] : []),
      '---',
      '',
      `# ${e.title}`,
      '',
      e.body ?? `${e.summary}。`,
      '',
    ].join('\n')
    writeFileSync(join(dir, `${e.id}.md`), front, 'utf8')
  }
  return { root, wsDir }
}

export interface ReviewLaunch {
  readonly app: Launched['app']
  readonly page: Page
  readonly projectId: string
  readonly userData: string
  readonly root: string
  readonly overlayPath: string
}

/**
 * 双 boot 装载（knowledge-integration 组二同径——RPC 直注注册替代向导走查）：
 * boot1 注册取运行期 projectId → 停机窗注册行 + 绑定叠层 → boot2 锚定装载。
 */
export async function bootKnowledgeReview(o: {
  readonly wsDir: string
  /** 预置热度事件（title → 次数——驳回后 recall_logs 保留断言供数） */
  readonly heatSeeds?: readonly { readonly entryTitle: string; readonly count: number }[]
}): Promise<ReviewLaunch> {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-kreview-ud-'))
  const boot1 = await launchHost({ userData })
  let projectId: string
  try {
    await stablePhase(boot1.page)
    const row = await registerProject(boot1.page, o.wsDir, 'demo-proj')
    projectId = row.id
  } finally {
    await closeApp(boot1.app)
  }
  {
    const db: SeedDb = openKnowledgeDb(userData)
    try {
      seedKnowledgeRegistryRow(db, o.wsDir, join(o.wsDir, '.knowledge'))
      for (const seed of o.heatSeeds ?? []) {
        const entry = db.prepare('SELECT rowid AS id FROM knowledge_entries WHERE title = ?').get(seed.entryTitle) as
          | { id: number }
          | undefined
        // 注册窗尚未 rebuild（索引首装在 boot2 首次 listEntries）——热度预置延后到 boot2 后页内执行
        void entry
      }
    } finally {
      db.close()
    }
  }
  const overlayPath = writeKnowledgeBindingsOverlay([{ wsPath: o.wsDir, projectId }])
  const boot2 = await launchHost({ userData, overlay: overlayPath, stablePhase: 'probe' })
  // 热度事件预置（条目已在 boot2 首装索引内——按 title 直查 rowid 落 recall_logs）
  if ((o.heatSeeds ?? []).length > 0) {
    const db: SeedDb = openKnowledgeDb(userData)
    try {
      for (const seed of o.heatSeeds ?? []) {
        const entry = db.prepare('SELECT rowid AS id FROM knowledge_entries WHERE title = ?').get(seed.entryTitle) as
          | { id: number }
          | undefined
        if (entry === undefined) throw new Error(`热度预置：条目不在索引（${seed.entryTitle}）`)
        const insert = db.prepare(
          `INSERT INTO knowledge_recall_logs (project_id, call_id, session_id, verb, entry_id, title_snap, domain_snap, hit_count, created_at)
           VALUES (?, ?, 'e2e-seed-session', 'search', ?, ?, '前端', 1, ?)`,
        )
        for (let i = 0; i < seed.count; i++) {
          insert.run(projectId, `e2e-seed-${seed.entryTitle}-${i}`, entry.id, seed.entryTitle, new Date().toISOString())
        }
      }
    } finally {
      db.close()
    }
  }
  await openKnowledgeView(boot2.page)
  return { app: boot2.app, page: boot2.page, projectId, userData, root: o.wsDir, overlayPath }
}

/** 知识视图锚定 + 浏览面就绪（锚非 none + 卡片网格在场） */
export async function openKnowledgeView(page: Page): Promise<void> {
  await page.locator(KNOWLEDGE_ENTRY).first().click()
  const knowledgeView = page.locator(KNOWLEDGE_VIEW).first()
  await expect(knowledgeView).toBeVisible()
  await expect
    .poll(async () => knowledgeView.getAttribute('data-dswf-kn-anchor'), { timeout: 30_000 })
    .not.toBe('none')
  await expect(page.locator('[data-dswf-kn-browse]').first()).toBeVisible({ timeout: 30_000 })
}

/** 装载清理（app 停机 + 夹具/叠层/userData 全清） */
export async function teardownReview(l: ReviewLaunch | undefined, extraDirs: readonly string[] = []): Promise<void> {
  if (l !== undefined) {
    await closeApp(l.app)
    rmSync(l.overlayPath, { force: true })
    rmSync(l.userData, { recursive: true, force: true })
    rmSync(l.root, { recursive: true, force: true })
  }
  for (const dir of extraDirs) rmSync(dir, { recursive: true, force: true })
}

/** 走查截图（E2E_EVIDENCE_DIR 落盘——过程产物，不进 git） */
export async function evidenceShot(page: Page, name: string): Promise<void> {
  const dir = process.env.E2E_EVIDENCE_DIR
  if (dir === undefined || dir === '') return
  mkdirSync(dir, { recursive: true })
  // 尽力取证（electron 截图偶发挂起——失败不阻断旅程链，trace 为兜底证据）
  try {
    await page.screenshot({ path: join(dir, name), timeout: 15_000 })
  } catch {
    // 取证尽力而为
  }
}

/** 打开插件自持库（userData 派生位——单源 paths.ts） */
export function openReviewDb(userData: string): SeedDb {
  return openKnowledgeDb(userData)
}
