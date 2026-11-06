// 旅程② knowledge-review-single-act——单卡裁决（chip 可点 + dialog 标题栏）（journey.md J2-1~J2-3）。
// 覆盖：chip 可点性与状态同源（仅 unconfirmed 可点——data-dswf-kn-chip-confirm 锚 +
// aria-label 点击通过；confirmed/superseded 严格只读零锚）、chip 点击免确认通过（不触发
// 卡片开 dialog）、dialog 标题栏 unconfirmed 特有钮组（编辑+通过+驳回+✕）、查看模式三分区、
// dialog 通过（免确认 + 关闭回浏览 + DB/FTS 收口）、驳回官方 Modal 从 dialog 之上叠层
//（取消 = 零动作；确认 = 三表零残留）、Esc 查看态关闭、already-confirmed 幂等径。
// 降级注记（journey.md 共通锚 §15）：
// - diag 面（knowledge-confirm / knowledge-reject）归 host 日志域，本套件不取（同旅程①口径）；
// - J2-2 already-confirmed 幂等重放：UI 面按可点性同源隐藏 confirmed 条目的通过/驳回钮——
//   「从 dialog 重发通过」UI 征不可达，幂等语义由旅程①批量径（J1-1）+ 服务面单测承载；
//   本套件以反向断言收口（confirmed dialog 无通过入口）。
// 本任务不做运行取证——真机 e2e 断言执行归债务任务 knowledge-review-ui/1.15。
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

// ── 查询面（插件自持库——状态语义断言，不锁实现）─────────────────────────────

interface EntryRow {
  readonly rid: number
  readonly slug: string
  readonly status: string
}

function entryByTitle(db: SeedDb, title: string): EntryRow {
  const row = db.prepare('SELECT rowid AS rid, id AS slug, status FROM knowledge_entries WHERE title = ?').get(title) as
    | EntryRow
    | undefined
  expect(row, `条目在索引（${title}）`).toBeDefined()
  return row as EntryRow
}

function ftsCount(db: SeedDb, slug: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM knowledge_fts WHERE id = ?').get(slug) as { n: number }
  return row.n
}

function entryGone(db: SeedDb, title: string): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM knowledge_entries WHERE title = ?').get(title) as { n: number }
  return row.n === 0
}

function versionCount(db: SeedDb, slug: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM knowledge_entry_versions WHERE id = ?').get(slug) as { n: number }
  return row.n
}

function fileOf(wsDir: string, domain: string, slug: string): string {
  return join(wsDir, '.knowledge', domain, `${slug}.md`)
}

// ── UI 面（稳定 data 属性锚——不断视觉坐标、不锁文案字面与 DOM 层级）──────────

function card(page: Page, title: string): Locator {
  return page.locator('[data-dswf-entry]', { hasText: title }).first()
}

function chipConfirm(page: Page, title: string): Locator {
  return card(page, title).locator('[data-dswf-kn-chip-confirm]')
}

function dialog(page: Page): Locator {
  return page.locator('[data-dswf-kn-dialog]')
}

async function openDialog(page: Page, title: string): Promise<void> {
  await card(page, title).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).locator('[data-dswf-kn-dialog-actions]')).toBeVisible({ timeout: 30_000 })
}

async function expectStatus(page: Page, title: string, status: string): Promise<void> {
  // SC-J 改型：卡片状态 chip = 中文标签（confirmed→已确认 / unconfirmed→待审核）
  await expect(card(page, title).locator('.dswf-kn-card-status')).toHaveText(status === 'confirmed' ? '已确认' : '待审核')
}

// ── corpus（旅程②口径：≥3 unconfirmed + ≥1 confirmed + 1 superseded 反向锚）──

const J2_CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'u1', title: '单卡 前端一', summary: '待审核条目一', keywords: ['前端', '一'] },
  { domain: '前端', id: 'u2', title: '单卡 前端二', summary: '待审核条目二', keywords: ['前端', '二'] },
  { domain: '前端', id: 'u3', title: '单卡 前端三', summary: '待审核条目三', keywords: ['前端', '三'] },
  { domain: '前端', id: 'c1', title: '单卡 已确认', summary: '预置已确认条目', keywords: ['前端', '已确认'], status: 'confirmed' },
]

/** superseded 反向锚条目（corpus 夹具不支持的三态——craftFile 直书 frontmatter） */
function seedSuperseded(wsDir: string): void {
  craftFile(
    join(wsDir, '.knowledge', '前端'),
    's1.md',
    [
      'id: s1',
      'title: 单卡 已归并',
      'summary: 已出索引面的曾审条目',
      'keywords: [前端, 归并]',
      'status: superseded',
      'supersedes: 2026-01-01T00:00:00.000Z',
      'version_ts: 2026-01-01T00:00:00.000Z',
    ],
    '已归并正文。',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// J2-1 Golden 1-2：chip 可点性同源（affordance 只在 unconfirmed）+ chip 点击免确认通过
// ─────────────────────────────────────────────────────────────────────────────
test('J2·J2-1：chip 可点性↔状态同源 + chip 点击免确认通过（不触发 dialog/Modal）', async () => {
  const { root, wsDir } = makeReviewCorpus(J2_CORPUS)
  seedSuperseded(wsDir)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched

    // Golden 1：可点 affordance + 「点击通过」提示语义——仅 unconfirmed 卡片（G1）
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(5)
    for (const title of ['单卡 前端一', '单卡 前端二', '单卡 前端三']) {
      await expect(chipConfirm(page, title)).toHaveCount(1)
      await expect(chipConfirm(page, title)).toHaveAttribute('aria-label', '点击通过')
    }
    // confirmed / superseded 严格只读——可点锚零在场（反向断言）
    await expect(chipConfirm(page, '单卡 已确认')).toHaveCount(0)
    await expect(chipConfirm(page, '单卡 已归并')).toHaveCount(0)
    await evidenceShot(page, 'j2-j21-chip-affordance.png')

    // Golden 2：点击 unconfirmed chip——免确认框直接通过；不触发卡片开 dialog；视图重拉
    await chipConfirm(page, '单卡 前端一').click()
    await expect(page.locator('.dswf-kn-reject-modal')).toHaveCount(0)
    await expect(dialog(page)).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-error]')).toHaveCount(0)
    await expectStatus(page, '单卡 前端一', 'confirmed')
    // chip 可点性随状态收敛：升格后可点锚退场
    await expect(chipConfirm(page, '单卡 前端一')).toHaveCount(0)
    await evidenceShot(page, 'j2-j21-chip-confirmed.png')

    // 数据锚：DB status=confirmed + FTS 可召回（检索面按状态语义收口）
    const db = openReviewDb(userData)
    try {
      const row = entryByTitle(db, '单卡 前端一')
      expect(row.status, 'u1 DB status=confirmed').toBe('confirmed')
      expect(ftsCount(db, row.slug), 'u1 FTS 行在场').toBe(1)
      // 未动作条目零波及
      expect(entryByTitle(db, '单卡 前端二').status).toBe('unconfirmed')
      expect(entryByTitle(db, '单卡 已确认').status).toBe('confirmed')
      expect(entryByTitle(db, '单卡 已归并').status).toBe('superseded')
    } finally {
      db.close()
    }
    expect(existsSync(fileOf(wsDir, '前端', 'u1')), 'u1 文件在（通过不删文件）').toBe(true)
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J2-2 Golden 3-4：dialog 标题栏钮组/三分区 + dialog 通过（免确认 + DB/FTS 收口）；
// superseded 反向锚（无 通过/驳回 钮）+ confirmed dialog 无通过入口（J2-2 幂等径反向断言）
// ─────────────────────────────────────────────────────────────────────────────
test('J2·J2-2：dialog 钮组（unconfirmed 特有）/查看三分区 + 标题栏通过收口 + 反向锚', async () => {
  const { root, wsDir } = makeReviewCorpus(J2_CORPUS)
  seedSuperseded(wsDir)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(5)

    // Golden 3：点卡片本体开 dialog（唯一主行为）——unconfirmed 标题栏 = [编辑]+[通过]+[驳回]+✕
    await openDialog(page, '单卡 前端二')
    const dlg = dialog(page)
    await expect(dlg.locator('[data-dswf-kn-dialog-edit]')).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-dialog-confirm]')).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-dialog-reject]')).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-dialog-close]')).toBeVisible()
    // 查看模式三分区（现役布局零改动）：meta 行 / 摘要 / 正文
    await expect(dlg.locator('[data-dswf-kn-meta-row]').first()).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-summary]')).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-body]')).toBeVisible()
    // 查看模式无编辑体/保存钮
    await expect(dlg.locator('[data-dswf-kn-edit]')).toHaveCount(0)
    await expect(dlg.locator('[data-dswf-kn-dialog-save]')).toHaveCount(0)
    await evidenceShot(page, 'j2-j22-dialog-view.png')

    // Golden 4：标题栏点「通过」——免确认通过；dialog 关闭；DB status=confirmed、FTS 可召回
    await dlg.locator('[data-dswf-kn-dialog-confirm]').click()
    await expect(page.locator('.dswf-kn-reject-modal')).toHaveCount(0)
    await expect(dialog(page)).toHaveCount(0)
    await expectStatus(page, '单卡 前端二', 'confirmed')
    {
      const db = openReviewDb(userData)
      try {
        const row = entryByTitle(db, '单卡 前端二')
        expect(row.status, 'u2 DB status=confirmed').toBe('confirmed')
        expect(ftsCount(db, row.slug), 'u2 FTS 行在场').toBe(1)
        expect(versionCount(db, row.slug), 'u2 版本行零变化（通过不改版本链）').toBe(1)
      } finally {
        db.close()
      }
    }
    await evidenceShot(page, 'j2-j22-dialog-confirmed.png')

    // 反向锚①：superseded 条目 dialog——标题栏无 通过/驳回（仅 unconfirmed 特有），编辑在场
    await openDialog(page, '单卡 已归并')
    await expect(dialog(page).locator('[data-dswf-kn-dialog-confirm]')).toHaveCount(0)
    await expect(dialog(page).locator('[data-dswf-kn-dialog-reject]')).toHaveCount(0)
    await expect(dialog(page).locator('[data-dswf-kn-dialog-edit]')).toBeVisible()
    // 边界（J2 边界⑤前半）：查看态 Esc = 关闭 dialog
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await evidenceShot(page, 'j2-j22-superseded-dialog.png')

    // 反向锚②（J2-2 幂等径反向断言）：confirmed dialog 无 通过/驳回 入口——
    // 「对已 confirmed 重发通过」UI 不可达，可点性与状态同源在 dialog 标题栏同样成立
    await openDialog(page, '单卡 已确认')
    await expect(dialog(page).locator('[data-dswf-kn-dialog-confirm]')).toHaveCount(0)
    await expect(dialog(page).locator('[data-dswf-kn-dialog-reject]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J2-3 Golden 5：dialog 驳回——Modal 从 dialog 之上叠层（取消=零动作 / 确认=三表零残留）
// ─────────────────────────────────────────────────────────────────────────────
test('J2·J2-3：dialog 驳回 Modal 叠层——取消零动作 / 确认三表零残留', async () => {
  const { root, wsDir } = makeReviewCorpus(J2_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(4)

    // 打开 unconfirmed dialog，标题栏点「驳回」→ 官方 Modal 确认框（清单+数量）从 dialog 之上叠层
    await openDialog(page, '单卡 前端三')
    await dialog(page).locator('[data-dswf-kn-dialog-reject]').click()
    const modal = page.locator('.dswf-kn-reject-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('驳回 1 条待审核条目')
    // 叠层语义：确认框在场时 dialog 仍在场（非替换式）
    await expect(dialog(page)).toBeVisible()
    await evidenceShot(page, 'j2-j23-modal-overlay.png')

    // 取消 = 零动作：dialog 与条目均零变化（文件/DB）
    await modal.getByRole('button', { name: '取消' }).click()
    await expect(modal).toHaveCount(0)
    await expect(dialog(page)).toBeVisible()
    await expectStatus(page, '单卡 前端三', 'unconfirmed')
    {
      const db = openReviewDb(userData)
      try {
        expect(entryByTitle(db, '单卡 前端三').status).toBe('unconfirmed')
        expect(versionCount(db, 'u3'), 'u3 版本行零变化').toBe(1)
      } finally {
        db.close()
      }
    }
    expect(existsSync(fileOf(wsDir, '前端', 'u3')), '取消后 u3 文件在').toBe(true)

    // 再驳回并确认——条目删除：文件、版本行、FTS 三处零残留；视图重拉后卡片不在场；
    // dialog 随不可逆关闭（onClose 链）
    await dialog(page).locator('[data-dswf-kn-dialog-reject]').click()
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: '确认驳回' }).click()
    await expect(modal).toHaveCount(0)
    await expect(dialog(page)).toHaveCount(0)
    await expect(card(page, '单卡 前端三')).toHaveCount(0)
    await evidenceShot(page, 'j2-j23-after-reject.png')
    expect(existsSync(fileOf(wsDir, '前端', 'u3')), 'u3 文件硬删').toBe(false)
    {
      const db = openReviewDb(userData)
      try {
        expect(entryGone(db, '单卡 前端三'), 'u3 主行零残留').toBe(true)
        expect(versionCount(db, 'u3'), 'u3 版本行零残留').toBe(0)
        expect(ftsCount(db, 'u3'), 'u3 FTS 零残留').toBe(0)
        // 邻近条目零波及
        expect(entryByTitle(db, '单卡 前端一').status).toBe('unconfirmed')
        expect(entryByTitle(db, '单卡 已确认').status).toBe('confirmed')
      } finally {
        db.close()
      }
    }
    expect(existsSync(fileOf(wsDir, '前端', 'u1')), '未驳回条目文件不受波及').toBe(true)
  } finally {
    await teardownReview(launched, [root])
  }
})
