// SC-J 卡片终稿布局与回执 toast（proposal.md SC-J J1~J5；基准 = walkthrough/card-layout-spec.md）。
// 债务验证目标（knowledge-review-ui/1.21 e2e debt）：
//   apps/web/src/views/knowledge/KnowledgeCardGrid.tsx（卡片终稿布局 J1/J2 + 回执 toast J3/J4 渲染面）
//   apps/web/src/views/knowledge/use-knowledge-browse.ts（J3 confirm / J4 move 回执出票执行面）
// J3/J4 官方 Toast 为 body portal（document 依赖）——renderToStaticMarkup 不展开 portal 面，
// 文字模板/出场键/退场链已由纯函数与 hook 执行面单测承载；本套件取真机顶部居中横幅视觉
// 与自灭时序证据（role="alert" 官方 Toast 语义锚）。
// J5 dialog 编辑态关键词 chip 宽随内容自适应 + 最小宽 140px——真机计算样式 + 长词提交往返。
import { existsSync } from 'node:fs'
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
import { craftFile } from '../journey-fm.js'
import type { SeedDb } from '../../../packages/core/src/testutil/db-seeds.js'

test.setTimeout(600_000)

// ── 查询面（插件自持库——状态语义断言）───────────────────────────────────────

interface EntryRow {
  readonly slug: string
  readonly status: string
  readonly domain: string
}

function entryByTitle(db: SeedDb, title: string): EntryRow {
  const row = db.prepare('SELECT id AS slug, status, domain FROM knowledge_entries WHERE title = ?').get(title) as
    | EntryRow
    | undefined
  expect(row, `条目在索引（${title}）`).toBeDefined()
  return row as EntryRow
}

// ── UI 面（稳定 data 属性锚——不断视觉坐标、不锁文案字面与 DOM 层级）──────────

function card(page: Page, title: string): Locator {
  return page.locator('[data-dswf-entry]', { hasText: title }).first()
}

function heatBadge(cardLoc: Locator): Locator {
  return cardLoc.locator('[data-dswf-kn-card-heat]')
}

function footDom(cardLoc: Locator): Locator {
  return cardLoc.locator('.dswf-kn-card-dom')
}

function footStatus(cardLoc: Locator): Locator {
  return cardLoc.locator('.dswf-kn-card-status')
}

function footTime(cardLoc: Locator): Locator {
  return cardLoc.locator('[data-dswf-kn-card-created]')
}

/** 官方 Toast（body portal——应用顶部居中横幅，role="alert" 语义锚） */
function receiptToast(page: Page): Locator {
  return page.locator('body > [role="alert"]')
}

function dialog(page: Page): Locator {
  return page.locator('[data-dswf-kn-dialog]')
}

async function openDialog(page: Page, title: string): Promise<Locator> {
  await card(page, title).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).locator('[data-dswf-kn-dialog-actions]')).toBeVisible({ timeout: 30_000 })
  return dialog(page)
}

/** 卡片 → 域行拖拽（HTML5 DnD 事件链——与 journey④ 同径：真实 onDragStart/onDrop handler 驱动） */
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
      cardEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      dt.setData('text/knowledge-entry', entryId)
      dt.setData('text/plain', entryId)
      targetEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt }))
      targetEl.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
    },
    { title: cardTitle, target: targetDomainPath },
  )
}

// ── corpus（SC-J 口径：unconfirmed + confirmed 双 chip 面 + 前端/后端双域 move 供数）──

const SJ_CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'sj-u1', title: '终稿待审一', summary: '待审核条目一', keywords: ['前端', '一'] },
  { domain: '前端', id: 'sj-u2', title: '终稿待审二', summary: '待审核条目二', keywords: ['前端', '二'] },
  { domain: '前端', id: 'sj-c1', title: '终稿已确认', summary: '预置已确认条目', keywords: ['前端', '已确认'], status: 'confirmed' },
  { domain: '后端', id: 'sj-b1', title: '终稿后端待审', summary: 'B 域待审条目', keywords: ['后端', '一'] },
]

/** J2 时间标签供数：pinned updated（2 小时前——短标签「2 小时前创建」桶稳定，不受跑批时刻抖动） */
function seedPinnedUpdated(wsDir: string, iso: string): void {
  craftFile(
    join(wsDir, '.knowledge', '前端'),
    'sj-t.md',
    [
      'id: sj-t',
      'title: 终稿时间锚',
      'summary: 时间标签口径条目',
      'keywords: [前端, 时间]',
      `updated: ${iso}`,
    ],
    '时间口径正文。',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// J1 + J2：卡片终稿布局——标题行热度徽章 + 底行三段（域·弹性空隙·中文 chip·创建时间）
// ─────────────────────────────────────────────────────────────────────────────
test('SC-J·J1+J2：热度徽章（火焰图标/24px/13px/上移5px/悬浮口径）+ 底行三段右端锚定', async () => {
  const { root, wsDir } = makeReviewCorpus(SJ_CORPUS)
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
  seedPinnedUpdated(wsDir, twoHoursAgo.toISOString())
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({
      wsDir,
      heatSeeds: [{ entryTitle: '终稿待审一', count: 3 }],
    })
    const { page } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(5)
    const u1 = card(page, '终稿待审一')

    // J1：热度徽章在标题行右端——火焰 svg 图标 + 数字（零 emoji：文本恰为计数）
    await expect(heatBadge(u1)).toBeVisible()
    await expect(heatBadge(u1).locator('svg')).toHaveCount(1)
    await expect(heatBadge(u1)).toHaveText('3')
    // 刻度：高 24px / 字号 13px / 基线上移 5px（card-layout-spec.md 原型刻度）
    const heatStyle = await heatBadge(u1).evaluate((el) => {
      const cs = getComputedStyle(el)
      return { height: cs.height, fontSize: cs.fontSize, transform: cs.transform }
    })
    expect(heatStyle.height, 'J1 热度徽章高 24px').toBe('24px')
    expect(heatStyle.fontSize, 'J1 热度徽章字号 13px').toBe('13px')
    expect(heatStyle.transform, 'J1 热度徽章上移 5px').toBe('matrix(1, 0, 0, 1, 0, -5)')
    // 悬浮口径：Tooltip =「热度：召回/使用计数」（官方 Tooltip portal，零原生 title）
    await expect(heatBadge(u1)).not.toHaveAttribute('title', /.+/)
    await heatBadge(u1).hover()
    await expect(page.locator('[role="tooltip"]')).toContainText('热度：召回/使用计数')
    await page.mouse.move(0, 0)
    await evidenceShot(page, 'scj-j1-heat-badge.png')

    // J2：底行三段——域（左）·弹性空隙·中文状态 chip·创建时间（右端锚定）
    await expect(footDom(u1)).toHaveText('前端')
    await expect(footStatus(u1)).toContainText('待审核')
    // StateDot 官方色点（非 ongoing 态 = span 形态，非 svg——首子元素 ≈7px 色点）
    const dotBox = await footStatus(u1)
      .locator('> *')
      .first()
      .evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { w: r.width, h: r.height }
      })
    expect(dotBox.w, 'J2 StateDot 色点在 chip 内（~7px）').toBeGreaterThan(4)
    expect(dotBox.h, 'J2 StateDot 色点高度').toBeGreaterThan(4)
    // 零英文：状态 chip 文本无 ASCII 字母
    const statusText = await footStatus(u1).innerText()
    expect(statusText, 'J2 状态 chip 零英文').not.toMatch(/[A-Za-z]/)
    // pinned updated（2 小时前）→「2 小时前创建」短标签 + 悬浮完整时间点
    const t = card(page, '终稿时间锚')
    const expectedStamp = (() => {
      const d = twoHoursAgo
      const pad = (n: number): string => String(n).padStart(2, '0')
      return `创建于 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    })()
    await expect(footTime(t)).toHaveText('2 小时前创建')
    await footTime(t).hover()
    await expect(page.locator('[role="tooltip"]')).toContainText(expectedStamp)
    await page.mouse.move(0, 0)
    // 右端锚定几何：时间标签右缘 ≈ 卡片右缘（内边距容差）；弹性空隙 flex:1 在场
    const geo = await t.evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect()
      const time = (el.querySelector('[data-dswf-kn-card-created]') as HTMLElement).getBoundingClientRect()
      const spacer = el.querySelector('.dswf-kn-card-spacer') as HTMLElement
      const spacerStyle = getComputedStyle(spacer)
      return { cardRight: rect.right, timeRight: time.right, spacerGrow: spacerStyle.flexGrow }
    })
    expect(geo.spacerGrow, 'J2 弹性空隙 flex:1').toBe('1')
    // 右端锚定 = 时间标签右缘收在卡片内边距处（gap ≈ 卡片 padding-right，±1px 舍入）
    const cardPadRight = await t.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingRight))
    expect(Math.abs(geo.cardRight - geo.timeRight - cardPadRight), 'J2 创建时间右端锚定（右缘 = 卡片内边距）').toBeLessThanOrEqual(1)
    // confirmed 卡片 chip =「已确认」（中性填充面）
    await expect(footStatus(card(page, '终稿已确认'))).toContainText('已确认')
    await evidenceShot(page, 'scj-j2-foot-row.png')
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J3：点击「待审核」chip → confirm 落盘 + 应用顶部居中回执 toast（标题实读）+ chip 翻转
// ─────────────────────────────────────────────────────────────────────────────
test('SC-J·J3：chip 点击通过——顶部居中回执 toast（{标题} 已被审核通过）+ 自灭 + chip 翻转已确认', async () => {
  const { root, wsDir } = makeReviewCorpus(SJ_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(4)
    const u1 = card(page, '终稿待审一')

    // 点击「待审核」chip → toast 出场（标题实读模板，非静态提示）
    await u1.locator('[data-dswf-kn-chip-confirm]').click()
    const toast = receiptToast(page)
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('终稿待审一 已被审核通过')
    // 顶部居中几何：横幅中心 ≈ 视口水平中心，顶缘贴近视口顶
    const pos = await toast.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { cx: r.left + r.width / 2, top: r.top, vw: window.innerWidth, vh: window.innerHeight }
    })
    expect(Math.abs(pos.cx - pos.vw / 2), 'J3 toast 水平居中').toBeLessThanOrEqual(pos.vw * 0.15)
    expect(pos.top, 'J3 toast 贴顶').toBeLessThan(pos.vh * 0.15)
    await evidenceShot(page, 'scj-j3-toast.png')

    // chip 翻转「已确认」（视图重拉）+ toast 自灭退场（官方 Toast hold+fade 链）
    await expect(footStatus(u1)).toContainText('已确认', { timeout: 15_000 })
    await expect(u1.locator('[data-dswf-kn-chip-confirm]')).toHaveCount(0)
    await expect(toast).toBeHidden({ timeout: 10_000 })
    await evidenceShot(page, 'scj-j3-after-toast.png')

    // 数据锚：DB status=confirmed
    const db = openReviewDb(userData)
    try {
      expect(entryByTitle(db, '终稿待审一').status, 'J3 DB confirmed').toBe('confirmed')
    } finally {
      db.close()
    }
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J4：拖拽卡片落位 → 回执 toast（{标题} 从{来源域} 移动到 {目标域}，域名实读）
// ─────────────────────────────────────────────────────────────────────────────
test('SC-J·J4：拖拽改域落位——move 链收口 + 回执 toast（来源/目标域实读）', async () => {
  const { root, wsDir } = makeReviewCorpus(SJ_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(4)

    // 拖「终稿待审一」（前端）到「后端」域行落位
    await dragCardTo(page, '终稿待审一', '后端')
    const toast = receiptToast(page)
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('终稿待审一 从前端 移动到 后端')
    await expect(page.locator('[data-dswf-kn-error]')).toHaveCount(0)
    await evidenceShot(page, 'scj-j4-move-toast.png')

    // toast 自灭 + 卡片底行域段刷新（视图重拉）
    await expect(footDom(card(page, '终稿待审一'))).toHaveText('后端')
    await expect(toast).toBeHidden({ timeout: 10_000 })

    // 数据锚：DB domain=后端 + 文件实际落点（domain 唯一事实源 = 文件落点）
    const db = openReviewDb(userData)
    try {
      expect(entryByTitle(db, '终稿待审一').domain, 'J4 DB domain=后端').toBe('后端')
      expect(entryByTitle(db, '终稿待审一').status, 'J4 status 不随 move 变化').toBe('unconfirmed')
    } finally {
      db.close()
    }
    expect(existsSync(join(wsDir, '.knowledge', '后端', 'sj-u1.md')), 'J4 文件在新域目录').toBe(true)
    expect(existsSync(join(wsDir, '.knowledge', '前端', 'sj-u1.md')), 'J4 原域文件已移走').toBe(false)
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J5：dialog 编辑态关键词 chip——宽随内容自适应（bug 436cc88d 修订口径：
// Chromium UA 对 input 强制 overflow: clip，overflow visible 断言退役）+
// min-width 140px 下限，长关键词编辑不裁切
// ─────────────────────────────────────────────────────────────────────────────
test('SC-J·J5：dialog 编辑态关键词 chip——宽随内容自适应 + min-width 140px / 长词提交不裁切', async () => {
  const longKeyword = '超长关键词不裁切验证样例词条目标签'.repeat(3)
  const corpus: readonly CorpusEntry[] = [
    {
      domain: '前端',
      id: 'sj-e1',
      title: '终稿编辑锚',
      summary: '编辑态 chip 口径条目',
      keywords: ['前端', '编辑'],
      status: 'confirmed',
    },
  ]
  const { root, wsDir } = makeReviewCorpus(corpus)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(1)

    // 进 dialog 编辑态，双击关键词 chip 进入放大态编辑输入
    const dlg = await openDialog(page, '终稿编辑锚')
    await dlg.locator('[data-dswf-kn-dialog-edit]').click()
    await expect(dlg.locator('[data-dswf-kn-edit]')).toBeVisible()
    const chips = dlg.locator('[data-dswf-kn-edit-chips]')
    await expect(chips.locator('[data-dswf-kn-kwchip="编辑"]')).toBeVisible()
    await chips.locator('[data-dswf-kn-kwchip="编辑"]').dblclick()
    const kwedit = dlg.locator('[data-dswf-kn-kwedit]')
    await expect(kwedit).toBeVisible()

    // 自适应宽基线（空值 = min 下限）：计算样式契约 min-width 140px
    const boxWidthOf = (): Promise<number> =>
      kwedit.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width)
    const baseWidth = await boxWidthOf()
    expect(baseWidth, 'J5 空值编辑输入 = min 140px 下限').toBeGreaterThanOrEqual(140)
    expect(baseWidth, 'J5 空值不超下限冗余').toBeLessThan(200)

    // 输入超长关键词——自适应契约：boxWidth 随内容增长且长词无横向裁切
    await kwedit.fill(longKeyword)
    const style = await kwedit.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLInputElement)
      return {
        minWidth: cs.minWidth,
        clientWidth: (el as HTMLInputElement).clientWidth,
        scrollWidth: (el as HTMLInputElement).scrollWidth,
        boxWidth: (el as HTMLElement).getBoundingClientRect().width,
      }
    })
    expect(style.minWidth, 'J5 最小宽 140px').toBe('140px')
    expect(style.boxWidth, 'J5 长词自适应撑开（boxWidth 随内容增长）').toBeGreaterThan(baseWidth)
    expect(style.boxWidth, 'J5 编辑输入 ≥140px').toBeGreaterThanOrEqual(140)
    expect(style.scrollWidth, 'J5 长词无横向裁切（scrollWidth ≤ clientWidth + 容差）').toBeLessThanOrEqual(
      style.clientWidth + 2,
    )
    await evidenceShot(page, 'scj-j5-kwedit.png')

    // 提交往返：Enter 收口——chip 呈现完整长词（值不被截断）
    await kwedit.press('Enter')
    await expect(dlg.locator(`[data-dswf-kn-kwchip="${longKeyword}"]`)).toBeVisible()
    await evidenceShot(page, 'scj-j5-kwchip-committed.png')
  } finally {
    await teardownReview(launched, [root])
  }
})
