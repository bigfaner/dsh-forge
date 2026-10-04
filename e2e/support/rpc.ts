// e2e renderer RPC 面（fix-37 ① 收编）——forgeInvoke（×9 同体）/ invokeHeat /
// registerProject（RPC 直注 + 等待收敛）/ selectWorkspaceViaChip 单源。
// DTO 手抄面（ProjectSummaryLike/RegisterResultLike ×5——fix-37 ⑤）改 import contracts
// typed DTO（纯类型单源，两侧各自引包防 schema 漂移——TECH-rpc-002）。
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import type { ProjectSummary, RegisterResult } from '../../packages/contracts/src/dto/project.js'
import { COMPOSER_INPUT, TAB_ITEM, workbenchOfView } from './anchors.js'

/** renderer forge RPC 面（preload dshForge.invoke——信封 {ok,data} 由本面解包） */
export async function forgeInvoke<T>(page: Page, channel: string, payload?: unknown): Promise<T> {
  const data = await page.evaluate(async ({ ch, args }) => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
    if (forge === undefined) throw new Error('dshForge preload 面缺席')
    const envelope = await forge.invoke(ch, args)
    if (!envelope.ok) throw new Error(`forge RPC ${ch} 失败：${JSON.stringify(envelope)}`)
    return envelope.data
  }, { ch: channel, args: payload })
  return data as T
}

/** heat 通道专用（Map 经 Playwright 通道退化为普通对象——页内先转 entries，Node 侧重建） */
export async function invokeHeat(page: Page, projectId: string): Promise<Map<number, number>> {
  const entries = await page.evaluate(async (id) => {
    const forge = (globalThis as { dshForge?: { invoke(c: string, p?: unknown): Promise<{ ok: boolean; data?: unknown; message?: string }> } }).dshForge
    const envelope = await forge!.invoke('forge:knowledge/heat', { projectId: id })
    if (!envelope.ok) throw new Error(`forge RPC heat 失败：${JSON.stringify(envelope)}`)
    const heat = envelope.data as Map<number, number>
    return heat instanceof Map ? [...heat.entries()] : Object.entries(heat as Record<string, number>).map(([k, v]) => [Number(k), v] as [number, number])
  }, projectId)
  return new Map(entries as readonly [number, number][])
}

/** 注册负载（输入同表单面——workspaceDir canonical 化由注册链承接） */
function registerPayload(dir: string, name: string): Record<string, string> {
  return {
    workspaceDir: dir,
    name,
    forgeDir: join(dir, '.forge'),
    knowledgeDir: join(dir, '.knowledge'),
  }
}

/** RPC 直注注册——返回 RegisterResult（挂接/补偿语义断言面） */
export async function registerProjectRaw(page: Page, dir: string, name: string): Promise<RegisterResult> {
  return forgeInvoke<RegisterResult>(page, 'forge:projects/register', registerPayload(dir, name))
}

/**
 * RPC 直注注册 + 等待收敛——返回应用库行（ProjectSummary）。
 * 显式 expect toBeDefined（fix-37 ⑦：`projects.find(...)!` 非空断言 → 显式断言后收窄）。
 */
export async function registerProject(page: Page, dir: string, name: string): Promise<ProjectSummary> {
  const result = await forgeInvoke<{ projectId: string }>(page, 'forge:projects/register', registerPayload(dir, name))
  const projects = await forgeInvoke<readonly ProjectSummary[]>(page, 'forge:projects/list')
  const row = projects.find((p) => p.id === result.projectId)
  expect(row, `注册行入列（RPC 收敛——${name}）`).toBeDefined()
  return row as ProjectSummary
}

/**
 * composer 工作区芯片流（选定工作区 = 官方会话面新会话入口——installer/flywheel/krf/sw 同径）。
 * 菜单 = 开启瞬间的账本快照（注册实体传播滞后 → 需要时调用侧重开轮询）。
 */
export async function selectWorkspaceViaChip(page: Page, workspaceName: string): Promise<void> {
  const composer = page.locator(COMPOSER_INPUT).last()
  await expect(composer, '官方会话面 composer 在场').toBeVisible({ timeout: 60_000 })
  const chip = page.locator('button', { hasText: /^默认工作区$|^选择工作区$/ }).first()
  await expect(chip).toBeVisible({ timeout: 30_000 })
  await chip.click()
  const menu = page.locator('[role="menu"]').first()
  await expect(menu).toBeVisible({ timeout: 15_000 })
  const item = menu
    .locator('button, [role="menuitem"], [role="menuitemradio"], [role="option"]')
    .filter({ hasText: workspaceName })
    .first()
  await expect(item, `夹具工作区在列（${workspaceName}）`).toBeVisible({ timeout: 15_000 })
  await item.click()
  await expect(page.locator(workbenchOfView('session')).first()).toBeAttached()
}

/** 会话页签点击厂（TAB_ITEM + 文案过滤——对话/轨迹/知识召回三签） */
export function conversationTab(page: Page, text: string): ReturnType<Page['locator']> {
  return page.locator(TAB_ITEM, { hasText: text })
}
