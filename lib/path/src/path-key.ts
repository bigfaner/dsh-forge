// @dsh-forge/lib-path —— 路径归一单源（plugin-project 1.6：自 @dsh-forge/path-key 归并迁入，
// 原 packages/path-key 已标记退役待删、留 re-export 兼容面）。定位：基础·零依赖纯函数，
// contracts 零逻辑铁律与 knowledge「生产面禁 import core」边界之间的共享逻辑唯一去处。
// fix-30 口径单一来源：core 注册链（① 预检 / fix-27 自愈查询 / 真新建结构判据的比对键）
// 与 knowledge 绑定表解析（cwd → projectId）同源消费——同一变体拼写（盘符大小写/正反斜杠/
// 尾分隔符）在两侧判定一致，消「同源数据两种归一口径」分裂。
// 语义边界：比对键只做纯字符串比对口径，不是落库形态——projects.ws_path 恒以 dsh registry
// 返回的 canonical（realpath 真值拼写）为准；可达 realpath 归一属 core 注册链入口职责
//（project-service canonicalizeDir，fail-soft），不进本模块（保持零依赖/浏览器安全）。
//
// normalize 单源（1.6 收敛——web form-model normalizeDirPath 与 core derive-dir
// normalizeDirSpelling 双实现归一）：
//   · normalizeDirSpelling——derive-dir 扁平化口径：无条件 `/` → `\` + 去尾分隔符；
//   · normalizeDirPath——web 表单口径：Windows 风格（盘符/UNC）走 normalizeDirSpelling
//     单源，POSIX 保持 `/` 仅去尾 `/`（POSIX 文件名可含 `\`，不重写）。
// 两条同则、一份实现；拼写差异语义（无条件 vs 风格分支）为既有行为，收敛不改语义。
// 规则（与 knowledge 原 session.ts normalizePath 逐字等价——path-key 同源收编）：
//   反斜杠 → 正斜杠；去尾分隔符（含重复）；win32 折叠大小写（其余平台大小写敏感）。
/** 平台探测：node 环境走 process.platform；浏览器捆包（process 缺席）退 navigator
 *  平台/UA 串的 Win 探测——web 面与 host 侧键必须同源（否则大小写折叠分裂）。 */
function platformOf(): string | undefined {
  const proc = (globalThis as { process?: { platform?: string } }).process
  if (proc?.platform !== undefined) return proc.platform
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  if (nav === undefined) return undefined
  const ua = `${nav.platform ?? ''} ${nav.userAgent ?? ''}`
  return /win/i.test(ua) ? 'win32' : undefined
}

export function normalizeFsPath(p: string): string {
  const slashed = p.replace(/\\/g, '/').replace(/\/+$/, '')
  return platformOf() === 'win32' ? slashed.toLowerCase() : slashed
}

/**
 * 平台独立单段连接（forge-dirs-query-tool §2.8 散点收编单源）：base 去尾分隔符后按既有
 * 风格判定分隔符（Windows 盘符/UNC → `\`，POSIX → `/`）——与 prompt 旧 docsRootOfForgeDir、
 * derive-dir joinHome 同构口径。对平台原生拼写的 base，与 node:path
 * join(base, segment) 逐字节等价（等价断言钉于 dir-segments 单测）。
 */
export function joinDirSegment(base: string, segment: string): string {
  const dir = base.replace(/[\\/]+$/, '')
  const sep = /^[A-Za-z]:[\\/]/.test(dir) || dir.startsWith('\\\\') ? '\\' : '/'
  return `${dir}${sep}${segment}`
}

/** Windows 风格路径判定（盘符或 UNC 前缀；POSIX `/` 起首恒 false）——normalizeDirPath 分支基准 */
export function isWindowsStylePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/** 派生扁平化口径归一（原 core derive-dir 内部 normalizeDirSpelling）：`/` → `\` + 去尾分隔符 */
export function normalizeDirSpelling(path: string): string {
  return path.replaceAll('/', '\\').replace(/\\+$/, '')
}

/**
 * 表单口径归一（原 web form-model normalizeDirPath——单源收编）：Windows 风格（盘符/UNC）→
 * normalizeDirSpelling 单源（`/` → `\` + 去尾分隔符，盘符根 `Z:\` → `Z:`）；POSIX（`/` 起首）
 * → 保持 `/` 分隔仅去尾 `/`。工作区路径来自 host canonical 化，此处仅消解用户态输入的记法差异。
 */
export function normalizeDirPath(path: string): string {
  if (isWindowsStylePath(path)) return normalizeDirSpelling(path)
  return path.replace(/\/+$/, '')
}

// ── 目录段派生（knowledge-plugin-migration 1.4 下沉：自 project form-model 单源迁入——
//    knowledge 插件 ui 面与 project 注册表单双侧消费，本模块 = 共享逻辑唯一去处） ──

/** 目录分隔符（随路径风格：Windows `\` / POSIX `/`——拼接与段边界判定的统一基准；盘符根 `Z:`（归一去尾后）仍按 Windows） */
export function dirSeparatorOf(path: string): '\\' | '/' {
  const norm = normalizeDirPath(path)
  return isWindowsStylePath(path) || /^[A-Za-z]:$/.test(norm) ? '\\' : '/'
}

/**
 * 工作区目录 → 知识库目录缺省值（`<工作区>/.knowledge`——分隔符随工作区风格）。
 * 知识目录随 knowledge_dir 列退役退出注册采集面（1.15）；本派生保留供知识视图空库
 * 引导文案（目录位置说明）——产品口径恒缺省派生，无用户改选面。
 */
export function deriveKnowledgeDir(workspaceDir: string): string {
  return `${normalizeDirPath(workspaceDir)}${dirSeparatorOf(workspaceDir)}.knowledge`
}
