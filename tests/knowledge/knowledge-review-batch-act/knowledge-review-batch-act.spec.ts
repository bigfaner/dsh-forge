// 旅程① knowledge-review-batch-act——web 多选批量通过/驳回（journey.md J1-1~J1-4）。
// 覆盖：多选模式进入/退出、功能组在场性、卡片勾选联动（checkbox 不触发卡片开 dialog）、
// 全选 = 过滤结果集口径、混合集批量通过（免确认框 + already-confirmed 幂等重放零副作用）、
// 驳回官方 Modal 确认框（取消 = 零动作）、驳回三表零残留（文件/版本行/FTS）+ recall_logs
// 保留、部分失败不回滚（rejected-confirmed——回执 UI 文案面归后续任务，此处断状态效果：
// unconfirmed 正常删除、confirmed 原状不误删）、多选模式退出零残留。
// 诊断 diag 面（knowledge-confirm / knowledge-reject）归 host 日志域，本套件不取
//（journey.md 数据锚之 diag 面由契约/golden 层承载）。
// 真机取证证据落 E2E_EVIDENCE_DIR（任务日志）。
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

/** 版本行计数（versions.id = 条目 slug 键——schema v4 全局 slug 键） */
function versionCount(db: SeedDb, slug: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM knowledge_entry_versions WHERE id = ?').get(slug) as {
    n: number
  }
  return row.n
}

function ftsCount(db: SeedDb, slug: string): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM knowledge_fts WHERE id = ?').get(slug) as { n: number }
  return row.n
}

function recallLogCount(db: SeedDb, entryId: number): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM knowledge_recall_logs WHERE entry_id = ?').get(entryId) as {
    n: number
  }
  return row.n
}

/** 主行零残留判据（COUNT 口径——get 返回 {n:0} 而非 undefined） */
function entryGone(db: SeedDb, title: string): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM knowledge_entries WHERE title = ?').get(title) as { n: number }
  return row.n === 0
}

function fileOf(wsDir: string, domain: string, slug: string): string {
  return join(wsDir, '.knowledge', domain, `${slug}.md`)
}

// ── UI 面（稳定 data 属性锚——不断视觉坐标、不锁文案字面与 DOM 层级）──────────

function toggle(page: Page): Locator {
  return page.locator('[data-dswf-kn-multiselect-toggle]')
}

function selCount(page: Page): Locator {
  return page.locator('[data-dswf-kn-selcount]')
}

function card(page: Page, title: string): Locator {
  return page.locator('[data-dswf-entry]', { hasText: title }).first()
}

function cardCheck(page: Page, title: string): Locator {
  return card(page, title).locator('[data-dswf-kn-card-check] input[type="checkbox"]')
}

/** 勾选动作（功能链驱动）：checkbox 视觉面缺陷在案（knowledge.css:608 整体 clip 隐藏——
 *  bug 台账在案），此处经 DOM click 驱动官方 Checkbox 的受控 onChange 链 */
async function checkCard(page: Page, title: string): Promise<void> {
  await cardCheck(page, title).evaluate((el) => (el as HTMLInputElement).click())
}

async function expectStatus(page: Page, title: string, status: string): Promise<void> {
  // SC-J 改型：卡片状态 chip = 中文标签（confirmed→已确认 / unconfirmed→待审核）
  await expect(card(page, title).locator('.dswf-kn-card-status')).toHaveText(status === 'confirmed' ? '已确认' : '待审核')
}

// ── corpus（旅程①口径：同域 ≥4 unconfirmed + ≥1 confirmed）───────────────────

const J1_CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'u1', title: '批量 through 前端一', summary: '待审核条目一', keywords: ['前端', '一'] },
  { domain: '前端', id: 'u2', title: '批量 through 前端二', summary: '待审核条目二', keywords: ['前端', '二'] },
  { domain: '前端', id: 'u3', title: '批量 through 前端三', summary: '待审核条目三', keywords: ['前端', '三'] },
  { domain: '前端', id: 'u4', title: '批量 through 前端四', summary: '待审核条目四', keywords: ['前端', '四'] },
  { domain: '前端', id: 'c1', title: '批量 through 已确认', summary: '预置已确认条目', keywords: ['前端', '已确认'], status: 'confirmed' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Golden Path 步骤 1-4：多选进入 → 混合勾选 → 全选口径 → 批量通过（免确认）+ 幂等重放
// ─────────────────────────────────────────────────────────────────────────────
test('J1·Golden 1-4：多选进入/勾选联动/全选口径/混合集批量通过 + already-confirmed 幂等重放', async () => {
  const { root, wsDir } = makeReviewCorpus(J1_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData, projectId } = launched

    // 步骤 1：进入多选模式——钮变「取消」，功能组在场，checkbox 淡入（SC-F1/F3）；
    // 反向锚：非多选模式 checkbox 与功能组计数行均不在场
    await expect(selCount(page)).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-card-check]')).toHaveCount(0)
    await toggle(page).click()
    await expect(toggle(page)).toHaveText('取消')
    await expect(selCount(page)).toBeVisible()
    await expect(selCount(page)).toHaveText('已选 0 / 共 5')
    await expect(page.locator('[data-dswf-kn-act-confirm]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-act-reject]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-act-selectall]')).toBeVisible()
    await expect(page.locator('[data-dswf-kn-card-check]')).toHaveCount(5)
    await evidenceShot(page, 'j1-golden-1-multiselect-on.png')

    // 步骤 2：勾选 2 条 unconfirmed + 1 条 confirmed（混合集）——计数联动；checkbox 不开 dialog
    for (const title of ['批量 through 前端一', '批量 through 前端二', '批量 through 已确认']) {
      await checkCard(page, title)
    }
    await expect(selCount(page)).toHaveText('已选 3 / 共 5')
    await expect(page.locator('[data-dswf-kn-drawer]')).toHaveCount(0)
    await evidenceShot(page, 'j1-golden-2-mixed-check.png')

    // 步骤 3：全选——当前过滤结果集全勾，M = 过滤结果集计数（SC-F4）
    await page.locator('[data-dswf-kn-act-selectall]').click()
    await expect(selCount(page)).toHaveText('已选 5 / 共 5')
    for (const entry of J1_CORPUS) {
      await expect(cardCheck(page, entry.title)).toBeChecked()
    }

    // 步骤 4：通过（免确认框直接执行）——全部 confirmed
    await page.locator('[data-dswf-kn-act-confirm]').click()
    await expect(page.locator('.dswf-kn-reject-modal')).toHaveCount(0)
    for (const entry of J1_CORPUS) {
      await expectStatus(page, entry.title, 'confirmed')
    }
    await evidenceShot(page, 'j1-golden-4-batch-confirm.png')

    // 数据锚：DB 全部 confirmed + 基线版本行计数（供幂等重放对照）
    const versionsBefore: Record<string, number> = {}
    {
      const db = openReviewDb(userData)
      try {
        for (const entry of J1_CORPUS) {
          const row = entryByTitle(db, entry.title)
          expect(row.status, `${entry.id} status=confirmed`).toBe('confirmed')
          versionsBefore[entry.id] = versionCount(db, row.slug)
          expect(versionsBefore[entry.id], `${entry.id} 版本行在场`).toBeGreaterThan(0)
        }
      } finally {
        db.close()
      }
    }

    // 产品语义锚：批量动作成功后自动退出多选模式（act() exit + refetch）——重进多选重放
    await expect(toggle(page)).toHaveText('多选')
    await expect(selCount(page)).toHaveCount(0)
    // 边界（J1-1 幂等重放）：对同一批已 confirmed 条目重复点「通过」——回执全成功等价
    //（无错误条/无 Modal），DB 无第二次升格副作用（版本行计数零变化）
    await toggle(page).click()
    await expect(toggle(page)).toHaveText('取消')
    await page.locator('[data-dswf-kn-act-selectall]').click()
    await expect(selCount(page)).toHaveText('已选 5 / 共 5')
    await page.locator('[data-dswf-kn-act-confirm]').click()
    await expect(page.locator('.dswf-kn-reject-modal')).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-error]')).toHaveCount(0)
    for (const entry of J1_CORPUS) {
      await expectStatus(page, entry.title, 'confirmed')
    }
    {
      const db = openReviewDb(userData)
      try {
        for (const entry of J1_CORPUS) {
          const row = entryByTitle(db, entry.title)
          expect(row.status).toBe('confirmed')
          expect(versionCount(db, row.slug), `${entry.id} 幂等重放零重复版本行`).toBe(versionsBefore[entry.id])
        }
      } finally {
        db.close()
      }
    }
    await evidenceShot(page, 'j1-golden-4-idempotent-replay.png')
    expect(projectId).toBeDefined()
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Golden Path 步骤 5-6：驳回 Modal（取消 = 零动作）→ 确认驳回三表零残留 + 热度史保留
// ─────────────────────────────────────────────────────────────────────────────
test('J1·Golden 5-6：驳回 Modal 取消零动作/确认三表零残留 + recall_logs 保留', async () => {
  const { root, wsDir } = makeReviewCorpus(J1_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    // 热度预置：u1 落 3 条 recall_logs（驳回后热度史保留断言供数）
    launched = await bootKnowledgeReview({
      wsDir,
      heatSeeds: [{ entryTitle: '批量 through 前端一', count: 3 }],
    })
    const { page, userData } = launched

    const db0 = openReviewDb(userData)
    let u1Id: number
    let u2Id: number
    let heatBefore: number
    try {
      u1Id = entryByTitle(db0, '批量 through 前端一').rid
      u2Id = entryByTitle(db0, '批量 through 前端二').rid
      heatBefore = recallLogCount(db0, u1Id)
    } finally {
      db0.close()
    }
    expect(heatBefore).toBe(3)

    // 网格就绪后再进多选（checkbox 可见性依赖多选模式在场）
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(5)
    await toggle(page).click()
    await expect(toggle(page)).toHaveText('取消')
    await checkCard(page, '批量 through 前端一')
    await checkCard(page, '批量 through 前端二')
    await expect(selCount(page)).toHaveText('已选 2 / 共 5')

    // 步骤 5a：驳回 → 官方 Modal 确认框（清单 + 数量）
    await page.locator('[data-dswf-kn-act-reject]').click()
    const modal = page.locator('.dswf-kn-reject-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('驳回 2 条待审核条目')
    await expect(modal).toContainText('删除其文件')
    await evidenceShot(page, 'j1-golden-5-reject-modal.png')

    // 步骤 5b：取消——零动作（文件/DB 零变化、勾选集保留、多选模式不退出）
    await modal.getByRole('button', { name: '取消' }).click()
    await expect(modal).toHaveCount(0)
    await expect(selCount(page)).toHaveText('已选 2 / 共 5')
    await expect(toggle(page)).toHaveText('取消')
    {
      const db = openReviewDb(userData)
      try {
        expect(entryByTitle(db, '批量 through 前端一').status).toBe('unconfirmed')
        expect(entryByTitle(db, '批量 through 前端二').status).toBe('unconfirmed')
      } finally {
        db.close()
      }
    }
    expect(existsSync(fileOf(wsDir, '前端', 'u1')), '取消后 u1 文件在').toBe(true)
    expect(existsSync(fileOf(wsDir, '前端', 'u2')), '取消后 u2 文件在').toBe(true)

    // 步骤 5c：再驳回并确认
    await page.locator('[data-dswf-kn-act-reject]').click()
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: '确认驳回' }).click()

    // 步骤 6：条目消失——文件、版本行、FTS 行三处零残留；recall_logs 热度史保留；
    // 视图重拉后卡片不再在场
    await expect(card(page, '批量 through 前端一')).toHaveCount(0)
    await expect(card(page, '批量 through 前端二')).toHaveCount(0)
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(3)
    // 动作成功自动退出多选（act exit）——计数行隐去、toggle 复位「多选」
    await expect(selCount(page)).toHaveCount(0)
    await expect(toggle(page)).toHaveText('多选')
    await evidenceShot(page, 'j1-golden-6-after-reject.png')
    expect(existsSync(fileOf(wsDir, '前端', 'u1')), 'u1 文件硬删').toBe(false)
    expect(existsSync(fileOf(wsDir, '前端', 'u2')), 'u2 文件硬删').toBe(false)
    expect(existsSync(fileOf(wsDir, '前端', 'u3')), '未勾选条目不受波及').toBe(true)
    {
      const db = openReviewDb(userData)
      try {
        expect(entryGone(db, '批量 through 前端一'), 'u1 主行零残留').toBe(true)
        expect(entryGone(db, '批量 through 前端二'), 'u2 主行零残留').toBe(true)
        expect(versionCount(db, 'u1'), 'u1 版本行零残留').toBe(0)
        expect(versionCount(db, 'u2'), 'u2 版本行零残留').toBe(0)
        expect(ftsCount(db, 'u1'), 'u1 FTS 零残留').toBe(0)
        expect(ftsCount(db, 'u2'), 'u2 FTS 零残留').toBe(0)
        expect(recallLogCount(db, u1Id), 'u1 recall_logs 热度史保留').toBe(heatBefore)
        expect(entryByTitle(db, '批量 through 已确认').status).toBe('confirmed')
      } finally {
        db.close()
      }
    }
    expect(u2Id).toBeGreaterThan(0)
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 边界：部分失败不回滚（J1-3 rejected-confirmed）+ 多选模式退出零残留（J1-4 反向锚）
// ─────────────────────────────────────────────────────────────────────────────
test('J1·边界：混合集驳回部分失败不回滚（rejected-confirmed）+ 退出多选零残留', async () => {
  const corpus: readonly CorpusEntry[] = [J1_CORPUS[0]!, J1_CORPUS[1]!, J1_CORPUS[4]!]
  const { root, wsDir } = makeReviewCorpus(corpus)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched

    // 网格就绪后再进多选
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(3)
    await toggle(page).click()
    await expect(toggle(page)).toHaveText('取消')
    // 勾选混合集：1 unconfirmed + 1 confirmed → 驳回 → 确认
    await checkCard(page, '批量 through 前端一')
    await checkCard(page, '批量 through 已确认')
    await expect(selCount(page)).toHaveText('已选 2 / 共 3')
    await page.locator('[data-dswf-kn-act-reject]').click()
    const modal = page.locator('.dswf-kn-reject-modal')
    await expect(modal).toBeVisible()
    await modal.getByRole('button', { name: '确认驳回' }).click()

    // 部分失败不回滚：unconfirmed 正常删除；confirmed 拒收（rejected-confirmed 语义）原状
    await expect(card(page, '批量 through 前端一')).toHaveCount(0)
    await expect(card(page, '批量 through 已确认')).toHaveCount(1)
    await expect(card(page, '批量 through 前端二')).toHaveCount(1)
    await evidenceShot(page, 'j1-boundary-partial-failure.png')
    expect(existsSync(fileOf(wsDir, '前端', 'u1')), 'u1 文件删除').toBe(false)
    expect(existsSync(fileOf(wsDir, '前端', 'c1')), 'c1 文件保留').toBe(true)
    {
      const db = openReviewDb(userData)
      try {
        expect(entryGone(db, '批量 through 前端一'), 'u1 主行零残留').toBe(true)
        const c1 = entryByTitle(db, '批量 through 已确认')
        expect(c1.status, 'c1 零变化').toBe('confirmed')
        expect(versionCount(db, c1.slug), 'c1 版本行零变化').toBeGreaterThan(0)
        expect(ftsCount(db, c1.slug), 'c1 FTS 零变化').toBeGreaterThan(0)
      } finally {
        db.close()
      }
    }

    // J1-4 反向锚：动作成功后产品自动退出多选（act exit）——功能组隐去、勾选清零、
    // checkbox 隐去；重进多选 = 勾选集从零开始
    await expect(toggle(page)).toHaveText('多选')
    await expect(selCount(page)).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-act-confirm]')).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-act-reject]')).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-act-selectall]')).toHaveCount(0)
    await expect(page.locator('[data-dswf-kn-card-check]')).toHaveCount(0)
    await evidenceShot(page, 'j1-boundary-exit-clean.png')
    await toggle(page).click()
    await expect(selCount(page)).toHaveText('已选 0 / 共 2')
  } finally {
    await teardownReview(launched, [root])
  }
})
