// 每工作区任务库派生目录单源（任务 1.4；tech-design Interface 5 + Cross-Layer Data Map
// 「派生目录 {flatten}@{hash8} core 单源」+ db-schema §6-33/34 裁决 + S10 spike）。定位：
// 业务（共享基建）——纯函数零句柄零状态，node:crypto 单源（path-key 保持浏览器安全不承载）。
//
// 规则（§6-34）：`{tasksHome}/{flatten(canonical-path)}@{hash8(canonical-path)}`——
//   · flatten：`/`、`\` → `-`、盘符冒号去除（`Z:\project\dsh` → `Z-project-dsh`；UNC 双前导/
//     POSIX 前导 → 前导 `-`）——与 apps/web form-model 原型 deriveTaskStore 同口径（4.3 起
//     前端自算废除，本文件即唯一源）；
//   · hash8 = 原路径 sha-256 前 8 hex 小写；输入 = canonical path 字符串本机原样，不二次
//     规范化。拼写敏感是有意设计（S10：js realpath 已收敛大小写/junction/subst/8.3 全形态，
//     真实移动/改名即换 hash——「疑似移动」信号面）；调用方（注册闭包/表单预检动词）必须先
//     canonicalizeDir 再入本模块，两侧同基准 → 单源一致。
//
// 注册碰撞三态（§6-33/34；Interface 5「表单预检位（deriveTaskStoreDir 动词）+ 注册闭包复检」
// 共用的纯分类器——中央 ws_path 精确确认归注册闭包，分类器只看 tasksHome 目录面）：
//   normal（不存在且无同主体 → 正常新建）/ present（目录在且 hash 一致 → 幂等复用候选）/
//   suspected-move（同扁平化主体异 hash8 → ERR_SUSPECTED_MOVE + 手工指引，拒绝注册零副作用）。
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import type { SuspectedMoveData } from '@dsh-forge/contracts'

/** hash8 后缀形态锚（8 位小写 hex——同主体目录判定：`${flatten}@${hash8}` 名制） */
const HASH8_SUFFIX_RE = /^[0-9a-f]{8}$/

/** 路径归一（内部口径，与 web form-model normalizeDirPath 同则）：`/` → `\` + 去尾分隔符 */
function normalizeDirSpelling(path: string): string {
  return path.replaceAll('/', '\\').replace(/\\+$/, '')
}

/** canonical path 扁平化（原型 deriveTaskStore 同口径）：`/`、`\` → `-`、盘符冒号去除 */
export function flattenWorkspacePath(workspaceDir: string): string {
  const deColonized = normalizeDirSpelling(workspaceDir).replace(/^([A-Za-z]):/, '$1')
  return deColonized.replaceAll('\\', '-')
}

/** hash8：原路径 sha-256 前 8 hex 小写（输入本机原样不二次规范化——§6-34；拼写敏感见头注） */
export function hash8OfPath(workspaceDir: string): string {
  return createHash('sha256').update(workspaceDir, 'utf8').digest('hex').slice(0, 8)
}

/** 工作区库目录名单源：`{flatten}@{hash8}`（O(1) 目录名自证——同工作区判定看尾段即知） */
export function deriveDirName(workspaceDir: string): string {
  return `${flattenWorkspacePath(workspaceDir)}@${hash8OfPath(workspaceDir)}`
}

/** home 风格连接（连接符随 home：反斜杠 home → `\`，其余 → `/`；home 尾分隔符剪除——原型同口径） */
function joinHome(tasksHome: string, name: string): string {
  const home = tasksHome.replace(/[\\/]+$/, '')
  const sep = tasksHome.includes('\\') ? '\\' : '/'
  return `${home}${sep}${name}`
}

/** 派生目录单源：`{tasksHome}/{flatten}@{hash8}`（部署：目录下 forge.db——store.ts FORGE_DB_FILENAME） */
export function deriveTaskStoreDir(tasksHome: string, workspaceDir: string): string {
  return joinHome(tasksHome, deriveDirName(workspaceDir))
}

// ───────────────────────── 注册碰撞三态分类（纯读 tasksHome 目录面） ─────────────────────────

/**
 * 手工处置指引（PRD §6-111：删孤儿目录或改回原名；认领对话框 = M3——M2 留场文案即此）。
 * data.guidance 单源：动词预检位与注册闭包复检同文案。
 */
function suspectedMoveGuidance(existingDir: string, derivedDir: string): string {
  return (
    `疑似移动：本次推导目录 ${derivedDir}，但同扁平化主体异 hash8 目录 ${existingDir} 已在场` +
    `（工作区可能被移动或重命名）。请手工处置：删除孤儿目录 ${existingDir}，或将工作区改回原路径后重试` +
    `（认领对话框 = M3）。`
  )
}

/** present 态兜底拒绝指引（§6-33 残余面：目标目录在场而中央无注册——hash 自身碰撞/中央库重置遗留孤儿库） */
function occupiedDirGuidance(dir: string): string {
  return (
    `注册碰撞：目标目录 ${dir} 已在场但中央无对应注册（hash 自身碰撞或中央库重置遗留孤儿库）。` +
    `请确认该目录非其他工作区任务库后删除，再重新注册（认领对话框 = M3）。`
  )
}

/** 三态分类结果（present/suspected-move 均携带可直接入 SuspectedMoveError 的 data 三元） */
export type RegistrationCollision =
  | { readonly state: 'normal' }
  | { readonly state: 'present'; readonly dir: string; readonly data: SuspectedMoveData }
  | { readonly state: 'suspected-move'; readonly dir: string; readonly data: SuspectedMoveData }

/** 同主体目录枚举（字母序确定性；tasksHome 缺席/不可读 → 空集 = 正常新建面——全新机器首注册） */
function listSameSubjectDirs(tasksHome: string, subject: string): string[] {
  try {
    return readdirSync(tasksHome, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          e.name.startsWith(`${subject}@`) &&
          HASH8_SUFFIX_RE.test(e.name.slice(subject.length + 1)),
      )
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * 注册碰撞三态分类（Interface 5 预检位与注册闭包复检共用）：
 *   · 无同主体目录 → normal（正常新建）；
 *   · `{flatten}@{hash8}` 恰在场 → present（幂等复用候选——中央 ws_path 精确确认归注册闭包；
 *     若中央行缺席则为 §6-33 兜底拒绝面，data.existingDir = derivedDir）；
 *   · 仅同主体异 hash8 在场 → suspected-move（疑似移动拒绝——ERR_SUSPECTED_MOVE + 手工指引）。
 * present 胜出优先于 suspected-move（tech-design 交互三 mermaid 分支序：目录在且 hash 一致先判）。
 */
export function classifyRegistrationCollision(tasksHome: string, workspaceDir: string): RegistrationCollision {
  const dirName = deriveDirName(workspaceDir)
  const dir = joinHome(tasksHome, dirName)
  const sameSubject = listSameSubjectDirs(tasksHome, flattenWorkspacePath(workspaceDir))
  if (sameSubject.includes(dirName)) {
    return { state: 'present', dir, data: { existingDir: dir, derivedDir: dir, guidance: occupiedDirGuidance(dir) } }
  }
  const foreign = sameSubject.find((name) => name !== dirName)
  if (foreign !== undefined) {
    const existingDir = joinHome(tasksHome, foreign)
    return { state: 'suspected-move', dir, data: { existingDir, derivedDir: dir, guidance: suspectedMoveGuidance(existingDir, dir) } }
  }
  return { state: 'normal' }
}
