// core forgeSettings 服务（任务 2.7；tech-design §Interface 1 M3「设置域」+ 图 11 设置单门）：
// worker 默认 LLM 三项（provider / model / reasoning——dispatchTask 组装 agentOptions 的
// 唯一配置源，reasoning → agentOptions.effort 直映射）的单门读写。
// 存储 = {userData}/forge-settings.json（路径经 boot overlay 注 core 行 config.settingsFile
// ——bindingsFile 同型先例，host 注入面 = 3.8）；单写者 = core（Hard Rule：UI 设置分区
// （RPC）与 dispatchTask（服务注入）同门消费）——get 每调实时读文件、零缓存：改完即生效
// 无重启。文件缺席 = 未配置态（get 返回 {} 不抛——UI ⚠ 显式占位判据；dispatchTask 不携带
// agentOptions 回退父会话继承）。原子写 = 同目录 tmp + rename（崩溃无半写文件）。
// 路径守卫（Security ②）：settingsFile 经 canonical 后必须严格落在 userData 域内
// （startsWith(root) + 分隔符双条件——同 docs.ts 守卫口径；realpath 收敛符号链接/大小写，
// 缺席逐级上溯最近存在祖先 realpath + 余段拼接——两侧同口径，/tmp 型 userData 首启不误拒）；
// 装配层守卫基准 = dirname(dbFile)（state.db 与设置文件同居
// userData——host resolveHostPaths 单源，双注入缝交叉校验坏装配）。
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve as resolvePath, sep } from 'node:path'
import {
  REASONING_LEVELS,
  type ForgeSettings,
  type ForgeSettingsService,
  type RemoteApprovalSettings,
  type SetForgeSettingsInput,
  type WorktreeSettings,
  type WorkerSettings,
} from '@dsh-forge/contracts'
import { errMessage } from '../../util.js'
import { InvalidSettingsInputError, SettingsPathInvalidError } from './errors.js'

export interface SettingsServiceDeps {
  /** 设置文件绝对路径（boot overlay 注入：{userData}/forge-settings.json——3.8 接线） */
  readonly settingsFile: string
  /** 路径守卫基准（userData 域根——装配层以 dirname(dbFile) 注入，双缝交叉校验） */
  readonly userDataDir: string
}

/** canonical：可达 realpath（磁盘真值拼写——符号链接/大小写收敛）；缺席逐级上溯 realpath
 * 最近存在祖先 + 余段拼接（#60：首启 forge-settings.json 缺席时纯词法 resolve 拼写
 * /tmp/... 与 userDataDir 侧 realpath 拼写 /private/tmp/... 前缀失配误拒——两侧同口径）；
 * 上溯到根（dirname(p) === p）仍不可达 → 回退词法 resolve */
function canonical(p: string): string {
  try {
    return realpathSync(p)
  } catch {
    const parent = dirname(p)
    return parent === p ? resolvePath(p) : join(canonical(parent), basename(p))
  }
}

/** 读文件 → 顶层对象（缺席 = {} 未配置态；非 JSON / 顶层非对象 = fail-loud——单写者外改写即损坏） */
function readSettingsFile(file: string): Record<string, unknown> {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw cause
  }
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('顶层不是 JSON 对象')
    }
    return parsed as Record<string, unknown>
  } catch (cause) {
    throw new Error(`forge-settings.json 解析失败（${file}——单写者 = core，外部改写即损坏）：${errMessage(cause)}`, {
      cause,
    })
  }
}

/** set 入参形状校验（RPC 边界防御——运行期值不受编译期类型约束，分节三查 + 枚举）：
 *  worker 携带时三项全查；remoteApproval 携带时 enabled 布尔查；至少携带一节。 */
function assertValidInput(input: SetForgeSettingsInput): void {
  const w: unknown = input.worker
  if (w !== undefined) {
    if (typeof w !== 'object' || w === null) throw new InvalidSettingsInputError('worker 段缺失')
    const { provider, model, reasoning } = w as Record<string, unknown>
    if (typeof provider !== 'string' || provider.trim() === '') {
      throw new InvalidSettingsInputError('provider 必须为非空白字符串')
    }
    if (typeof model !== 'string' || model.trim() === '') {
      throw new InvalidSettingsInputError('model 必须为非空白字符串')
    }
    if (typeof reasoning !== 'string' || !(REASONING_LEVELS as readonly string[]).includes(reasoning)) {
      throw new InvalidSettingsInputError(`reasoning 必须 ∈ ${REASONING_LEVELS.join('|')}（收到 ${String(reasoning)}）`)
    }
  }
  const ra: unknown = input.remoteApproval
  if (ra !== undefined) {
    if (typeof ra !== 'object' || ra === null) throw new InvalidSettingsInputError('remoteApproval 段缺失')
    if (typeof (ra as Record<string, unknown>)['enabled'] !== 'boolean') {
      throw new InvalidSettingsInputError('remoteApproval.enabled 必须为布尔')
    }
  }
  const wt: unknown = input.worktree
  if (wt !== undefined) {
    if (typeof wt !== 'object' || wt === null) throw new InvalidSettingsInputError('worktree 段缺失')
    const dismissed = (wt as Record<string, unknown>)['crossBranchRiskDismissed']
    if (dismissed !== undefined && typeof dismissed !== 'boolean') {
      throw new InvalidSettingsInputError('worktree.crossBranchRiskDismissed 必须为布尔')
    }
  }
  if (w === undefined && ra === undefined && wt === undefined) {
    throw new InvalidSettingsInputError('set 至少携带一个设置节（worker / remoteApproval / worktree）')
  }
}

/** Interface 1（M3）：core · forge 设置域服务面（ctx.forgeSettings——单写者 = core） */
export function createSettingsService(deps: SettingsServiceDeps): ForgeSettingsService {
  // 路径守卫：构造期 fail-loud（坏配置即拒，不产出静默错位服务——openDatabase 同径）
  const root = canonical(deps.userDataDir)
  if (!canonical(deps.settingsFile).startsWith(`${root}${sep}`)) {
    throw new SettingsPathInvalidError({ settingsFile: deps.settingsFile, userDataDir: deps.userDataDir })
  }
  return {
    async get(): Promise<ForgeSettings> {
      const parsed = readSettingsFile(deps.settingsFile)
      const next: ForgeSettings = {}
      if (parsed.worker !== undefined) next.worker = parsed.worker as WorkerSettings
      if (parsed.remoteApproval !== undefined) {
        next.remoteApproval = parsed.remoteApproval as RemoteApprovalSettings
      }
      if (parsed.worktree !== undefined) {
        next.worktree = parsed.worktree as WorktreeSettings
      }
      return next
    },
    async set(input: SetForgeSettingsInput): Promise<void> {
      assertValidInput(input)
      // 读-改-写：分节覆写（只覆写携带的节）、保留其余顶层键（文件形状对多小节可扩展——
      // fix-3：remoteApproval 分节供手机远程开关单节写，不冲掉 worker 配置）
      const prev = readSettingsFile(deps.settingsFile)
      const next = {
        ...prev,
        ...(input.worker !== undefined ? { worker: input.worker } : {}),
        ...(input.remoteApproval !== undefined ? { remoteApproval: input.remoteApproval } : {}),
        ...(input.worktree !== undefined ? { worktree: input.worktree } : {}),
      }
      // 原子写：同目录 tmp + rename（Windows MoveFileEx REPLACE_EXISTING 语义——崩溃无半写）
      const tmp = `${deps.settingsFile}.${randomUUID()}.tmp`
      try {
        mkdirSync(dirname(deps.settingsFile), { recursive: true })
        writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
        renameSync(tmp, deps.settingsFile)
      } catch (cause) {
        try {
          unlinkSync(tmp)
        } catch {
          // 最佳努力清理失败不掩盖原始异常
        }
        throw cause
      }
    },
  }
}
