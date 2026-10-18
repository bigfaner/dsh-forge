// 续跑指针读取 + 证据效度戳（worker-exec-evidence-replay 1.3 读侧 + dispatch-loop-hardening
// disc 跟进——取证卡证据不得跨效度域复用，判例 = 1.16 二次 blocked 短路：fix 落地后重领，
// worker 复用陈旧 resume.md 证据上抛）。
//
// 效度戳机制（disc 定稿设计）：证据写入时随附效度戳 (HEAD commit, 基线签名)——落任务证据位
// 根部 sidecar `resume.validity.json`；重领时机械比对当前效度域：一致 → 证据复用（resume
// 语义不变 = 效度域内的进度台账）；漂移（HEAD 或基线签名任一不一致）→ 证据标 stale 强制
// 重跑，resume.md 降级为历史记录（只叙不判——简报注入 stale 规则段，compose.ts 单源）。
// 基线签名 = 依赖环境指纹（检出根 pnpm-lock.yaml 的 sha-256 前 16 hex）——与 HEAD（代码
// 基线）双域正交。机制惰性：当前效度域不可读（非 git 检出/lock 缺席）= 不判（fresh，形态
// 兼容）；无戳存量证据 = 不可证效度 → stale（1.16 通道封死）。
// 写侧 = 结算时点机械落戳（submit-task 面 → ForgeTasksService.stampEvidenceValidity——
// worker 不可信任手写戳）。resume.md 本体仍由 worker persona RESUME_POINTER_BLOCK 约定
// 覆盖写，本模块不触碰其内容。
//
// core 零 IO 纪律（dispatch-loop-hardening R1-major① f913fc49）：本模块 = 比对纯函数 + 戳
// 读写编排，一切同步 IO（git 子进程、效度域取数、证据位文件系统读写）经 EvidencePointerIo
// 注入缝进入——同 git-lookup.ts gitExec / add.ts TasksVerbDeps 先例形制。生产实现（git
// rev-parse + pnpm-lock sha-256 + node:fs）落装配面（src/index.ts 装配闭包）；测试注入
// 内存 io 受控成败。claim 领取热路径因此零同步 git/fs 子进程直调——读侧消费的
// deps.resolveEvidencePointer 闭合在装配层。
//
// claim 领取瞬间探测任务证据位根部的单点指针文件（logs/<slug>/<taskKey>/resume.md——
// 覆盖写、最新进度即真相）；在盘 → logs/ 相对路径（正斜杠）注入 brief EVIDENCE 行，缺席 →
// undefined（首跑零行）。路径形状与净化口径同 notify/incident-log（plugin-forge 侧；core
// 侧镜像同规则——四域/包互禁 import，规则文本以本文件为 core 单源）。fail-soft：任何缺席/
// 故障 = undefined，绝不抛。
import { RESUME_POINTER_FILE } from './prompt/compose.js'

export { RESUME_POINTER_FILE }

/** 效度戳 sidecar 文件名（与 resume.md 同目录——任务证据位根部） */
export const RESUME_VALIDITY_FILE = 'resume.validity.json'

/** 证据效度戳（写入时随附的效度域快照——HEAD commit + 基线签名） */
export interface EvidenceValidityStamp {
  /** 写入时点检出 HEAD commit（代码基线） */
  head: string
  /** 基线签名（依赖环境指纹：检出根 pnpm-lock.yaml sha-256 前 16 hex） */
  baseline: string
}

/**
 * 证据位 IO 注入缝（core 零 IO 纪律——R1-major① f913fc49）：指针在盘探测 / 文本读 / 文本
 * 覆盖写的最小封闭面。生产 = 装配层 node:fs 适配（src/index.ts）；测试 = 内存 map 受控。
 */
export interface EvidencePointerIo {
  /** 路径在盘探测（node:fs existsSync 同语义——缺席/故障 = false 由实现兜） */
  exists(path: string): boolean
  /** UTF-8 文本读（node:fs readFileSync(path, 'utf8') 同语义——读故障由实现抛、本模块 fail-soft 捕获） */
  readTextFile(path: string): string
  /** UTF-8 文本覆盖写（node:fs writeFileSync(path, data, 'utf8') 同语义——写故障由实现抛、本模块 fail-soft 捕获） */
  writeTextFile(path: string, data: string): void
}

/** 续跑指针探测三态（disc 跟进——stale = 证据漂移强制重跑） */
export interface EvidencePointerState {
  /** 指针相对路径（正斜杠）；证据位不在盘 = undefined（首跑） */
  pointer?: string
  /** true = 效度戳缺失或漂移——证据降级历史记录（只叙不判），简报注入 stale 规则段 */
  stale: boolean
}

/** 证据路径段净化（同 incident-log sanitizeIncidentSegment 口径：[A-Za-z0-9._-] 之外折叠连字符） */
function sanitizeSegment(raw: string): string {
  return raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

/** 效度戳机械比对（纯函数）：双域全等 = 有效；任一漂移 = 失效 */
export function stampMatches(stored: EvidenceValidityStamp, current: EvidenceValidityStamp): boolean {
  return stored.head === current.head && stored.baseline === current.baseline
}

/**
 * 探测续跑指针 + 效度比对（领取瞬间取数，io 注入）：容器库目录（deriveTaskStoreDir 单源派生
 * 值）+ slug + localId → 指针文件在盘则返回 `logs/<slug>/<localId>/resume.md`（正斜杠相对
 * 路径）+ 效度态，否则 undefined（首跑零行）。容器目录缺席（undefined/空串）/路径故障 =
 * undefined，绝不抛。效度判定（current 在场才判——机制惰性；当前效度域取数由装配层闭包
 * 注入 current）：无戳/戳形坏/双域任一漂移 = stale。
 */
export function readEvidencePointerState(
  io: EvidencePointerIo,
  containerDir: string | undefined,
  slug: string,
  localId: string,
  current?: EvidenceValidityStamp,
): EvidencePointerState {
  if (containerDir === undefined || containerDir === '') return { stale: false }
  const s = sanitizeSegment(slug)
  const k = sanitizeSegment(localId)
  if (s === '' || k === '') return { stale: false }
  const rel = `logs/${s}/${k}/${RESUME_POINTER_FILE}`
  try {
    if (!io.exists(`${containerDir}/${rel}`)) return { stale: false }
  } catch {
    return { stale: false }
  }
  if (current === undefined) return { pointer: rel, stale: false } // 机制惰性——效度域不可读不判
  let stored: EvidenceValidityStamp | undefined
  try {
    const parsed = JSON.parse(io.readTextFile(`${containerDir}/logs/${s}/${k}/${RESUME_VALIDITY_FILE}`)) as {
      head?: unknown
      baseline?: unknown
    }
    if (typeof parsed.head === 'string' && typeof parsed.baseline === 'string') {
      stored = { head: parsed.head, baseline: parsed.baseline }
    }
  } catch {
    stored = undefined
  }
  // 无戳（disc 前存量证据）/戳形坏/漂移 = 不可证效度 → stale（1.16 判例通道封死）
  return { pointer: rel, stale: stored === undefined || !stampMatches(stored, current) }
}

/**
 * 结算写侧落戳（机械——worker 不可信任手写，io 注入）：任务证据位 resume.md 在盘才写 sidecar
 * 效度戳（覆盖写——最新结算即最新效度域）；resume.md 缺席/写故障 = false（fail-soft，绝不抛）。
 */
export function writeEvidenceValidityStamp(
  io: EvidencePointerIo,
  containerDir: string | undefined,
  slug: string,
  localId: string,
  stamp: EvidenceValidityStamp,
): boolean {
  if (containerDir === undefined || containerDir === '') return false
  const s = sanitizeSegment(slug)
  const k = sanitizeSegment(localId)
  if (s === '' || k === '') return false
  try {
    const dir = `${containerDir}/logs/${s}/${k}`
    if (!io.exists(`${dir}/${RESUME_POINTER_FILE}`)) return false
    io.writeTextFile(`${dir}/${RESUME_VALIDITY_FILE}`, `${JSON.stringify(stamp, null, 2)}\n`)
    return true
  } catch {
    return false
  }
}

/**
 * 探测续跑指针（领取瞬间取数——1.3 原始形态，fresh 语义，io 注入）：容器库目录 + slug +
 * localId → 指针文件在盘则返回 `logs/<slug>/<localId>/resume.md`（正斜杠相对路径），否则
 * undefined。效度比对需求面用 readEvidencePointerState（本函数 = 无 current 不判的薄包装）。
 */
export function readEvidencePointer(
  io: EvidencePointerIo,
  containerDir: string | undefined,
  slug: string,
  localId: string,
): string | undefined {
  return readEvidencePointerState(io, containerDir, slug, localId).pointer
}
