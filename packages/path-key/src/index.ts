// @dsh-forge/path-key —— 工作区路径比对归一键（定位：基础·零依赖纯函数，contracts 零逻辑
// 铁律与 knowledge「生产面禁 import core」边界之间的共享逻辑唯一去处）。
// fix-30 口径单一来源：core 注册链（① 预检 / fix-27 自愈查询 / 真新建结构判据的比对键）
// 与 knowledge 绑定表解析（cwd → projectId）同源消费——同一变体拼写（盘符大小写/正反斜杠/
// 尾分隔符）在两侧判定一致，消「同源数据两种归一口径」分裂。
// 语义边界：本键只做纯字符串比对口径，不是落库形态——projects.ws_path 恒以 dsh registry
// 返回的 canonical（realpath 真值拼写）为准；可达 realpath 归一属 core 注册链入口职责
//（project-service canonicalizeDir，fail-soft），不进本键（保持零依赖/浏览器安全）。
// 规则（与 knowledge 原 session.ts normalizePath 逐字等价——本包即其同源收编）：
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
