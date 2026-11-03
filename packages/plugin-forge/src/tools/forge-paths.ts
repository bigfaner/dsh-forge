// forgeDirs + forgeResolvePath 双查询工具（forge-dirs-query-tool §2.3/§2.6——目录口径
// 代码化的 agent 查询面）。面分治：只读、主会话 + worker 双面可用（contracts
// WORKER_FORGE_TOOLS 六员之一；查询零副作用）。数据源 = forge-paths.ts 注册表单源：
// forgeDirs 锚级查询（dirKey 可选/缺省全量——含 declare merge 第三方键；输出 =
// dirKey + dir（绝对路径）+ description，与注册表同源生成零二次维护）；forgeResolvePath
// 目的地解析（dest 受控枚举 + slug/localId 按 requires——schema 即证无锚选择面无自由
// 路径面）。受控面拒绝（未知 dirKey/dest、requires 缺参）= typed ERR_DIR_PATH_INVALID
// 拒绝并列举法集（ForgeDirPathInvalidError——callToolFace 路由转失败 DTO）。
import type { ForgeToolDefinition, ToolExecFace } from '../faces.js'
import type { ForgePathsAnchorContext } from '../faces.js'
import type { DirKeyEntry } from '../forge-paths.js'
import { DIR_DESTINATIONS, resolveDestination } from '../forge-paths.js'
import type { ForgeToolDeps } from './index.js'
import { optionalString, requireArgsObject, requiredString } from './args.js'
import { callToolFace, formatFailure, formatOk, isForgeToolFailure, withFailureVariant, type ForgeToolFailure } from './format.js'
import { requireProjectId, sessionContextOf } from './session.js'
import { emitToolError, slugOfToolArgs } from '../events/sink.js'

const DIRS_TOOL = 'forgeDirs'
const RESOLVE_TOOL = 'forgeResolvePath'

/** 锚解析 + 合并注册表消费面（index.ts 装配注入——缺席 = 执行期 fail-loud 拒绝，同 features 可选降级模式） */
export interface ForgePathsToolFace {
  /** projectId → 锚四键（faces.createForgePathsAnchors 产物） */
  anchorsOf(projectId: string): Promise<ForgePathsAnchorContext>
  /** 现读合并注册表（forge 本体五键 + declare merge 第三方键） */
  dirKeys(): readonly DirKeyEntry[]
  /**
   * 反向拉取第三方声明（bug 04d445f4——消费点现查，AGENTS 1.6 检测不缓存）：
   * 枚举根 scope `dirKeys.*` 约定服务名现取声明数组；与 dirKeys() 按 dirKey 去重合并。
   * 可选：缺席 = 零第三方键拉取（同 scope 装配径纯推式注册表即足）。
   */
  declaredDirKeys?(): readonly DirKeyEntry[]
}

/** 受控面 typed 拒绝（code = contracts ERR_DIR_PATH_INVALID；message 携带法集/缺参） */
class ForgeDirPathInvalidError extends Error {
  readonly code = 'ERR_DIR_PATH_INVALID' as const
}

/** forgeDirs 成功面（§2.6 样张：paths 数组——dirKey/dir/description 三件套） */
export interface ForgeDirsResult {
  readonly ok: true
  readonly paths: readonly { readonly dirKey: string; readonly dir: string; readonly description: string }[]
}

/** forgeResolvePath 成功面（§2.6：dir 绝对路径单项） */
export interface ForgeResolvePathResult {
  readonly ok: true
  readonly dir: string
}

/** agent 面参数（forgeDirs：dirKey 可选——缺省全量锚清单） */
export interface ForgeDirsToolArgs {
  readonly dirKey?: string
}

/** 参数防御性收窄 */
export function parseForgeDirsArgs(args: unknown): ForgeDirsToolArgs {
  const a = requireArgsObject(args, DIRS_TOOL)
  const dirKey = optionalString(a, 'dirKey', DIRS_TOOL)
  return dirKey === undefined ? {} : { dirKey }
}

/** agent 面参数（forgeResolvePath：dest 必填 + slug/localId 按 requires） */
export interface ForgeResolvePathToolArgs {
  readonly dest: string
  readonly slug?: string
  readonly localId?: string
}

/** 参数防御性收窄（dest 词表校验落执行点——枚举单源 DIR_DESTINATIONS） */
export function parseForgeResolvePathArgs(args: unknown): ForgeResolvePathToolArgs {
  const a = requireArgsObject(args, RESOLVE_TOOL)
  return {
    dest: requiredString(a, 'dest', RESOLVE_TOOL),
    slug: optionalString(a, 'slug', RESOLVE_TOOL),
    localId: optionalString(a, 'localId', RESOLVE_TOOL),
  }
}

/** forgeDirs 注册面输出 schema（§2.6 结构：paths 数组三件套；失败支） */
export const FORGE_DIRS_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'true = anchor directory listing resolved.' },
    paths: {
      type: 'array',
      description: 'Anchor entries: dirKey + absolute dir + description (merged registry: forge.* anchors plus declared third-party keys).',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dirKey: { type: 'string', description: 'Directory key (forge.* namespace or a declared plugin-prefixed key).' },
          dir: { type: 'string', description: 'Resolved absolute directory path — always the real resolved path, never a placeholder.' },
          description: { type: 'string', description: 'One-line semantics, same source as the registry entry.' },
        },
        required: ['dirKey', 'dir', 'description'],
      },
    },
  },
  required: ['ok', 'paths'],
})

/** forgeResolvePath 注册面输出 schema（§2.6：dir 单项；失败支） */
export const FORGE_RESOLVE_PATH_OUTPUT_SCHEMA = withFailureVariant({
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'true = destination path resolved.' },
    dir: { type: 'string', description: 'Resolved absolute path of the destination (anchor binding and relative template live in the registry, not in caller args).' },
  },
  required: ['ok', 'dir'],
})

/** forgeDirs → 模型可见文本（formatOk：首行 + 逐锚键值行） */
function renderForgeDirsResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as ForgeDirsResult
  return formatOk(`${v.paths.length} dir anchor(s)`, v.paths.map((p) => `- ${p.dirKey}: ${p.dir} — ${p.description}`))
}

/** forgeResolvePath → 模型可见文本 */
function renderForgeResolvePathResult(_args: unknown, value: unknown): readonly { type: 'text'; text: string }[] {
  if (isForgeToolFailure(value)) return formatFailure(value)
  const v = value as ForgeResolvePathResult
  return formatOk('destination resolved', [`- dir: ${v.dir}`])
}

/** 锚解析依赖 fail-loud 守卫（装配缺口——paths 面缺席即拒绝，不静默） */
function requirePathsFace(deps: ForgeToolDeps): ForgePathsToolFace {
  if (deps.paths === undefined) throw new Error('forge-paths tools unavailable: paths face not assembled (createForgePathsAnchors 未注入)')
  return deps.paths
}

/** 合并视图（注册表键在前 + 反向拉取声明追加去重——既有键胜出，单次查询现算不落注册表） */
function mergedDirKeyEntries(paths: ForgePathsToolFace): readonly DirKeyEntry[] {
  const registryEntries = paths.dirKeys()
  const known = new Set(registryEntries.map((e) => e.dirKey))
  return [...registryEntries, ...(paths.declaredDirKeys?.() ?? []).filter((e) => !known.has(e.dirKey))]
}

/** tool 定义工厂（forgeDirs——锚级查询，dirKey 可选/缺省全量） */
export function createForgeDirsTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: DIRS_TOOL,
    description:
      'Query forge directory anchors — the single source of truth for directory facts. Omit dirKey to list all anchors (dirKey + absolute dir + description, including third-party keys declared via the forgeDirs service); give dirKey for one entry. Derived paths (dossier/taskLogs/proposalDir) use forgeResolvePath instead. Read-only; available to main agent and workers.',
    parameters: {
      type: 'object',
      properties: {
        dirKey: { type: 'string', description: 'Optional anchor key to look up (e.g. forge.task_home); omitted = list all anchors.' },
      },
    },
    output: { schema: FORGE_DIRS_OUTPUT_SCHEMA, render: renderForgeDirsResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<ForgeDirsResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseForgeDirsArgs(args)
        const paths = requirePathsFace(deps)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const anchors = await paths.anchorsOf(projectId)
        const entries = mergedDirKeyEntries(paths)
        if (parsed.dirKey !== undefined) {
          const entry = entries.find((e) => e.dirKey === parsed.dirKey)
          if (entry === undefined) {
            const err = new ForgeDirPathInvalidError(
              `unknown dirKey '${parsed.dirKey}' — legal keys: ${entries.map((e) => e.dirKey).join(', ')}`,
            )
            throw err
          }
          return { ok: true, paths: [{ dirKey: entry.dirKey, dir: entry.resolve(anchors), description: entry.description }] }
        }
        return { ok: true, paths: entries.map((e) => ({ dirKey: e.dirKey, dir: e.resolve(anchors), description: e.description })) }
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), DIRS_TOOL, failure))
    },
  }
}

/** tool 定义工厂（forgeResolvePath——目的地解析，受控枚举 + slug/localId） */
export function createForgeResolvePathTool(deps: ForgeToolDeps): ForgeToolDefinition {
  return {
    name: RESOLVE_TOOL,
    description:
      `Resolve a concrete forge destination path to its absolute form. dest is a controlled enum (${DIR_DESTINATIONS.map((d) => `${d.dest} (${d.requires.join('+')})`).join(', ')}); give slug/localId as the destination requires. The anchor binding and relative template live in the registry — you cannot pick an anchor or pass a free-form path. Read-only; available to main agent and workers.`,
    parameters: {
      type: 'object',
      properties: {
        dest: {
          type: 'string',
          description: `Destination name — controlled enum: ${DIR_DESTINATIONS.map((d) => `${d.dest} (requires ${d.requires.join('+')})`).join(', ')}. Unknown dest is rejected with the legal set.`,
        },
        slug: { type: 'string', description: 'Container slug (feature directory name or proposal slug) — required by destinations listing slug.' },
        localId: { type: 'string', description: 'Task local id (e.g. 1.1 / fix-1) — required by destinations listing localId.' },
      },
      required: ['dest'],
    },
    output: { schema: FORGE_RESOLVE_PATH_OUTPUT_SCHEMA, render: renderForgeResolvePathResult },
    async execute(args: unknown, exec: ToolExecFace): Promise<ForgeResolvePathResult | ForgeToolFailure> {
      const session = sessionContextOf(exec)
      return callToolFace(async () => {
        const parsed = parseForgeResolvePathArgs(args)
        const paths = requirePathsFace(deps)
        const projectId = requireProjectId(deps.resolveProjectId, session)
        const dest = DIR_DESTINATIONS.find((d) => d.dest === parsed.dest)
        if (dest === undefined) {
          throw new ForgeDirPathInvalidError(
            `unknown dest '${parsed.dest}' — legal destinations: ${DIR_DESTINATIONS.map((d) => `${d.dest} (requires: ${d.requires.join(', ')})`).join('; ')}`,
          )
        }
        const missing = dest.requires.filter((r) => parsed[r] === undefined)
        if (missing.length > 0) {
          throw new ForgeDirPathInvalidError(`${dest.dest} requires: ${dest.requires.join(', ')} (missing: ${missing.join(', ')})`)
        }
        const anchors = await paths.anchorsOf(projectId)
        const dir = resolveDestination(dest, anchors, { slug: parsed.slug, localId: parsed.localId })
        return { ok: true, dir }
      }, (failure) => emitToolError(deps.events, session.sessionId, slugOfToolArgs(args), RESOLVE_TOOL, failure))
    },
  }
}
