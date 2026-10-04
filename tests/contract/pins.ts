// G1 契约面 pin 池共用基座（tests/contract/，与 core/web 单测分池——任务 2.13）。
// Hard Rule：本池只 pin 上游公开面（npm 包导出与运行时契约），不 pin 上游内部实现细节（防脆断）。
//
// 锚定策略：pin 目标 = 实依赖该上游包的 workspace 工程所实装的版本（pnpm 布局下各工程
// node_modules 即真相）。三锚点：
//   host    = apps/host（宿主侧依赖：dsh-app-boot / dsh / dsh-workspace / dsh-client-connection / dsh-host-webserver）
//   web     = apps/web（构建侧依赖：dsh-client-web / dsh-client-ui-dockkit）
//   profile = apps/host/profile.dev（运行期组合物化：官方 ui-* client 插件，boot manifest 经
//             profile 装载——ui-sidebar / ui-chat / ui-conversation / ui-trajectory / ui-theme）
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect } from 'vitest'

/** 仓库根（tests/contract/pins.ts → 上两级） */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 上游 dsh 公开栈精确 pin 版本（tech-design Dependencies：P1 期不开升级窗口） */
export const PIN_VERSION = '0.2.0-rc.2'

export type Anchor = 'host' | 'web' | 'profile'

const ANCHOR_FILES: Readonly<Record<Anchor, string>> = {
  host: 'apps/host/package.json',
  web: 'apps/web/package.json',
  profile: 'apps/host/profile.dev/package.json',
}

function anchorRequire(anchor: Anchor): NodeRequire {
  return createRequire(join(ROOT, ANCHOR_FILES[anchor]))
}

/** 上游包根目录（经 `<name>/package.json` 出口解析；锚点工程须实依赖该包） */
export function upstreamDir(anchor: Anchor, name: string): string {
  return dirname(anchorRequire(anchor).resolve(`${name}/package.json`))
}

/** 读上游包内文件文本（d.ts / README / client bundle 等随包分发面） */
export function readUpstream(anchor: Anchor, name: string, relPath: string): string {
  return readFileSync(join(upstreamDir(anchor, name), relPath), 'utf8')
}

/** 上游 package.json（解析后的 JSON 对象） */
export function upstreamPkg(anchor: Anchor, name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(upstreamDir(anchor, name), 'package.json'), 'utf8')) as Record<string, unknown>
}

/**
 * 动态引入上游包模块（bare 说明符在 tests/ 不解析，经锚点 require.resolve 转文件 URL）。
 * 仅用于无浏览器副作用的入口（dsh-app-boot / dsh profile-boot / dsh-workspace / dsh-client-web
 * injections / dsh-host-webserver 均实测 Node 直载通过；浏览器面 bundle 走文本 pin）。
 */
export async function importUpstream(anchor: Anchor, specifier: string): Promise<Record<string, unknown>> {
  const entry = anchorRequire(anchor).resolve(specifier)
  const mod = (await import(pathToFileURL(entry).href)) as Record<string, unknown>
  return mod
}

/** 版本 pin：锚点工程实装的上游包必须等于精确 pin 版本（升级窗口外的任何漂移即红） */
export function expectPinnedVersion(anchor: Anchor, name: string): void {
  const pkg = upstreamPkg(anchor, name)
  expect(pkg['version'], `${name}@${ANCHOR_FILES[anchor]} 实装版本漂移`).toBe(PIN_VERSION)
}

/** d.ts 文本按需读（快捷面） */
export function readTypes(anchor: Anchor, name: string, relPath: string): string {
  return norm(readUpstream(anchor, name, relPath))
}

/** 压空白 + 剥 JSDoc 注释装饰：d.ts 断行/缩进无关的短语与签名匹配基（多行折叠为单空格） */
export function norm(text: string): string {
  return text
    .replace(/(^|\n)\s*\/?\*+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 提取 d.ts 顶层 interface 成员名集合（按 4 空格缩进声明行；readonly/可选标记剥除，
 * 文档注释行天然排除——tsc d.ts 输出格式稳定）。须传原始文本（非 norm 压缩）。
 * 用于「成员集 pin」：上游增删公开面成员即红（漂移检测），成员内部形状不逐字 pin（防脆断）。
 */
export function interfaceMembers(rawTypes: string, interfaceName: string): string[] {
  const re = new RegExp(`export interface ${interfaceName} \\{\\n([\\s\\S]*?)\\n\\}`)
  const block = rawTypes.match(re)?.[1]
  expect(block, `d.ts 未找到 export interface ${interfaceName}（或块内为空）`).toBeTruthy()
  const members = new Set<string>()
  for (const line of (block as string).split('\n')) {
    const m = line.match(/^ {4}(?:readonly )?([A-Za-z_$][\w$]*)\??\s*:/)
    if (m) members.add(m[1] as string)
  }
  return [...members].sort()
}

/**
 * 提取 SlotMap 声明内 8 空格缩进的洞名键全集（`'name': {` 行）。
 * 上游槽位声明（declare module '@deepseek-ai/dsh-client-ui-slots' 内 SlotMap 增强块）。
 */
export function slotMapKeys(rawTypes: string): string[] {
  const keys = new Set<string>()
  for (const m of rawTypes.matchAll(/^ {8}'([^']+)': \{$/gm)) keys.add(m[1] as string)
  return [...keys].sort()
}

/**
 * 提取具名槽洞声明块（洞名 → `kind/scope/owner` 三行）并压空白。
 * 上游洞形状（single/list/chain + owner props 类型名）即替换占位的注册契约。
 */
export function slotHole(rawTypes: string, holeName: string): string {
  const re = new RegExp(`^ {8}'${holeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}': \\{([\\s\\S]*?)^ {8}\\}`, 'm')
  const m = rawTypes.match(re)
  expect(m, `SlotMap 未声明洞位 ${holeName}`).toBeTruthy()
  if (m === null) throw new Error(`SlotMap 未声明洞位 ${holeName}`) // 类型收窄（expect 不窄化——测试类型门）
  return norm(m[1] ?? '')
}

/** 提取上游包 `dsh.client` 声明（boot manifest 组合依赖清单——包级公开常量面） */
export function dshClientDecl(anchor: Anchor, name: string): Record<string, unknown> {
  const pkg = upstreamPkg(anchor, name)
  const dsh = pkg['dsh'] as { client?: Record<string, unknown> } | undefined
  expect(dsh?.client, `${name} 缺 dsh.client 声明`).toBeTruthy()
  return dsh?.client as Record<string, unknown>
}
