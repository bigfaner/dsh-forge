// 旅程④ knowledge-review-domain-tree——web 域树拖拽改域 + 新建目录 + 待审核徽记
// （journey.md J4-1~J4-4；契约溯源：CT-EA-6 move / CT-EA-8 createDomain / CT-EA-7 domain-depth）。
// 覆盖：域树缺省常展开、徽记 = 未过滤口径（域行数字形态）、拖拽改域全链（卡片归入 B 域 +
// 文件实际 rename 至 B 目录 + DB domain_path 与文件落点一致 + status 不变 + 树/徽记即时刷新）、
// 树头「＋」新建目录即时在场（可接收落卡）、>3 层拒收（createDomain 径——客户端预检提示留
// 编辑行、树零变化）、同域 move 幂等零副作用、非域行（根行）非落点反向锚（data-dswf-kn-drop
// 不在场）、徽记与 statusFilter 正交（过滤结果集变而徽记不抖动）。
// 断言-契约溯源标注：各断言行内注明 journey 条目（J4-x）与契约条目（CT-EA-x）。
// 降级注记：move 径 >3 层拒收（journey 边界 2）在 UI 下无合法构造——落点域行集合由
// createDomain ≤3 层校验约束，域树不可能渲染出 >3 层目标行；该径归服务面单测（review.ts
// domain-depth 三径同函数已由包内单测承载），本 spec 文件头注记（journey.md 故障注入降级口径）。
// diag 面（knowledge-entry-move）归 host 日志域，本套件不取（同旅程①③口径）。
// 真机取证证据落 E2E_EVIDENCE_DIR（任务日志）。
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  bootKnowledgeReview,
  evidenceShot,
  makeReviewCorpus,
  openReviewDb,
  teardownReview,
  type CorpusEntry,
  type ReviewLaunch,
} from '../review-journey-harness.js'

test.setTimeout(600_000)

// ── 查询面（插件自持库——状态语义断言，不锁实现）─────────────────────────────

interface EntryRow {
  readonly rid: number
  readonly slug: string
  readonly status: string
  readonly domainPath: string
}

function entryByTitle(db: import('../../../packages/core/src/testutil/db-seeds.js').SeedDb, title: string): EntryRow {
  const row = db
    .prepare('SELECT rowid AS rid, id AS slug, status, domain AS domainPath FROM knowledge_entries WHERE title = ?')
    .get(title) as EntryRow | undefined
  expect(row, `条目在索引（${title}）`).toBeDefined()
  return row as EntryRow
}

function fileOf(wsDir: string, domain: string, slug: string): string {
  return join(wsDir, '.knowledge', domain, `${slug}.md`)
}

// ── UI 面（稳定 data 属性锚——不断视觉坐标、不锁文案字面与 DOM 层级）──────────

/** 域树行（data-dswf-domain = 域路径——'' = 全部域根行） */
function treeRow(page: Page, domainPath: string): Locator {
  return page.locator(`[data-dswf-kn-tree] [data-dswf-domain="${domainPath}"]`)
}

/** 待审核徽记（官方 Tag warning——未过滤口径计数） */
function rowBadge(page: Page, domainPath: string): Locator {
  return treeRow(page, domainPath).locator('.dswf-kn-dom-badge')
}

function card(page: Page, title: string): Locator {
  return page.locator('[data-dswf-entry]', { hasText: title }).first()
}

/** 卡片落点域（foot 域段文本——domain 唯一事实源 = 文件落点的 UI 投影） */
function cardDomain(page: Page, title: string): Locator {
  return card(page, title).locator('.dswf-kn-card-dom')
}

function statusChip(page: Page, value: string): Locator {
  return page.locator(`[data-dswf-kn-statuschip="${value}"]`)
}

/**
 * 卡片 → 域行拖拽（HTML5 DnD 事件链驱动：dragstart → dragover → drop，
 * dataTransfer 携带卡片 entryId——DomainTree 落点侧同键约定 'text/knowledge-entry' /
 * 'text/plain' 兜底）。经 DOM 事件链驱动真实 onDragOver/onDrop handler。
 */
async function dragCardTo(page: Page, cardTitle: string, targetDomainPath: string): Promise<void> {
  await page.evaluate(
    (arg) => {
      const { title, target } = arg as { title: string; target: string }
      const cardEl = [...document.querySelectorAll('[data-dswf-entry]')].find((el) => el.textContent?.includes(title))
      if (cardEl === undefined) throw new Error(`拖拽源卡片不在场（${title}）`)
      const targetEl = document.querySelector(`[data-dswf-kn-tree] [data-dswf-domain="${target}"]`)
      if (targetEl === null) throw new Error(`拖拽落点域行不在场（${target}）`)
      const dt = new DataTransfer()
      const entryId = cardEl.getAttribute('data-dswf-entry') ?? ''
      // 源侧同键约定（KnowledgeCardGrid dragstart——若源侧 handler 缺席则 dt 为空，
      // 落点侧按契约零动作——本断言链即红）
      cardEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      dt.setData('text/knowledge-entry', entryId)
      dt.setData('text/plain', entryId)
      targetEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
      targetEl.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
    },
    { title: cardTitle, target: targetDomainPath },
  )
}

// ── corpus（旅程④口径：A/B 两域 + unconfirmed/confirmed 混合 + 徽记供数）──────

const J4_CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'j4-a1', title: '域树前端待审一', summary: 'A 域待审条目一', keywords: ['前端', '一'] },
  { domain: '前端', id: 'j4-a2', title: '域树前端待审二', summary: 'A 域待审条目二', keywords: ['前端', '二'] },
  { domain: '前端', id: 'j4-c1', title: '域树前端已确认', summary: 'A 域已确认条目', keywords: ['前端', '已确认'], status: 'confirmed' },
  { domain: '后端', id: 'j4-b1', title: '域树后端待审一', summary: 'B 域待审条目', keywords: ['后端', '一'] },
]

// ─────────────────────────────────────────────────────────────────────────────
// J4·Golden 1-3（J4-1 / CT-EA-6 move）：域树常展开 + 徽记未过滤口径 → 拖拽改域全链
// （卡片归 B 域 / 文件 rename / DB 与落点一致 / status 不变 / 树·徽记即时刷新）
// ─────────────────────────────────────────────────────────────────────────────
test('J4·Golden 1-3：拖拽改域全链——文件 rename + DB 落点一致 + status 不变 + 树徽记即时刷新', async () => {
  const { root, wsDir } = makeReviewCorpus(J4_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched

    // Golden 1（J4-1 前置）：域树缺省常展开（≤3 层口径）——A/B 域行在场；
    // 徽记 = 未过滤口径（前端 2 待审、后端 1 待审——数字形态，SC-H）
    await expect(treeRow(page, '')).toBeVisible() // 「全部域」根行在场
    await expect(treeRow(page, '前端')).toBeVisible()
    await expect(treeRow(page, '后端')).toBeVisible()
    await expect(rowBadge(page, '前端')).toHaveText('2')
    await expect(rowBadge(page, '后端')).toHaveText('1')
    await evidenceShot(page, 'j4-golden-1-tree-badges.png')

    // Golden 2（J4-1 / CT-EA-6 move）：拖 A 域 unconfirmed 卡片到 B 域行——
    // 落位后卡片归入 B 域（foot 域段投影）、树/徽记即时刷新（前端 2→1、后端 1→2）
    await dragCardTo(page, '域树前端待审一', '后端')
    await expect(cardDomain(page, '域树前端待审一')).toHaveText('后端')
    await expect(rowBadge(page, '前端')).toHaveText('1')
    await expect(rowBadge(page, '后端')).toHaveText('2')
    // 文件真实落点（domain 唯一事实源 = 文件落点——不变式）：旧目录零残留、新目录在场
    expect(existsSync(fileOf(wsDir, '前端', 'j4-a1')), 'A 域旧文件已迁出').toBe(false)
    expect(existsSync(fileOf(wsDir, '后端', 'j4-a1')), 'B 域目录文件在').toBe(true)
    await evidenceShot(page, 'j4-golden-2-moved.png')

    // Golden 3（J4-1 不变式 / CT-EA-6 State）：move 后状态语义——status 不变
    //（unconfirmed 仍 unconfirmed）；DB domain_path 与文件落点一致
    {
      const db = openReviewDb(userData)
      try {
        const row = entryByTitle(db, '域树前端待审一')
        expect(row.status, 'J4-1：status 不随 move 变化').toBe('unconfirmed')
        expect(row.domainPath, 'J4-1 不变式：domain = 文件落点（B 域）').toBe('后端')
        const untouched = entryByTitle(db, '域树前端待审二')
        expect(untouched.domainPath, '未移动条目零漂移').toBe('前端')
      } finally {
        db.close()
      }
    }
    await evidenceShot(page, 'j4-golden-3-state-consistent.png')
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J4·Golden 4-5 + >3 层拒收（J4-2 / J4-3 createDomain 径 / CT-EA-8 / CT-EA-7）：
// 树头「＋」新建目录即时在场 → 拖入落卡 → 超层新建预检拒收（树零变化）
// ─────────────────────────────────────────────────────────────────────────────
test('J4·Golden 4-5 + 边界：新建目录即时在场可落卡 + >3 层新建拒收树零变化', async () => {
  const { root, wsDir } = makeReviewCorpus(J4_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(4)

    // Golden 4（J4-2 / CT-EA-8）：树头「＋」→ 编辑行 → Enter——新域节点即时在场
    await page.locator('[data-dswf-kn-dom-add]').click()
    const editor = page.locator('[data-dswf-kn-dom-new]')
    await expect(editor).toBeVisible()
    await page.locator('[data-dswf-kn-dom-new] input').fill('新域')
    await page.locator('[data-dswf-kn-dom-new] input').press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(treeRow(page, '新域')).toBeVisible()
    // mkdir + 域行 upsert（CT-EA-8 Side-effect——目录真实在盘）
    expect(existsSync(join(wsDir, '.knowledge', '新域')), '新域目录在盘').toBe(true)
    await evidenceShot(page, 'j4-golden-4-domain-created.png')

    // Golden 5（J4-2）：新域可接收拖拽落卡——落位成功、徽记刷新
    await dragCardTo(page, '域树前端待审二', '新域')
    await expect(cardDomain(page, '域树前端待审二')).toHaveText('新域')
    await expect(rowBadge(page, '新域')).toHaveText('1')
    await expect(rowBadge(page, '前端')).toHaveText('1')
    expect(existsSync(fileOf(wsDir, '新域', 'j4-a2')), '文件 rename 至新域目录').toBe(true)
    await evidenceShot(page, 'j4-golden-5-drop-into-new.png')

    // 边界（J4-3 createDomain 径 / CT-EA-7 domain-depth）：>3 层拒收——客户端预检
    //（isDomainDepthLegal 同判据）提示留编辑行、树零变化、目录零新建。
    // 注：超层目标 = 深层域行激活后新建（父层 = 激活域）——夹具构造 3 层域。
    // 直落 3 层域夹具目录（索引 rebuild 由视图重拉承载——切过滤往返触发重拉即入树）
    const deepDir = join(wsDir, '.knowledge', '前端', '组件', '状态')
    mkdirSync(deepDir, { recursive: true })
    // 触发重拉：切过滤 chips 往返（纯读重拉——树重建含深层域）
    await statusChip(page, 'unconfirmed').click()
    await statusChip(page, 'all').click()
    await expect(treeRow(page, '前端/组件/状态')).toBeVisible({ timeout: 30_000 })
    await treeRow(page, '前端/组件/状态').click() // 激活深层域 = 新建父层
    await page.locator('[data-dswf-kn-dom-add]').click()
    await page.locator('[data-dswf-kn-dom-new] input').fill('超层目录')
    await page.locator('[data-dswf-kn-dom-new] input').press('Enter')
    // 拒收提示留编辑行（role=alert）——树零变化、目录零新建（CT-EA-7 零副作用）
    await expect(page.locator('[data-dswf-kn-dom-new] [role="alert"]')).toBeVisible()
    await expect(treeRow(page, '前端/组件/状态/超层目录')).toHaveCount(0)
    expect(existsSync(join(deepDir, '超层目录')), '超层目录零新建').toBe(false)
    await evidenceShot(page, 'j4-boundary-depth-reject.png')
    // 取消收口（编辑行 Escape——零副作用退出）
    await page.locator('[data-dswf-kn-dom-new] input').press('Escape')
    await expect(page.locator('[data-dswf-kn-dom-new]')).toHaveCount(0)
    {
      const db = openReviewDb(userData)
      try {
        // J4-2 State：新域行 description NULL 缺省在库（域行 upsert 落点断言）
        const moved = entryByTitle(db, '域树前端待审二')
        expect(moved.domainPath, '落卡新域与 DB 一致').toBe('新域')
      } finally {
        db.close()
      }
    }
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J4·边界（J4-1 boundary / J4-4 / CT-EA-6·CT-EA-8 Invariants）：非域行落点零动作 +
// 同域 move 幂等零副作用 + 徽记与 statusFilter 正交（过滤结果集变而徽记不抖动）
// ─────────────────────────────────────────────────────────────────────────────
test('J4·边界：根行非落点反向锚 + 同域 move 幂等 + 徽记与过滤正交', async () => {
  const { root, wsDir } = makeReviewCorpus(J4_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(4)

    // 落点判据反向锚（H3）：具体域行带 data-dswf-kn-drop，「全部域」根行不带
    //（根行 = 无域过滤，非落点——targetDomain 必须是具体域）
    await expect(treeRow(page, '前端')).toHaveAttribute('data-dswf-kn-drop', 'true')
    await expect(treeRow(page, '')).not.toHaveAttribute('data-dswf-kn-drop')
    await evidenceShot(page, 'j4-boundary-drop-flags.png')

    // 非域行落点零动作：向根行拖拽——文件零移动、视图零漂移、零错误条
    await dragCardTo(page, '域树前端待审一', '')
    await expect(cardDomain(page, '域树前端待审一')).toHaveText('前端')
    expect(existsSync(fileOf(wsDir, '前端', 'j4-a1')), '根行落点文件零移动').toBe(true)
    await expect(page.locator('[data-dswf-kn-error]')).toHaveCount(0)
    {
      const db = openReviewDb(userData)
      try {
        expect(entryByTitle(db, '域树前端待审一').domainPath).toBe('前端')
      } finally {
        db.close()
      }
    }

    // 同域 move 幂等（J4-1 boundary）：拖回自身域——零副作用（徽记不抖、无冗余记账面变化）
    await dragCardTo(page, '域树前端待审一', '前端')
    await expect(cardDomain(page, '域树前端待审一')).toHaveText('前端')
    await expect(rowBadge(page, '前端')).toHaveText('2')
    await expect(rowBadge(page, '后端')).toHaveText('1')
    expect(existsSync(fileOf(wsDir, '前端', 'j4-a1')), '同域 move 文件仍在原位').toBe(true)
    {
      const db = openReviewDb(userData)
      try {
        const row = entryByTitle(db, '域树前端待审一')
        expect(row.domainPath).toBe('前端')
        expect(row.status).toBe('unconfirmed')
      } finally {
        db.close()
      }
    }
    await evidenceShot(page, 'j4-boundary-same-domain-idempotent.png')

    // J4-4（SC-E2 过滤独立性）：切 statusFilter=confirmed——过滤结果集只剩 confirmed，
    // 域树徽记计数不变（未过滤口径独立查询面——不随 statusFilter 抖动）
    await statusChip(page, 'confirmed').click()
    await expect(card(page, '域树前端已确认')).toHaveCount(1)
    await expect(card(page, '域树前端待审一')).toHaveCount(0)
    await expect(rowBadge(page, '前端')).toHaveText('2')
    await expect(rowBadge(page, '后端')).toHaveText('1')
    await statusChip(page, 'all').click()
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(4)
    await expect(rowBadge(page, '前端')).toHaveText('2')
    await evidenceShot(page, 'j4-boundary-badge-filter-orthogonal.png')
  } finally {
    await teardownReview(launched, [root])
  }
})
