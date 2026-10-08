// M3 SC 套件支撑面（任务 5.2）——预设座位交互 + boot-overlay 物化解析 + 会话头预设
// 投影标签定位。座位形制沿 spike 3.9 五轮实证（m3-rerun.spec.ts：座位 =
// conversation.hero.agentPreset 槽内菜单按钮，折叠 label 显预设 id、healthy 显显示名、
// broken 回退 id；菜单项组合「显示名+描述」文本）。投影标签（AgentPresetLabel）=
// conversation.session.header.actions 槽 order -10 官方行——非 blank 会话的预设投影
// 重建断言面（上游 0.2.0-rc.2 源码核实：label = session.projectionValues.agentPreset）。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { ensureNoBlockingDialog } from './modals.js'

/** 预设座位槽（官方 conversation.hero.agentPreset——blank 会话 hero 面在场） */
export const SEAT_ROOT = '[data-slot="conversation.hero.agentPreset"]'

/** 座位根（first——多会话挂载期唯一 hero 面） */
export function seatRoot(page: Page): ReturnType<Page['locator']> {
  return page.locator(SEAT_ROOT).first()
}

/** 座位按钮在场（spike 形制：槽内 button 承载点选） */
export async function seatPresent(page: Page, timeoutMs = 25_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await seatRoot(page).locator('button').first().isVisible().catch(() => false)) return true
    await page.waitForTimeout(1_000)
  }
  return false
}

/** 座位折叠 label（异步水化——名册 RPC 未达期瞬时空串非异常） */
export async function seatLabel(page: Page): Promise<string> {
  const text = await seatRoot(page).textContent({ timeout: 5_000 }).catch(() => '')
  return (text ?? '').trim()
}

/** 座位 label 轮询收敛（名册水化窗口内重读——空串 = 未水化） */
export async function awaitSeatLabel(page: Page, timeoutMs = 25_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let label = ''
  while (Date.now() < deadline) {
    label = await seatLabel(page)
    if (label !== '') return label
    await page.waitForTimeout(1_000)
  }
  return label
}

/** 经座位菜单选预设（菜单项 = 「显示名+描述」组合文本——容器过滤 + 包含匹配；失败取证） */
export async function selectPresetViaSeat(page: Page, displayName: string, id: string): Promise<boolean> {
  await seatRoot(page).locator('button').first().click({ timeout: 10_000 })
  await page.waitForTimeout(1_500)
  const inMenu = (text: string) =>
    page
      .locator('[role="menu"] [role="menuitem"], [role="menu"] li, [role="menu"] button, [class*="menu"] [role="menuitem"]')
      .filter({ hasText: text })
      .first()
  for (const loc of [inMenu(displayName), inMenu(id), page.getByText(displayName, { exact: false }).last()]) {
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 5_000 })
      await page.waitForTimeout(1_500)
      return true
    }
  }
  return false
}

/** 中文名 ↔ 预设 id（产品双预设词汇——远征 expedition / 突击 blitz） */
export function presetIdOf(name: string): string {
  if (name === '突击模式') return 'blitz'
  if (name === '远征模式') return 'expedition'
  return name
}

/** 经座位菜单选预设（失败即抛——SC 断言面不容静默降级） */
export async function selectPreset(page: Page, name: string): Promise<void> {
  const ok = await selectPresetViaSeat(page, name, presetIdOf(name))
  if (!ok) throw new Error(`预设菜单选不到 ${name}（座位菜单取证见截图/日志）`)
}

// ─── 会话面（官方新会话入口——跳转观测夹具） ───

/**
 * 新开 blank 会话（官方「新会话」入口——spike 3.9 实测形制：aria-label 三候选 + 文本
 * 回退；跳转观测面 = 新 blank 会话与既有会话可判（hero 面/转录空））。
 */
export async function newBlankSession(page: Page): Promise<void> {
  for (const sel of ['button[aria-label="新会话"]', 'button[aria-label="New session"]', 'button[aria-label="New chat"]']) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible().catch(() => false)) {
      await loc.click({ timeout: 5_000 })
      await page.waitForTimeout(2_000)
      return
    }
  }
  const byText = page.getByText('新会话', { exact: true }).first()
  if (await byText.isVisible().catch(() => false)) {
    await byText.click({ timeout: 5_000 }).catch(() => undefined)
    await page.waitForTimeout(2_000)
    return
  }
  throw new Error('新会话入口缺席（aria-label 三候选 + 文本回退均不可见）')
}

// ─── 会话头预设投影标签（AgentPresetLabel——非 blank 会话投影重建面） ───

/**
 * 会话头预设投影标签（官方 label span：icon + 预设显示名文本）。非 blank 会话 hero
 * 座位卸载后由本面承载「恢复会话按 agentPreset 投影重建」断言（SC1④）。作用域 =
 * 会话头动作带（ConversationRoot headerActions 容器——CSS 模块类名稳定段）。
 * 判据 = 在场（attached）：label 仅当 projectionValues.agentPreset 在场才渲染（缺席 =
 * null 零 DOM）；可见性受官方响应式折叠影响（@container width<=540px display:none——
 * 右栏 dock 展开挤压主区时折叠），非投影语义面。
 */
export function presetHeaderLabel(page: Page, presetName: string): ReturnType<Page['locator']> {
  return page.locator('[class*="headerActions"]').getByText(presetName, { exact: true }).first()
}

/** 等待会话头投影标签在场（投影水化异步——30s 窗；判据 = attached） */
export async function awaitPresetHeaderLabel(page: Page, presetName: string, timeoutMs = 30_000): Promise<void> {
  await expect(presetHeaderLabel(page, presetName), `会话头预设投影标签在场（${presetName}）`).toBeAttached({ timeout: timeoutMs })
}

// ─── 晚到模态处置（零凭据模型失败面——M2 纪律扩展） ───

/**
 * 晚到模态收敛等待：零凭据形态下模型调用失败可晚于消息落地数十秒挂载 API Key
 * onboarding（全屏 mask 拦指针——M2 SC6③ 台账口径）。轮询点掉（ensureNoBlockingDialog
 * 单发不够——挂载时机晚于单发检查）；收敛判据 = 零 [role=dialog] 在场。
 */
export async function awaitNoLateModals(page: Page, rounds = 6, gapMs = 1_500): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    await page.waitForTimeout(gapMs)
    await ensureNoBlockingDialog(page)
    if ((await page.locator('[role="dialog"]').count()) === 0) return
  }
  const dump = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"]')).map((el) => (el.textContent ?? '').trim().slice(0, 200)),
  )
  throw new Error(`晚到模态未收敛（${String(rounds)} 轮）：${JSON.stringify(dump)}`)
}

// ─── 任务子 tab 视图切换（4.6 v22 工具栏——ViewDropdown 菜单径） ───

/** 视图中文标签（TASK_VIEWS 词汇——ViewDropdown 菜单项文本） */
const VIEW_LABELS: Readonly<Record<'list' | 'swim' | 'dag', string>> = { list: '列表', swim: '泳道', dag: 'DAG' }

/**
 * 三视图切换（v22 视图下拉：锚钮 → 菜单项）。锚钮 data-dswf-tt-viewbtn 显当前视图
 * （非三钮直切——M2 旧锚 data-dswf-tt-view 已随 v22 工具栏退役）。
 */
export async function switchTaskView(page: Page, view: 'list' | 'swim' | 'dag'): Promise<void> {
  await page.locator('[data-dswf-tt-viewbtn]').first().click({ timeout: 15_000 })
  const menu = page.locator('[role="menu"]').first()
  const item = menu.locator('button, [role="menuitem"], li').filter({ hasText: VIEW_LABELS[view] }).first()
  await item.click({ timeout: 15_000 })
  // 切换收敛确认：锚钮值显新视图（menu 关闭 + 受控态落地——防重渲染窗口丢点）
  await expect(page.locator('[data-dswf-tt-viewbtn]').first()).toHaveAttribute('data-dswf-tt-viewbtn', view, { timeout: 15_000 })
}

// ─── boot-overlay.yml 物化解析（SC2 装配面断言素材） ───

/** boot 叠层物化文件（host boot 每启写 userData） */
export function overlayTextOf(userData: string): string {
  const file = join(userData, 'boot-overlay.yml')
  if (!existsSync(file)) throw new Error(`boot-overlay.yml 缺席：${file}（boot 装配面异常）`)
  return readFileSync(file, 'utf8')
}

/** YAML 双引号标量反转义（overlay.ts yamlQuote 对称面：\\ → \，\" → "） */
function unquoteYamlScalar(raw: string): string {
  return raw.replace(/\\(.)/g, '$1')
}

/** 全文 customSkillDirs 条目（所有块并集——含预设行 + 全局行） */
export function customSkillDirEntries(text: string): string[] {
  const out: string[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*customSkillDirs:\s*$/.test(lines[i] as string)) continue
    for (let j = i + 1; j < lines.length; j++) {
      const m = /^\s*-\s+"(.+)"\s*$/.exec(lines[j] as string)
      if (m === null) break
      out.push(unquoteYamlScalar(m[1] as string))
    }
  }
  return out
}

/** 单预设块切片（`- id: preset-<id>` 行起至下一个同级 `- id:`/`- insert:` 行止） */
export function presetBlockOf(text: string, presetId: string): string {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => new RegExp(`^-\\s+id:\\s*preset-${presetId}\\s*$`).test(l) || new RegExp(`^\\s+- id: preset-${presetId}\\s*$`).test(l))
  if (start < 0) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^-\s+(id|insert):/.test(lines[i] as string)) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n')
}

/** 块内 customSkillDirs 条目（预设组合技能目录——L1 物理边界断言面） */
export function presetSkillDirs(text: string, presetId: string): string[] {
  return customSkillDirEntries(presetBlockOf(text, presetId))
}
