// skill-dirs/sync — customSkillDirs 配置写入与漂移校验(M3 task 5.7;tech-design
// §Interface 6 / §Security T3 / D2 承载路径)。
//
// 机制面:应用 boot 时把本插件技能根(resources/skills,task 5.6 的 15 项扁平名
// 目录)写入应用自有 host profile 的用户层 dsh 配置(<profileDir>/cordis.patch.yml,
// vendored PROFILE_PATCH_FILENAME —— loadProfileDirectory 的 user layer),作为
// `id: skill-filesystem` 行的 config.customSkillDirs 条目;vendored
// skill-filesystem provider 以 CUSTOM_RANK 扫描该根(消费形态 = Config.customSkillDirs
// 字符串数组,resolve 后寻址 —— 本模块零上游改动)。
//
// 调用方向(Hard Rule:customSkillDirs 仅应用写入):本模块只被 Electron 壳主进程
// 在 projectHostProfile 物化插件之后、supervisor.startHost 之前动态导入执行
// (apps/desktop/src/main/host-profile/skill-dirs.ts —— 经 lib/skill-dirs.js 独立
// 产物,见 tsdown 第二入口;宿主 boot 在 composeProfile 时一次性读入 user layer,
// 插件激活后再写对当次 boot 不生效,故插件 host 半身自身不触发同步)。本文件不
// import cordis/peer —— node 内建之外零依赖:打包态物化目录没有自有 node_modules,
// 任何 npm 依赖在宿主安装闭包外不可解析。
//
// 三道防线:
//   1. 前缀校验(T3):技能根必须位于插件安装目录(<profileDir>/node_modules)之内;
//      越界即拒绝写入(failed + ERR_SKILL_DIR_SYNC)—— 本模块永远不可能成为任意
//      目录注入技能面的写入方。
//   2. 漂移校验:配置条目缺失/重复、陈旧受管条目(升级后安装目录漂移)、清单 hash
//      不符(技能树被增删改,marker 对照)→ 重写恢复;受管条目 = 安装目录前缀内的
//      条目(应用责任,可清理),前缀外的条目 = 用户自有,字节级原样保留(不破坏
//      用户既有其他目录项)。
//   3. 显式告警不静默:一切不可管理的形态(不可解析的行结构 / flow 式数组 / 重复
//      行 / 技能根缺失 / 写失败)→ 不落笔、返回 failed + { code: ERR_SKILL_DIR_SYNC }
//      —— 由壳侧 shellLog + 设置面告警条目(WorkbenchState.skillDirSyncAlerts)
//      呈现,绝不静默吞掉。
//
// YAML 编辑策略:无 YAML 依赖(见上),对 patch 文件做行级手术 —— 仅改写
// customSkillDirs 条目行区间 / 追加受管行块,其余内容(用户行、注释、!!js 表达式、
// 排版)逐字节保留;不可安全手术的形态显式拒绝而非猜测改写。产物恒为 vendored
// parsePatchList 可接受的顶层 YAML 数组(js-yaml + entryListSchema)。

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, type Dirent } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

/** 受管 loader 行 id(vendored base bundle 的 skill-filesystem 行;稳定寻址键)。 */
export const SKILL_PROVIDER_ROW_ID = 'skill-filesystem'

/** 用户层 dsh 配置文件名(vendored PROFILE_PATCH_FILENAME 同名)。 */
export const PROFILE_PATCH_FILENAME = 'cordis.patch.yml'

/** 漂移校验 marker(落 profile 目录;per-plugin 记录技能根 + 清单 hash)。 */
export const SKILL_DIRS_MARKER_FILENAME = '.dsh-forge-skill-dirs.json'

/** 本插件包名(marker 键;插件自知身份,壳侧零硬编码)。 */
export const PLUGIN_NAME = '@dsh-forge/plugin-forge-workbench'

/** 技能根相对本插件包目录的位置(task 5.6 约定)。 */
export const SKILLS_REL_DIR = 'resources/skills'

/** 同步失败告警码(tech-design §Error Types & Codes)。 */
export const SKILL_DIR_SYNC_ERROR_CODE = 'ERR_SKILL_DIR_SYNC' as const

/** 设置面告警条目(壳侧 WorkbenchState.skillDirSyncAlerts 行形态)。 */
export interface SkillDirSyncAlert {
  readonly code: typeof SKILL_DIR_SYNC_ERROR_CODE
  readonly plugin: string
  readonly message: string
  readonly detail?: string | undefined
}

/** syncSkillDirs 入参。 */
export interface SkillDirSyncInput {
  /** 应用自有 host profile 目录(用户层配置与 marker 的落点)。 */
  readonly profileDir: string
  /** 本插件物化目录(技能根锚点;安装目录前缀判定基准)。 */
  readonly pluginDir: string
  /** 技能根相对 pluginDir 的路径(缺省 resources/skills)。 */
  readonly skillsRelDir?: string | undefined
}

/** 同步结局:clean = 无漂移零写入;written = 首写;repaired = 漂移重写;failed = 告警。 */
export type SkillDirSyncStatus = 'clean' | 'written' | 'repaired' | 'failed'

/** syncSkillDirs 产物(failed 时携带 alert;changes 供 boot 日志留痕)。 */
export interface SkillDirSyncResult {
  readonly status: SkillDirSyncStatus
  readonly plugin: string
  readonly skillRoot: string
  /** failed 时的显式告警(ERR_SKILL_DIR_SYNC;其余状态无)。 */
  readonly alert?: SkillDirSyncAlert | undefined
  /** 人类可读变更清单(状态非 clean 时非空)。 */
  readonly changes: readonly string[]
}

/** 内部拒绝/失败信号(永不越过 syncSkillDirs 边界;外部只见 failed 结果)。 */
class SkillDirSyncError extends Error {
  constructor(readonly reason: string, readonly detail?: string) {
    super(reason)
    this.name = 'SkillDirSyncError'
  }
}

/** Marker 单插件记录。 */
interface SkillDirsMarkerEntry {
  skillRoot: string
  manifestHash: string
  syncedAt: string
}

/** Marker 文件形态(per-plugin 键控;version 字段护形态演进)。 */
interface SkillDirsMarker {
  version: 1
  plugins: Record<string, SkillDirsMarkerEntry>
}

// ---------------------------------------------------------------------------
// 路径判定(T3 前缀校验)
// ---------------------------------------------------------------------------

/**
 * `child` 是否位于 `ancestor` 目录之内(含相等;path.relative 语义,win32
 * 大小写不敏感)。空串/`..` 开头/绝对路径 = 越界。
 */
export function isPathInside(child: string, ancestor: string): boolean {
  const rel = relative(resolve(ancestor), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 本同步的插件安装目录前缀 = profile 的 node_modules(projector 物化根)。
 * 受管条目/写入候选一律以此为界:界内 = 应用责任(可写可清理),界外 = 用户
 * 自有(保留不动),候选越界 = T3 拒绝。
 */
export function installRootOf(profileDir: string): string {
  return resolve(profileDir, 'node_modules')
}

// ---------------------------------------------------------------------------
// 清单 hash(15 项技能清单的增删改感知)
// ---------------------------------------------------------------------------

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function walkFiles(root: string, prefix: string, out: string[]): void {
  const entries: Dirent[] = readdirSync(join(root, prefix), { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) walkFiles(root, rel, out)
    else if (entry.isFile()) out.push(`${rel}:${sha256File(join(root, rel))}`)
  }
}

/**
 * 技能清单 hash:技能根全树(扁平名目录 + 附随资源)逐文件 sha256 的规范化
 * 串联再取 sha256。增/删/改任一文件 ⇒ hash 变化;与 marker 记录对照即漂移。
 * 技能根缺失/不可读 ⇒ SkillDirSyncError(显式失败,不猜测)。
 */
export function computeSkillManifestHash(skillRoot: string): string {
  let top: Dirent[]
  try {
    top = readdirSync(skillRoot, { withFileTypes: true })
  } catch (error) {
    throw new SkillDirSyncError(
      `skill root ${skillRoot} cannot be read`,
      error instanceof Error ? error.message : String(error),
    )
  }
  const sections: string[] = []
  for (const entry of top.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      const files: string[] = []
      walkFiles(skillRoot, entry.name, files)
      sections.push(`[${entry.name}]\n${files.join('\n')}`)
    } else if (entry.isFile()) {
      sections.push(`[${entry.name}]\n${entry.name}:${sha256File(join(skillRoot, entry.name))}`)
    }
  }
  if (sections.length === 0) {
    throw new SkillDirSyncError(`skill root ${skillRoot} holds no skill entries`)
  }
  return createHash('sha256').update(sections.join('\n\n')).digest('hex')
}

// ---------------------------------------------------------------------------
// 行级 YAML 手术(零依赖;用户内容字节级保留)
// ---------------------------------------------------------------------------

/** 受管行块(本模块写入的唯一形态;键缩进 2 / 列表键缩进 4 / 条目缩进 6)。 */
const ROW_KEY_INDENT = 2
const LIST_KEY_INDENT = 4
const ENTRY_INDENT = 6

/** 受管行块头注(标注应用写入面;不承载语义)。 */
const MANAGED_ROW_COMMENT = '# dsh-forge: app-managed skill-filesystem row (customSkillDirs sync; see task 5.7)'

/** YAML 单引号标量编码(路径安全:仅 ' 需转义,成对翻倍)。 */
function quoteYamlString(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`
}

/** 标量解码:裸 / 单引号('' → ')/ 双引号(常见转义;其余原样)。 */
function unquoteYamlScalar(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('\'') && value.endsWith('\'')) {
    return value.slice(1, -1).replace(/''/gu, '\'')
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\nrt])/gu, (_match, char: string) => {
      switch (char) {
        case 'n': return '\n'
        case 'r': return '\r'
        case 't': return '\t'
        default: return char
      }
    })
  }
  return value
}

/** 行内容(去 EOL);YAML 注释行/空行判定。 */
function lineBody(line: string): string {
  return line.replace(/\r$/u, '')
}
function isBlankOrComment(line: string): boolean {
  const body = lineBody(line)
  return body.trim() === '' || body.trimStart().startsWith('#')
}

/** 缩进宽度(制表符计 1;本模块自产行恒为空格,外来制表行只做保守解析)。 */
function indentOf(line: string): number {
  return lineBody(line).length - lineBody(line).trimStart().length
}

/** 匹配 `key: value` 形态的键行(值可省略);返回去引号后的值。 */
function keyEntry(line: string, key: string): string | undefined {
  const body = lineBody(line)
  const match = new RegExp(`^\\s*${key}:(?:\\s+(.*?))?(?:#.*)?$`, 'u').exec(body)
  if (match === null) return undefined
  if (match[1] === undefined) return ''
  return unquoteYamlScalar(match[1])
}

/** 手术产物。createdRow = 本次创建了受管行(首写语义);否则为既有行内修复。 */
export interface PatchTextEdit {
  readonly text: string
  readonly changed: boolean
  readonly createdRow: boolean
  readonly changes: readonly string[]
}

/**
 * 把 `skillRoot` 作为 customSkillDirs 受管条目写进 patch 文本。
 *
 * - 文本缺失/空注释文件/`[]` 模板 → 创建为含受管行的合法列表;
 * - 已有受管行 → 仅改写其 customSkillDirs 条目区间;
 * - 条目规划(见 planCustomSkillDirs):用户条目原行保留、陈旧受管条目清理、
 *   技能根去重保证恰好一条;
 * - 不可安全手术的形态(flow 式数组、嵌套块值、重复受管行、非列表文档)
 *   ⇒ SkillDirSyncError(拒绝落笔,原文件不动)。
 */
export function applySkillDirsToPatchText(
  text: string | undefined,
  skillRoot: string,
  installRoot: string,
): PatchTextEdit {
  const eol = text !== undefined && text.includes('\r\n') ? '\r\n' : '\n'
  const lines: string[] = text === undefined ? [] : text.split(/\r?\n/u)
  // split 尾元素:原文以 EOL 结尾时为 ''。剔除后行数组拼接时以 EOL 收尾还原。
  const trailingEmpty = lines.length > 0 && lines[lines.length - 1] === ''
  const bodyLines = trailingEmpty ? lines.slice(0, -1) : lines

  // —— 顶层列表项定位(行首 `- `)——
  const itemStarts: number[] = []
  for (const [index, line] of bodyLines.entries()) {
    if (/^-(?=\s|$)/u.test(lineBody(line))) itemStarts.push(index)
  }

  if (itemStarts.length === 0) {
    // 无任何列表项:仅接受三种形态 —— 缺失 / 纯注释与空行 / 单行 `[]` 模板。
    const contentLines = bodyLines.filter(line => !isBlankOrComment(line))
    if (contentLines.length === 0) {
      const block = managedRowBlock(skillRoot)
      if (bodyLines.length > 0) {
        // 注释/空行后追加(保留原注释;拼接出合法列表文档)。
        return { text: `${[...bodyLines, ...block].join(eol)}${eol}`, changed: true, createdRow: true, changes: ['patch layer created with the managed skill-filesystem row'] }
      }
      return { text: `${[MANAGED_ROW_COMMENT, ...block].join(eol)}${eol}`, changed: true, createdRow: true, changes: ['patch layer created with the managed skill-filesystem row'] }
    }
    if (contentLines.length === 1 && contentLines[0]?.trim() === '[]') {
      const at = bodyLines.indexOf(contentLines[0])
      const next = [...bodyLines.slice(0, at), ...managedRowBlock(skillRoot), ...bodyLines.slice(at + 1)]
      return { text: `${next.join(eol)}${eol}`, changed: true, createdRow: true, changes: ['empty patch list replaced with the managed skill-filesystem row'] }
    }
    throw new SkillDirSyncError('patch layer holds no top-level list rows this module can manage (expected `- ` items, `[]`, comments, or an absent file)')
  }

  // —— 受管行寻址(全部顶层项里 id === skill-filesystem 的映射行)——
  const rowRanges = itemStarts.map((start, index) =>
    [start, index + 1 < itemStarts.length ? itemStarts[index + 1]! : bodyLines.length] as const)
  const managedRows = rowOffsetsById(bodyLines, rowRanges, SKILL_PROVIDER_ROW_ID)
  if (managedRows.length > 1) {
    throw new SkillDirSyncError(`patch layer holds ${String(managedRows.length)} rows with id "${SKILL_PROVIDER_ROW_ID}" — refusing to pick one`)
  }

  if (managedRows.length === 0) {
    const block = managedRowBlock(skillRoot)
    const next = [...bodyLines, ...block]
    return { text: `${next.join(eol)}${eol}`, changed: true, createdRow: true, changes: ['managed skill-filesystem row appended'] }
  }

  const [rowStart, rowEnd] = managedRows[0]!
  return editRowEntries(bodyLines, rowStart, rowEnd, skillRoot, installRoot, eol)
}

/** 受管行块(注释行 + 行体;调用方负责落位)。 */
function managedRowBlock(skillRoot: string): string[] {
  return [
    MANAGED_ROW_COMMENT,
    `- id: ${SKILL_PROVIDER_ROW_ID}`,
    `${' '.repeat(ROW_KEY_INDENT)}config:`,
    `${' '.repeat(LIST_KEY_INDENT)}customSkillDirs:`,
    `${' '.repeat(ENTRY_INDENT)}- ${quoteYamlString(skillRoot)}`,
  ]
}

/**
 * 在行数组中找 key `id` 值等于 `id` 的顶层映射项区间。识别两种形态:项行
 * 内联键(`- id: x`)与 `-` 独行后首个键行;id 出现在更深位置的非典型行不作
 * 受管行识别(此时本模块会追加自己的行 —— loader 后写者胜,收敛安全)。
 */
function rowOffsetsById(
  lines: readonly string[],
  ranges: readonly (readonly [number, number])[],
  id: string,
): Array<readonly [number, number]> {
  const found: Array<readonly [number, number]> = []
  for (const [start, end] of ranges) {
    const itemLine = lineBody(lines[start] ?? '')
    const dashStripped = itemLine.replace(/^-\s*/u, '')
    if (dashStripped.trim() !== '') {
      if (keyEntry(`  ${dashStripped}`, 'id') === id) found.push([start, end])
      continue
    }
    for (let i = start + 1; i < end; i++) {
      const line = lines[i]!
      if (isBlankOrComment(line)) continue
      const value = keyEntry(line, 'id')
      if (value === id) found.push([start, end])
      break
    }
  }
  return found
}

/** 行内手术:定位/创建 config.customSkillDirs 并重排条目区间。 */
function editRowEntries(
  bodyLines: readonly string[],
  rowStart: number,
  rowEnd: number,
  skillRoot: string,
  installRoot: string,
  eol: string,
): PatchTextEdit {
  const row = bodyLines.slice(rowStart, rowEnd)
  // 行键缩进基准:项行内联键(`- id: x` ⇒ dash 段宽)或 `-` 独行后首个键行。
  const itemLine = lineBody(row[0] ?? '')
  const dashMatch = /^- */u.exec(itemLine)
  const inline = dashMatch !== null && dashMatch[0].length < itemLine.trimEnd().length
  const keyIndent = inline
    ? dashMatch![0].length
    : indentOf(row.slice(1).find(line => !isBlankOrComment(line)) ?? '')

  // config: 键行(与 id 键同级)。
  let configIndex = -1
  for (let i = 1; i < row.length; i++) {
    const line = row[i]!
    if (isBlankOrComment(line)) continue
    if (indentOf(line) < keyIndent) break
    const value = keyEntry(line, 'config')
    if (value !== undefined) {
      if (value !== '') {
        // `config:` 带内联值(flow 映射)—— 行级手术无法安全处理:拒绝猜测。
        throw new SkillDirSyncError('the skill-filesystem row carries an inline config value this module cannot manage')
      }
      configIndex = i
      break
    }
  }

  if (configIndex === -1) {
    // 无 config:在 id 键行后插入完整受管段(其余行原样)。
    const insertAt = inline
      ? 1
      : row.findIndex((line, index) => index > 0 && !isBlankOrComment(line)) + 1
    const addition = [
      `${' '.repeat(keyIndent)}config:`,
      `${' '.repeat(keyIndent + LIST_KEY_INDENT - ROW_KEY_INDENT)}customSkillDirs:`,
      `${' '.repeat(keyIndent + ENTRY_INDENT - ROW_KEY_INDENT)}- ${quoteYamlString(skillRoot)}`,
    ]
    const nextRow = [...row.slice(0, insertAt), ...addition, ...row.slice(insertAt)]
    const next = [...bodyLines.slice(0, rowStart), ...nextRow, ...bodyLines.slice(rowEnd)]
    return { text: `${next.join(eol)}${eol}`, changed: true, createdRow: false, changes: ['customSkillDirs config inserted into the managed row'] }
  }

  // customSkillDirs: 键行(config 子键,缩进 = keyIndent + 2)。
  const listKeyIndent = keyIndent + (LIST_KEY_INDENT - ROW_KEY_INDENT)
  let listIndex = -1
  for (let i = configIndex + 1; i < row.length; i++) {
    const line = row[i]!
    if (isBlankOrComment(line)) continue
    if (indentOf(line) <= keyIndent) break
    const value = keyEntry(line, 'customSkillDirs')
    if (value !== undefined) {
      if (value !== '') {
        // flow 式(`customSkillDirs: [a, b]`)—— 行级手术无法安全处理:拒绝。
        throw new SkillDirSyncError('customSkillDirs is written in flow style (inline value) — this module only manages block-style lists')
      }
      listIndex = i
      break
    }
  }

  if (listIndex === -1) {
    // 有 config: 无 customSkillDirs:紧随 config: 之后插入键 + 受管条目。
    const addition = [
      `${' '.repeat(listKeyIndent)}customSkillDirs:`,
      `${' '.repeat(keyIndent + (ENTRY_INDENT - ROW_KEY_INDENT))}- ${quoteYamlString(skillRoot)}`,
    ]
    const insertAt = configIndex + 1
    const nextRow = [...row.slice(0, insertAt), ...addition, ...row.slice(insertAt)]
    const next = [...bodyLines.slice(0, rowStart), ...nextRow, ...bodyLines.slice(rowEnd)]
    return { text: `${next.join(eol)}${eol}`, changed: true, createdRow: false, changes: ['customSkillDirs list created with the skill root entry'] }
  }

  // 条目区间:listIndex 之后,缩进 > listKeyIndent 的 `- ` 项;区间内注释/
  // 空行原位保留(惰性通过,不参与增删);深缩进非列表行 = 嵌套块 ⇒ 拒绝。
  let regionEnd = listIndex + 1
  const entryIndexes: number[] = []
  while (regionEnd < row.length) {
    const line = row[regionEnd]!
    if (isBlankOrComment(line)) {
      regionEnd++
      continue
    }
    if (indentOf(line) <= listKeyIndent) break
    if (!/^\s*-(?=\s|$)/u.test(lineBody(line))) {
      throw new SkillDirSyncError('customSkillDirs holds a nested block this module cannot manage')
    }
    entryIndexes.push(regionEnd)
    regionEnd++
  }

  const parsedEntries = entryIndexes.map(index => unquoteYamlScalar(lineBody(row[index]!).replace(/^\s*-\s*/u, '')))
  const plan = planCustomSkillDirs(parsedEntries, skillRoot, installRoot)

  if (!plan.changed) return { text: `${[...bodyLines].join(eol)}${eol}`, changed: false, createdRow: false, changes: [] }

  // 重建条目区间:注释/空行与保留项原行原序回放(用户条目字节保真);删除项
  // (陈旧受管/重复技能根)剔除;技能根缺位时以规范形态追加到区间尾部。
  const drop = new Set<number>()
  plan.removedIndices.forEach((order) => { drop.add(entryIndexes[order]!) })
  plan.duplicateIndices.forEach((order) => { drop.add(entryIndexes[order]!) })
  const rebuilt: string[] = []
  for (let i = listIndex + 1; i < regionEnd; i++) {
    if (drop.has(i)) continue
    rebuilt.push(row[i]!)
  }
  if (plan.currentFirstIndex === -1) {
    rebuilt.push(`${' '.repeat(keyIndent + (ENTRY_INDENT - ROW_KEY_INDENT))}- ${quoteYamlString(skillRoot)}`)
  }

  const nextRow = [...row.slice(0, listIndex + 1), ...rebuilt, ...row.slice(regionEnd)]
  const next = [...bodyLines.slice(0, rowStart), ...nextRow, ...bodyLines.slice(rowEnd)]
  return { text: `${next.join(eol)}${eol}`, changed: true, createdRow: false, changes: plan.changes }
}

// ---------------------------------------------------------------------------
// 条目规划(纯函数:去重 / 保留用户项 / 清理陈旧受管项 / T3 界定)
// ---------------------------------------------------------------------------

/** planCustomSkillDirs 产物。 */
export interface SkillDirsPlan {
  readonly changed: boolean
  /** 保留条目在输入中的索引(原序)。 */
  readonly keptIndices: readonly number[]
  /** 删除条目索引(陈旧受管条目 + 重复技能根)。 */
  readonly removedIndices: readonly number[]
  readonly duplicateIndices: readonly number[]
  /** 技能根首次出现索引;-1 = 需追加。 */
  readonly currentFirstIndex: number
  readonly changes: readonly string[]
}

/**
 * 规划 customSkillDirs 条目集:受管界(installRoot)内条目归应用(陈旧清理、
 * 技能根去重保留),界外条目 = 用户自有(一律保留)。注入面防护在写入侧:
 * 技能根本身越界时 syncSkillDirs 已先行拒绝,本函数不会把界外候选写成受管项。
 */
export function planCustomSkillDirs(
  entries: readonly string[],
  skillRoot: string,
  installRoot: string,
): SkillDirsPlan {
  const removedIndices: number[] = []
  const duplicateIndices: number[] = []
  const keptIndices: number[] = []
  const changes: string[] = []
  let currentFirstIndex = -1
  let seenCurrent = false
  for (const [index, entry] of entries.entries()) {
    const isCurrent = entry === skillRoot
    if (isCurrent) {
      if (!seenCurrent) {
        seenCurrent = true
        currentFirstIndex = index
        keptIndices.push(index)
      } else {
        duplicateIndices.push(index)
        changes.push('duplicate skill root entry removed')
      }
      continue
    }
    if (isPathInside(entry, installRoot)) {
      removedIndices.push(index)
      changes.push(`stale app-managed entry removed: ${entry}`)
      continue
    }
    keptIndices.push(index)
  }
  const changed = removedIndices.length > 0 || duplicateIndices.length > 0 || currentFirstIndex === -1
  if (currentFirstIndex === -1) changes.push('skill root entry ensured')
  return { changed, keptIndices, removedIndices, duplicateIndices, currentFirstIndex, changes }
}

// ---------------------------------------------------------------------------
// Marker(清单 hash 对照)
// ---------------------------------------------------------------------------

function markerPath(profileDir: string): string {
  return join(profileDir, SKILL_DIRS_MARKER_FILENAME)
}

/** 读取 marker(缺失/损坏 → undefined;调用方按漂移处理)。 */
export function readSkillDirsMarker(profileDir: string): SkillDirsMarker | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(markerPath(profileDir), 'utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
    const version = (parsed as { version?: unknown }).version
    const plugins = (parsed as { plugins?: unknown }).plugins
    if (version !== 1 || typeof plugins !== 'object' || plugins === null) return undefined
    return parsed as SkillDirsMarker
  } catch {
    return undefined
  }
}

function writeSkillDirsMarker(profileDir: string, plugin: string, skillRoot: string, manifestHash: string): void {
  const marker = readSkillDirsMarker(profileDir) ?? { version: 1, plugins: {} }
  marker.plugins = {
    ...marker.plugins,
    [plugin]: { skillRoot, manifestHash, syncedAt: new Date().toISOString() },
  }
  atomicWrite(markerPath(profileDir), `${JSON.stringify(marker, undefined, 2)}\n`)
}

/** 原子写(tmp + rename;与壳侧 seed marker 同款纪律)。 */
function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp-${String(process.pid)}`
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

// ---------------------------------------------------------------------------
// boot 同步入口
// ---------------------------------------------------------------------------

function failed(plugin: string, skillRoot: string, reason: string, detail?: string): SkillDirSyncResult {
  return {
    status: 'failed',
    plugin,
    skillRoot,
    alert: { code: SKILL_DIR_SYNC_ERROR_CODE, plugin, message: reason, ...(detail === undefined ? {} : { detail }) },
    changes: [],
  }
}

/**
 * boot 同步:写入/修复用户层 customSkillDirs(见模块头)。永不抛错 —— 一切
 * 失败折为 failed + ERR_SKILL_DIR_SYNC 告警(显式不静默,Hard Rule)。
 */
export function syncSkillDirs(input: SkillDirSyncInput): SkillDirSyncResult {
  const plugin = PLUGIN_NAME
  const skillRoot = resolve(input.pluginDir, input.skillsRelDir ?? SKILLS_REL_DIR)
  const installRoot = installRootOf(input.profileDir)

  // 防线 1 —— T3 前缀校验:技能根越界 = 拒绝写入(本模块不作注入向量)。
  if (!isPathInside(skillRoot, installRoot)) {
    return failed(
      plugin,
      skillRoot,
      `skill root ${skillRoot} escapes the plugin install directory ${installRoot} — refusing to write customSkillDirs (T3 path-integrity guard)`,
    )
  }

  // 防线 2a —— 技能根存在性 + 清单 hash。
  if (!existsSync(skillRoot) || !statSync(skillRoot).isDirectory()) {
    return failed(plugin, skillRoot, `skill root ${skillRoot} is missing — the plugin materialization is incomplete`)
  }
  let manifestHash: string
  try {
    manifestHash = computeSkillManifestHash(skillRoot)
  } catch (error) {
    const reason = error instanceof SkillDirSyncError ? error.reason : 'skill manifest hashing failed'
    const detail = error instanceof Error ? error.message : String(error)
    return failed(plugin, skillRoot, reason, detail)
  }

  // 防线 2b —— patch 文本手术(拒绝 = 显式失败,原文件不动)。
  const patchPath = join(input.profileDir, PROFILE_PATCH_FILENAME)
  let originalText: string | undefined
  try {
    originalText = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : undefined
  } catch (error) {
    return failed(plugin, skillRoot, `user-layer dsh config ${patchPath} cannot be read`, error instanceof Error ? error.message : String(error))
  }
  let edit: PatchTextEdit
  try {
    edit = applySkillDirsToPatchText(originalText, skillRoot, installRoot)
  } catch (error) {
    const reason = error instanceof SkillDirSyncError ? error.reason : 'user-layer dsh config cannot be managed'
    const detail = error instanceof Error ? error.message : String(error)
    return failed(plugin, skillRoot, reason, detail)
  }

  // 防线 2c —— marker 对照(升级后技能树变化/路径漂移 ⇒ 重写 + 刷新 marker)。
  const marker = readSkillDirsMarker(input.profileDir)
  const markerEntry = marker?.plugins[plugin]
  const markerDrift = markerEntry === undefined
    || markerEntry.skillRoot !== skillRoot
    || markerEntry.manifestHash !== manifestHash

  if (!edit.changed && !markerDrift) {
    return { status: 'clean', plugin, skillRoot, changes: [] }
  }

  // 写入(patch + marker;任一失败 = failed 告警 —— 不静默)。
  try {
    mkdirSync(input.profileDir, { recursive: true })
    if (edit.changed) atomicWrite(patchPath, edit.text)
    writeSkillDirsMarker(input.profileDir, plugin, skillRoot, manifestHash)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return failed(plugin, skillRoot, `writing the user-layer dsh config or sync marker failed: ${detail}`)
  }

  const status: SkillDirSyncStatus = edit.changed && edit.createdRow ? 'written' : 'repaired'
  const changes = edit.changed
    ? [...edit.changes]
    : []
  if (markerDrift && !edit.changed) changes.push('sync marker refreshed after skill manifest drift')
  else if (markerDrift) changes.push('sync marker refreshed')
  return { status, plugin, skillRoot, changes }
}
