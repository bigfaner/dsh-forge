// 族① gate-environment 前提探针（plugin-spec/fix-7，bug eb786e62）。
// 官方 0.2.2 世代 web 栈收敛前，会话渲染/发送链用例挂环境前提门控（skip 留痕非红）：
// 现役 pin 世代 0.2.0-rc.2 下，官方 client-ui 族（conversation/chat/goal 等插件 client 束）
// 运行期对 dsh-client-ui-primitives 的 projectUserText 取值落空（「projectUserText is not
// a function」→ conversation.view / conversation.chat.node 槽位原生崩溃 → 用户消息不入转录，
// 断言面全灭）。0.2.2 世代该面已收敛；升位单点不可落地（RUN-REPORT：0.2.2-rc.2/rc.3 升位致
// dev 宿主 main 启动原生崩溃），收敛须整代 co-upgrade（host + cordis 链 + web 栈同步升位）。
// 断言面（会话渲染/发送链）为有效产品面，非过时用例——不做退役；co-upgrade 落地后本探针
// 自动转绿、用例复跑。
// 探针 = 安装世代 dsh-client-ui-primitives 的 semver 世代核销（≥0.2.2 视为收敛；单点、
// 零宿主拉起成本）。
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../')
const INSTALLED_PRIMITIVES_PKG = join(
  REPO_ROOT,
  'apps',
  'web',
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-primitives',
  'package.json',
)

let cached: boolean | undefined

/** 官方 0.2.2 世代 web 栈是否已收敛（安装世代 dsh-client-ui-primitives ≥ 0.2.2） */
export function officialStackConverged(): boolean {
  if (cached !== undefined) return cached
  try {
    const pkg = JSON.parse(readFileSync(INSTALLED_PRIMITIVES_PKG, 'utf8')) as { version?: string }
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(pkg.version ?? '')
    // 数值化对位比较（major,minor,patch）≥ (0,2,2)
    cached = m !== null && (Number(m[1]) > 0 || (Number(m[2]) === 2 ? Number(m[3]) >= 2 : Number(m[2]) > 2))
  } catch {
    cached = false
  }
  return cached
}

export const OFFICIAL_STACK_GATE_NOTE =
  '族① gate-environment（bug eb786e62）：官方 0.2.2 世代 web 栈收敛前提未满足' +
  '（安装世代 dsh-client-ui-primitives < 0.2.2——会话渲染槽位 projectUserText 取值落空' +
  '原生崩溃，用户消息不入转录；断言面为有效产品面，整代 co-upgrade 落地后自动复跑）'
