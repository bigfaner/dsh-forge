// 旅程③ knowledge-review-edit-save——dialog 编辑保存（版本链前进 + 指针前移）（journey.md J3-1~J3-3）。
// 覆盖：编辑模式布局（域只读 + 标题可编辑同行；字段序 关键词 chips→摘要→正文；标题栏
// [保存]+✕）、chip 双击改词/✕ 移除/＋ 新增交互收口（不触发卡片点击）、保存成功回查看 +
// 卡片重拉、版本链前进语义（新版本行在场且为 confirmed_version_id 指针所指；旧权威降
// superseded；status 不变）、原文件重写（域不变）+ DB 派生列从重写后文件重解析、FTS 按
// 新内容可召回、校验错误留 dialog（空标题——零写盘）、YAML 结构字符样例 round-trip 文件
// 零损坏、unconfirmed 编辑不升格、Esc 链（编辑→查看→关闭——未保存草稿零写盘）。
// 降级注记（journey.md 共通锚 §15）：
// - diag 面（knowledge-meta-edit）归 host 日志域，本套件不取（同旅程①口径）；
// - J3-2 YAML 注入「服务面拒收回执」：UI 表单值经 YAML dumper quote 后均可 round-trip，
//   真机无注入通道构造必拒样例——拒收回执语义（yaml-invalid code 分派）由服务面单测 +
//   EntryDrawer 单测承载（错误留 dialog 断言以本地校验径真机覆盖）；本套件以真机可达面
//   收口：注入样例保存后文件 round-trip 完整、值逐字一致（文件零损坏负例）；
// - J3-3 >3 层域拒收（editMeta 径）：域只读 UI 下通道直发不可达——三径同函数校验由服务
//   面单测承载（updateEntry 径域不参与重写）；
// - 边界⑤ busy 门防重复提交：并发窗口无真机注入通道——busy 门由 EntryDrawer 单测承载。
// 本任务不做运行取证——真机 e2e 断言执行归债务任务 knowledge-review-ui/1.15。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
import { parseFm } from '../journey-fm.js'
import type { SeedDb } from '../../../packages/core/src/testutil/db-seeds.js'

test.setTimeout(600_000)

// ── 查询面（插件自持库——状态语义断言，不锁实现）─────────────────────────────

interface EntryRow {
  readonly rid: number
  readonly slug: string
  readonly status: string
  readonly confirmedVersionId: string | null
}

function entryByTitle(db: SeedDb, title: string): EntryRow {
  const row = db
    .prepare('SELECT rowid AS rid, id AS slug, status, confirmed_version_id AS confirmedVersionId FROM knowledge_entries WHERE title = ?')
    .get(title) as EntryRow | undefined
  expect(row, `条目在索引（${title}）`).toBeDefined()
  return row as EntryRow
}

function versionList(db: SeedDb, slug: string): string[] {
  return (
    db.prepare('SELECT version_ts FROM knowledge_entry_versions WHERE id = ? ORDER BY version_ts').all(slug) as {
      version_ts: string
    }[]
  ).map((r) => r.version_ts)
}

function ftsRow(db: SeedDb, slug: string): { title: string; keywords: string; summary: string } {
  const row = db
    .prepare('SELECT title, keywords, summary FROM knowledge_fts WHERE id = ?')
    .get(slug) as { title: string; keywords: string; summary: string } | undefined
  expect(row, `FTS 行在场（${slug}）`).toBeDefined()
  return row as { title: string; keywords: string; summary: string }
}

/** FTS5 召回面（bm25 检索内核同虚表——按新内容可召回断言） */
function ftsMatch(db: SeedDb, query: string): readonly string[] {
  return (
    db.prepare('SELECT id FROM knowledge_fts WHERE knowledge_fts MATCH ?').all(query) as { id: string }[]
  ).map((r) => r.id)
}

function domainDir(wsDir: string, domain: string): string {
  return join(wsDir, '.knowledge', domain)
}

/** 域目录内当前 md 文件名集合（新版本文件落盘检测——不锁文件命名实现） */
function mdFiles(wsDir: string, domain: string): readonly string[] {
  return readdirSync(domainDir(wsDir, domain)).filter((f) => f.endsWith('.md'))
}

// ── UI 面（稳定 data 属性锚——不断视觉坐标、不锁文案字面与 DOM 层级）──────────

function card(page: Page, title: string): Locator {
  return page.locator('[data-dswf-entry]', { hasText: title }).first()
}

function dialog(page: Page): Locator {
  return page.locator('[data-dswf-kn-dialog]')
}

async function openDialog(page: Page, title: string): Promise<void> {
  await card(page, title).click()
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).locator('[data-dswf-kn-dialog-actions]')).toBeVisible({ timeout: 30_000 })
}

async function enterEdit(page: Page, title: string): Promise<Locator> {
  await openDialog(page, title)
  await dialog(page).locator('[data-dswf-kn-dialog-edit]').click()
  const dlg = dialog(page)
  await expect(dlg.locator('[data-dswf-kn-edit]')).toBeVisible()
  return dlg
}

/** 关键词 chip 交互三收口：双击改词 / ✕ 移除 / ＋ 新增（回车收口——不触发卡片点击） */
async function editChip(page: Page, dlg: Locator, opts: {
  readonly reword?: { readonly from: string; readonly to: string }
  readonly remove?: string
  readonly add?: string
}): Promise<void> {
  if (opts.reword !== undefined) {
    await dlg.locator(`[data-dswf-kn-kwchip="${opts.reword.from}"]`).dblclick()
    const kwedit = dlg.locator('[data-dswf-kn-kwedit]')
    await expect(kwedit).toBeVisible()
    await kwedit.fill(opts.reword.to)
    await kwedit.press('Enter')
    await expect(dlg.locator(`[data-dswf-kn-kwchip="${opts.reword.to}"]`)).toBeVisible()
  }
  if (opts.remove !== undefined) {
    await dlg.locator(`[data-dswf-kn-kwchip="${opts.remove}"]`).locator('[data-dswf-kn-kwx]').click()
    await expect(dlg.locator(`[data-dswf-kn-kwchip="${opts.remove}"]`)).toHaveCount(0)
  }
  if (opts.add !== undefined) {
    await dlg.locator('[data-dswf-kn-kwadd]').click()
    const kwedit = dlg.locator('[data-dswf-kn-kwedit]')
    await expect(kwedit).toBeVisible()
    await kwedit.fill(opts.add)
    await kwedit.press('Enter')
    await expect(dlg.locator(`[data-dswf-kn-kwchip="${opts.add}"]`)).toBeVisible()
  }
}

// ── corpus（旅程③口径：confirmed 主角 + unconfirmed 反向锚 + filler）──────────

const J3_CORPUS: readonly CorpusEntry[] = [
  { domain: '前端', id: 'c1', title: '编辑链 已确认主角', summary: '预置已确认条目', keywords: ['前端', '基线'], status: 'confirmed' },
  { domain: '前端', id: 'u1', title: '编辑链 待审核配角', summary: '待审核条目', keywords: ['前端', '配角'] },
]

// ─────────────────────────────────────────────────────────────────────────────
// J3-1 Golden 1-6：编辑布局 → chip 三收口 + 全字段改 → 保存 → 版本链前进 + 指针前移 +
// 旧版降 superseded + status 不变 + 原文件重写（派生列重解析）+ FTS 新内容可召回
// ─────────────────────────────────────────────────────────────────────────────
test('J3·J3-1：dialog 编辑保存——全字段更新 + 版本链前进/指针前移/旧版降级/文件重写/FTS 召回', async () => {
  const { root, wsDir } = makeReviewCorpus(J3_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(2)
    // 基线：1 个版本行 + 初始文件集合（供前进/重写对照）
    let baseVersionTs: string
    {
      const db = openReviewDb(userData)
      try {
        const row = entryByTitle(db, '编辑链 已确认主角')
        expect(row.status).toBe('confirmed')
        const versions = versionList(db, row.slug)
        expect(versions).toHaveLength(1)
        baseVersionTs = versions[0]!
        expect(row.confirmedVersionId).toBe(baseVersionTs)
      } finally {
        db.close()
      }
    }
    const filesBefore = mdFiles(wsDir, '前端')

    // Golden 1：编辑模式布局——域（只读）+ 标题（可编辑）同行；字段序 chips→摘要→正文；
    // 标题栏变 [保存]+✕（通过/驳回/编辑退场）
    const dlg = await enterEdit(page, '编辑链 已确认主角')
    // 域只读（改域唯一入口 = 域树拖拽）+ 值随条目域
    const domInput = dlg.locator('[data-dswf-kn-edit-dom]')
    await expect(domInput).toBeVisible()
    expect(await domInput.getAttribute('readonly')).not.toBeNull()
    await expect(domInput).toHaveValue('域：前端')
    const titleInput = dlg.locator('[data-dswf-kn-edit-title]')
    await expect(titleInput).toBeVisible()
    await expect(titleInput).toHaveValue('编辑链 已确认主角')
    // 字段序锚：三字段容器在场（顺序断言 = 容器 DOM 序——非视觉坐标）
    const order = await dlg.evaluate((root) => {
      const pick = (key: string): number =>
        [...root.querySelectorAll(`[data-dswf-kn-edit-field="${key}"]`)].reduce(
          (acc, el) => Math.min(acc, [...root.querySelectorAll('*')].indexOf(el as Element)),
          Number.MAX_SAFE_INTEGER,
        )
      return { keywords: pick('keywords'), summary: pick('summary'), body: pick('body') }
    })
    expect(order.keywords, '字段序：关键词 chips 在摘要前').toBeLessThan(order.summary)
    expect(order.summary, '字段序：摘要在正文前').toBeLessThan(order.body)
    await expect(dlg.locator('[data-dswf-kn-dialog-save]')).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-dialog-confirm]')).toHaveCount(0)
    await expect(dlg.locator('[data-dswf-kn-dialog-reject]')).toHaveCount(0)
    await expect(dlg.locator('[data-dswf-kn-dialog-edit]')).toHaveCount(0)
    await evidenceShot(page, 'j3-golden-1-edit-layout.png')

    // Golden 2：chip 双击改词 / ✕ 移除 / ＋ 新增（各自收口、互不触发卡片点击）+ 改摘要正文
    await editChip(page, dlg, { reword: { from: '基线', to: '检索锚' } })
    await editChip(page, dlg, { remove: '前端' })
    await editChip(page, dlg, { add: '新词' })
    await expect(dialog(page)).toBeVisible() // chip 交互不开卡片/不退 dialog
    await titleInput.fill('编辑链 新标题')
    await dlg.locator('[data-dswf-kn-edit-summary]').fill('编辑后的摘要')
    await dlg.locator('[data-dswf-kn-edit-body]').fill('编辑后的正文。')
    await evidenceShot(page, 'j3-golden-2-chip-edits.png')

    // Golden 3：保存成功——回查看模式且呈现新值；卡片重拉显示新标题
    await dlg.locator('[data-dswf-kn-dialog-save]').click()
    await expect(page.locator('[data-dswf-kn-toast]')).toContainText('已保存')
    await expect(dlg.locator('[data-dswf-kn-edit]')).toHaveCount(0)
    await expect(dlg.locator('[data-dswf-kn-dialog-save]')).toHaveCount(0)
    await expect(dlg.locator('[data-dswf-kn-dialog-edit]')).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-body]')).toContainText('编辑后的正文。')
    await expect(card(page, '编辑链 新标题')).toBeVisible({ timeout: 30_000 })
    await expect(card(page, '编辑链 已确认主角')).toHaveCount(0)
    await evidenceShot(page, 'j3-golden-3-saved-view.png')
    await page.keyboard.press('Escape') // 关 dialog 转数据锚核对
    await expect(dialog(page)).toHaveCount(0)

    // Golden 4-6：版本链前进 + 指针前移 + 旧版降 superseded + status 不变 +
    // 原文件重写（域不变）+ 派生列重解析 + FTS 新内容可召回（状态语义断言，不锁实现）
    {
      const db = openReviewDb(userData)
      try {
        const row = entryByTitle(db, '编辑链 新标题')
        expect(row.slug, 'editMeta 恰改一条：id 不变').toBe('c1')
        expect(row.status, 'status 保持 confirmed 不变（不因编辑漂移）').toBe('confirmed')
        const versions = versionList(db, row.slug)
        expect(versions, '版本链前进：恰 +1 版本行').toHaveLength(2)
        const newVersionTs = versions[versions.length - 1]!
        expect(newVersionTs, '新版本行 != 旧版本').not.toBe(baseVersionTs)
        expect(row.confirmedVersionId, 'confirmed_version_id 指针前移至新版本').toBe(newVersionTs)
        // DB 派生列 = 从重写后文件重解析（入参副本污染负例不成立）
        const fts = ftsRow(db, row.slug)
        expect(fts.title).toBe('编辑链 新标题')
        expect(fts.keywords.split(' ').sort()).toEqual(['新词', '检索锚'])
        expect(fts.summary).toBe('编辑后的摘要')
        expect(ftsMatch(db, '检索锚'), 'FTS 按新关键词可召回').toContain('c1')
        expect(ftsMatch(db, '前端'), '旧关键词出索引（权威面刷新）').not.toContain('c1')
      } finally {
        db.close()
      }
    }
    // 文件面：新版本文件落盘（同域目录）+ 旧权威降 superseded（status 键直书——保 confirmed_at）
    const filesAfter = mdFiles(wsDir, '前端')
    expect(filesAfter.length, '恰新增一个版本文件').toBe(filesBefore.length + 1)
    const newFile = filesAfter.find((f) => !filesBefore.includes(f))
    expect(newFile, '新版本文件在场').toBeDefined()
    const newFm = parseFm(readFileSync(join(domainDir(wsDir, '前端'), newFile!), 'utf8'))
    expect(newFm.data.id).toBe('c1')
    expect(newFm.data.status).toBe('confirmed')
    expect(newFm.data.title).toBe('编辑链 新标题')
    expect(newFm.data.supersedes).toBe(baseVersionTs)
    expect(newFm.content.trim()).toBe('编辑后的正文。')
    const oldFile = filesBefore.find((f) => existsSync(join(domainDir(wsDir, '前端'), f)))
    expect(oldFile, '旧权威文件在（降级非删除）').toBeDefined()
    const oldFm = parseFm(readFileSync(join(domainDir(wsDir, '前端'), oldFile!), 'utf8'))
    expect(oldFm.data.status, '旧权威降 superseded').toBe('superseded')
    await evidenceShot(page, 'j3-golden-4-6-chain-forward.png')
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J3-2 边界：校验错误留 dialog（空标题零写盘）+ YAML 结构字符样例 round-trip 零损坏 +
// Esc 链（编辑→查看→关闭，未保存草稿零写盘）
// ─────────────────────────────────────────────────────────────────────────────
test('J3·J3-2：校验错误留 dialog + 注入样例文件零损坏 + Esc 链草稿零写盘', async () => {
  const { root, wsDir } = makeReviewCorpus(J3_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(2)
    const filesBefore = mdFiles(wsDir, '前端')

    // 边界①：空标题提交——dswf-dlg-err 同型错误行、dialog 不关、数据零变化
    const dlg = await enterEdit(page, '编辑链 已确认主角')
    await dlg.locator('[data-dswf-kn-edit-title]').fill('')
    await dlg.locator('[data-dswf-kn-dialog-save]').click()
    await expect(dlg.locator('[data-dswf-kn-dlg-err]').first()).toBeVisible()
    await expect(dlg.locator('[data-dswf-kn-edit]')).toBeVisible() // dialog 不关（留编辑态）
    {
      const db = openReviewDb(userData)
      try {
        expect(versionList(db, entryByTitle(db, '编辑链 已确认主角').slug)).toHaveLength(1)
      } finally {
        db.close()
      }
    }
    expect(mdFiles(wsDir, '前端')).toEqual(filesBefore)
    await evidenceShot(page, 'j3-j21-validation-stays.png')

    // 边界②：YAML 结构字符样例——真机可达面 = round-trip 完整（文件零损坏）；
    // 拒收回执语义降级服务面单测（头注记）
    await dlg.locator('[data-dswf-kn-edit-title]').fill('注入样例: 标题 [括号] 引号"x"')
    await editChip(page, dlg, { add: 'a: [b, c]' })
    await dlg.locator('[data-dswf-kn-edit-body]').fill('---\n结构字符正文')
    await dlg.locator('[data-dswf-kn-dialog-save]').click()
    await expect(page.locator('[data-dswf-kn-toast]')).toContainText('已保存')
    await expect(card(page, '注入样例: 标题 [括号] 引号"x"')).toBeVisible({ timeout: 30_000 })
    const filesAfter = mdFiles(wsDir, '前端')
    expect(filesAfter.length).toBe(filesBefore.length + 1)
    const newFile = filesAfter.find((f) => !filesBefore.includes(f))
    expect(newFile).toBeDefined()
    const raw = readFileSync(join(domainDir(wsDir, '前端'), newFile!), 'utf8')
    const fm = parseFm(raw)
    expect(fm.data.title, '结构字符 title round-trip 逐字一致').toBe('注入样例: 标题 [括号] 引号"x"')
    expect(raw, '结构字符 keyword round-trip 逐字一致（文件零损坏）').toContain('a: [b, c]')
    {
      const db = openReviewDb(userData)
      try {
        const row = entryByTitle(db, '注入样例: 标题 [括号] 引号"x"')
        expect(row.status).toBe('confirmed')
        expect(ftsRow(db, row.slug).title).toBe('注入样例: 标题 [括号] 引号"x"')
      } finally {
        db.close()
      }
    }
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)

    // 边界⑥：Esc 链——编辑态 Esc 回查看、再 Esc 关闭；未保存草稿丢弃零写盘
    const dlg2 = await enterEdit(page, '编辑链 待审核配角')
    await dlg2.locator('[data-dswf-kn-edit-title]').fill('未保存草稿标题')
    await page.keyboard.press('Escape') // 编辑 → 查看
    await expect(dlg2.locator('[data-dswf-kn-edit]')).toHaveCount(0)
    await expect(dlg2.locator('[data-dswf-kn-body]')).toBeVisible()
    await expect(dialog(page)).toBeVisible() // 未关闭（链式次序第一跳）
    await page.keyboard.press('Escape') // 查看 → 关闭
    await expect(dialog(page)).toHaveCount(0)
    {
      const db = openReviewDb(userData)
      try {
        expect(entryByTitle(db, '编辑链 待审核配角').status).toBe('unconfirmed')
        expect(versionList(db, 'u1')).toHaveLength(1)
      } finally {
        db.close()
      }
    }
    expect(mdFiles(wsDir, '前端')).toEqual(filesAfter)
    await expect(card(page, '编辑链 待审核配角')).toBeVisible() // 草稿未落卡片
    await evidenceShot(page, 'j3-esc-chain-draft-dropped.png')
  } finally {
    await teardownReview(launched, [root])
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// J3-3：unconfirmed 条目编辑——版本链同样前进，status 保持 unconfirmed（不因人工编辑升格）
// ─────────────────────────────────────────────────────────────────────────────
test('J3·J3-3：unconfirmed 编辑——版本前进、status 不升格', async () => {
  const { root, wsDir } = makeReviewCorpus(J3_CORPUS)
  let launched: ReviewLaunch | undefined
  try {
    launched = await bootKnowledgeReview({ wsDir })
    const { page, userData } = launched
    await expect(page.locator('[data-dswf-entry]')).toHaveCount(2)

    const dlg = await enterEdit(page, '编辑链 待审核配角')
    await dlg.locator('[data-dswf-kn-edit-title]').fill('编辑链 待审核改题')
    await dlg.locator('[data-dswf-kn-dialog-save]').click()
    await expect(page.locator('[data-dswf-kn-toast]')).toContainText('已保存')
    await expect(card(page, '编辑链 待审核改题')).toBeVisible({ timeout: 30_000 })
    // status 保持 unconfirmed（不因人工编辑而升格）——chip 文案与 DB 双锚
    await expect(card(page, '编辑链 待审核改题').locator('.dswf-state-chip')).toHaveText('unconfirmed')
    await evidenceShot(page, 'j3-j33-unconfirmed-edit.png')
    {
      const db = openReviewDb(userData)
      try {
        const row = entryByTitle(db, '编辑链 待审核改题')
        expect(row.slug, 'id 不变').toBe('u1')
        expect(row.status, 'status 保持 unconfirmed').toBe('unconfirmed')
        expect(versionList(db, row.slug), '版本链前进').toHaveLength(2)
      } finally {
        db.close()
      }
    }
    expect(existsSync(join(domainDir(wsDir, '前端'), 'u1.md')), '旧权威文件降级保留').toBe(true)
  } finally {
    await teardownReview(launched, [root])
  }
})
