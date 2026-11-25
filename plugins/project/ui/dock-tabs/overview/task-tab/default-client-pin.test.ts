// 生产默认值守护钉（2.12 回归判例 2026-11-25；2.19 升级：钉 preload 路径而非名字）：
// 任务子 tab 的数据装载 hooks（useTasksTabLoad / useTaskContainerCards / TasksTab）缺省 client
// 工厂必须是官方宿主可达的 Typert 工厂（overviewRpcClientFactory）——此前缺省为
// preloadRpcClientFactory（window.dshForge.invoke，仅自建宿主 dsh-forge 存在），官方宿主上
// 渲染期同步抛「宿主 preload 未接 RPC 面」→ slot entry crashed → 项目概览整片空白。
//
// 为什么读源码而不渲染：既有用例全部注入 makeClient 替身，绕过缺省值——替身永远绿、
// 真机恒炸（本容器「替身绕过生产路径」判例族）。本钉直接对源码文本断言缺省值归属，
// 不经任何注入面，任一工厂退回 preload 即红。
//
// 2.19 守护钉升级（钉路径而非名字）：createForgeRpcClient / preloadRpcClientFactory 在
// ui/rpc.ts（Typert 切片）与 dock-tabs/rpc-channels.ts（通道式）存在同名导出，仅钉名字
// 无法区分来源——实证绕过样例 `import { createForgeRpcClient, preloadTransport } from
// '../dock-tabs/rpc-channels.js'; createForgeRpcClient(preloadTransport())` 零别名字面量
// 即可全绿。因此：①禁用词表钉 preloadTransport（构造期即抛的 fail-loud 原语）与 dshForge
// （window 直连）；②消费点断言升级为 import 来源断言（createForgeRpcClient 必须来自
// ui/rpc.js，禁来自 rpc-channels.js）；③别名 preloadRpcClientFactory 收口后全仓零残留。
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = import.meta.dirname
const src = (f: string): string => readFileSync(join(DIR, f), 'utf8')

/** import 来源断言（2.19）：createForgeRpcClient 必须来自 ui/rpc.js（Typert 切片），
 *  禁来自 dock-tabs/rpc-channels.js（通道式同名导出——import 行或注释不再能满足断言）。 */
const assertTypertRpcImport = (s: string, label: string): void => {
  const imports = [...s.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)]
  const fromTypertRpc = imports.find((m) => /(^|[\s,])createForgeRpcClient[\s,]/.test(` ${m[1]} `) && m[2].endsWith('rpc.js'))
  expect(fromTypertRpc, `${label} createForgeRpcClient 须 import 自 ui/rpc.js（Typert 切片）`).toBeTruthy()
  const fromChannels = imports.find((m) => /(^|[\s,])createForgeRpcClient[\s,]/.test(` ${m[1]} `) && m[2].endsWith('rpc-channels.js'))
  expect(fromChannels, `${label} 不得 import 通道式 rpc-channels.js 同名导出`).toBeUndefined()
}

describe('任务子 tab 数据装载缺省 client 工厂（生产默认值——零替身注入面）', () => {
  it('task-tab-data.ts：useTasksTabLoad / useTaskContainerCards 缺省 = overviewRpcClientFactory（Typert 可达）', () => {
    const s = src('task-tab-data.ts')
    const defaults = [...s.matchAll(/makeClient:\s*RpcClientFactory\s*=\s*(\w+)/g)].map((m) => m[1])
    expect(defaults.length, '两个装载 hook 的缺省参数均应显式声明').toBeGreaterThanOrEqual(2)
    for (const d of defaults) expect(d).toBe('overviewRpcClientFactory')
    expect(s).not.toMatch(/\bpreloadRpcClientFactory\b/)
  })

  it('task-tab.tsx：TasksTab 缺省 = overviewRpcClientFactory', () => {
    const s = src('task-tab.tsx')
    const m = s.match(/makeClient\s*=\s*(\w+),\s*\}:\s*TasksTabProps/)
    expect(m?.[1]).toBe('overviewRpcClientFactory')
    expect(s).not.toMatch(/\bpreloadRpcClientFactory\b/)
  })

  it('overviewRpcClientFactory 本身不触达 preload 通道（window.dshForge.invoke）', () => {
    // 工厂真身：overviewTransport 仅 bugs.list 走本地缝（带 Typert 回落），其余全 Typert——
    // tasks.* 通道恒 Typert。此处钉 transport 源码对 tasks 通道零 preload 直连。
    const s = src('../overview-client.ts')
    expect(s).toContain('overviewRpcClientFactory')
    // 头路/任务路 = Typert 单通路：仅 BUGS_CHANNELS.list 一条例外走 preload，且带 Typert 回落
    const preloadUses = [...s.matchAll(/preloadOf\(\)/g)].length
    expect(preloadUses, 'preload 仅 bugs.list 一处消费且带回落').toBe(1)
    expect(s).toMatch(/if \(channel !== BUGS_CHANNELS\.list\) return typert\(channel, payload\)/)
  })

  // ── 2.14 侧栏/树/抽屉组扩面（用户裁决 2026-11-25：preload 通道消费点全量换官方宿主可达
  //    Typert 工厂）——同读源码口径，零替身注入，任一文件退回 preload 即红。2.19 升级：
  //    消费点断言 = import 来源断言（钉 ui/rpc.js 路径，不钉名字）。──
  describe('侧栏/树/抽屉组缺省 client 工厂扩面（生产默认值——零替身注入面）', () => {
    const typertPin = (rel: string, label: string): string => {
      const s = src(rel)
      expect(s, `${label} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
      if (/\bcreateForgeRpcClient\b/.test(s)) assertTypertRpcImport(s, label)
      return s
    }

    it('anchored-projects.tsx：useWorkspaceProjectMap 缺省 = createForgeRpcClient（ui/rpc Typert 切片）', () => {
      const s = typertPin('../../../anchored-projects.tsx', 'anchored-projects')
      const m = s.match(/makeClient:\s*WorktreeResolveClientFactory\s*=\s*(\w+)/)
      expect(m?.[1], 'worktree.resolve 消费点缺省 = Typert 切片工厂').toBe('createForgeRpcClient')
    })

    it('drawer/index.tsx：useTaskDetail 缺省 = overviewRpcClientFactory（tasks.detail/graph Typert）', () => {
      const s = typertPin('../drawer/index.tsx', 'task drawer')
      const m = s.match(/makeClient:\s*RpcClientFactory\s*=\s*(\w+)/)
      expect(m?.[1], 'tasks.detail 消费点缺省 = 概览 Typert 工厂').toBe('overviewRpcClientFactory')
    })

    it('drawer/transition-dialog.tsx：TransitionDialog 缺省 = overviewRpcClientFactory（tasks.transition Typert）', () => {
      const s = typertPin('../drawer/transition-dialog.tsx', 'transition dialog')
      const m = s.match(/makeClient\s*=\s*(\w+),\s*\}:\s*TransitionDialogProps/)
      expect(m?.[1], 'tasks.transition 消费点缺省 = 概览 Typert 工厂').toBe('overviewRpcClientFactory')
    })

    it('project-tree/use-project-tree.ts：useProjectWorktreeTree 缺省 = createForgeRpcClient（worktree.list+projects.list Typert）', () => {
      const s = typertPin('../../../project-tree/use-project-tree.ts', 'project tree')
      const m = s.match(/makeClient:\s*RpcClientFactory\s*=\s*(\w+)/)
      expect(m?.[1], 'projects.list+worktree.list 消费点缺省 = Typert 切片工厂').toBe('createForgeRpcClient')
    })

    it('sidebar/use-forge-projects.ts：useForgeProjects 缺省 = createForgeRpcClient（projects.list Typert）', () => {
      const s = typertPin('../../../sidebar/use-forge-projects.ts', 'sidebar projects')
      const m = s.match(/makeClient:\s*RpcClientFactory\s*=\s*(\w+)/)
      expect(m?.[1], 'projects.list 消费点缺省 = Typert 切片工厂').toBe('createForgeRpcClient')
    })
  })

  // ── 2.15 添加项目向导/Bug 引用/侧栏改名组扩面（用户裁决 2026-11-25：preload 通道消费点
  //    全量换官方宿主可达 Typert 工厂）——同读源码口径，零替身注入，任一文件退回 preload
  //    即红。2.19 升级：数据通路断言 = import 来源断言（钉 ui/rpc.js 路径，不钉名字）。──
  describe('添加项目向导/Bug 引用/侧栏改名组缺省 client 工厂扩面（生产默认值——零替身注入面）', () => {
    const files = [
      '../../../add-project/AddProjectFlow.tsx',
      '../../../add-project/derive-source.ts',
      '../../../add-project/dir-source.ts',
      '../../../add-project/flow-actions.ts',
      '../../../official-seams.ts',
      '../../../sidebar/ForgeSidebarSlot.tsx',
    ]
    it('本组 6 文件零 preloadRpcClientFactory 字面量，createForgeRpcClient import 自 ui/rpc.js（Typert 切片）', () => {
      for (const rel of files) {
        const s = src(rel)
        expect(s, `${rel} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
        assertTypertRpcImport(s, rel)
      }
    })
  })

  // ── 2.16 会话徽章/worktree 选择器组扩面（用户裁决 2026-11-25 收尾组）——同读源码口径，
  //    零替身注入，任一文件退回 preload 即红。渲染期构造安全性：createForgeRpcClient 构造
  //    期不抛（face 缺席 = 调用期诚实降级），chip/seal-notice 均在 effect 内 try/catch 消费。
  //    2.19 升级：数据通路断言 = import 来源断言（钉 ui/rpc.js 路径，不钉名字）。──
  describe('会话徽章/worktree 选择器组缺省 client 工厂扩面（生产默认值——零替身注入面）', () => {
    const files = [
      '../../../session-badge/chip.tsx',
      '../../../session-badge/seal-notice.tsx',
      '../../../worktree-picker/hero-workspace-picker.tsx',
      '../../../worktree-picker/picker.tsx',
    ]
    it('本组 4 文件零 preloadRpcClientFactory 字面量，createForgeRpcClient import 自 ui/rpc.js（Typert 切片）', () => {
      for (const rel of files) {
        const s = src(rel)
        expect(s, `${rel} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
        assertTypertRpcImport(s, rel)
      }
    })

    it('picker.tsx：features.list 死通道零残留（feature 域已随 G2 退役——2.16 遗留处置钉）', () => {
      const s = src('../../../worktree-picker/picker.tsx')
      expect(s, 'features.list 消费零残留').not.toMatch(/\bfeatures\.list\b/)
      expect(s, 'slug 候选拉取死分支已拔除').not.toContain('collectSlugCandidates')
    })
  })

  // ── 2.16 全仓收口门 + 2.19 守护钉升级（钉 preload 路径而非名字）——扫描
  //    plugins/project/ui 全部非测试源码（js/jsx/ts/tsx/mts/cts），禁用词表：
  //    preloadRpcClientFactory（别名已收口，全仓零残留）、preloadTransport（构造期即抛的
  //    fail-loud 原语——实证绕过样例 createForgeRpcClient(preloadTransport()) 零别名字面量
  //    即可达成）、dshForge（window 直连）。扫描前剔除注释行（全行 // 与块注释），词面命中
  //    逐处白名单；任一非白名单命中即红。──
  describe('全仓收口门（plugins/project/ui 非测试源码 preload 路径零残留——钉路径而非名字）', () => {
    const UI_ROOT = join(DIR, '../../..')
    const EXT = /\.(js|jsx|ts|tsx|mts|cts)$/
    const IS_TEST = /\.test\.|\.spec\./

    /** 禁用词表：词 → 匹配（word boundary——__dshForge* 窗口锚键不受累） */
    const FORBIDDEN: Record<string, RegExp> = {
      preloadRpcClientFactory: /\bpreloadRpcClientFactory\b/,
      preloadTransport: /\bpreloadTransport\b/,
      dshForge: /\bdshForge\b/,
    }

    /** 合法保留逐处白名单：文件 → 词 → 允许的词面命中数 */
    const LEGIT: Record<string, Partial<Record<string, number>>> = {
      // bugs.list 本地缝回落（preload 优先、Typert fail-soft 兜底）——恰 1 处消费（import+调用）
      'dock-tabs/overview/overview-client.ts': { preloadTransport: 2 },
      // remote-entry Harness 桥缝真身（Electron 宿主 relaunch/safe-mode/showLog 三缝——非 RPC 传输面）
      'remote-entry/ForgeRemoteEntry.tsx': { dshForge: 3 },
    }
    /** 定义文件整文件豁免（preloadTransport / dshForge 真身唯一合法落点） */
    const DEFINITION_FILES = new Set(['dock-tabs/rpc-channels.ts'])

    /** 剔除注释行（全行 // 与块注释起始行），余下为代码词面 */
    const codeLines = (s: string): string =>
      s
        .split('\n')
        .filter((l) => {
          const t = l.trim()
          return !(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))
        })
        .join('\n')

    it('禁用词全仓扫描：非白名单文件零 preloadTransport / dshForge / preloadRpcClientFactory 命中', () => {
      const hits: string[] = []
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name)
          if (e.isDirectory()) walk(p)
          else if (EXT.test(e.name) && !IS_TEST.test(e.name)) {
            const rel = relative(UI_ROOT, p).replaceAll('\\', '/')
            if (DEFINITION_FILES.has(rel)) return
            const code = codeLines(readFileSync(p, 'utf8'))
            const allow = LEGIT[rel]
            if (allow === undefined) {
              for (const [word, re] of Object.entries(FORBIDDEN)) {
                if (re.test(code)) hits.push(`${rel}: ${word}（非白名单文件命中禁用词）`)
              }
            } else {
              for (const [word, re] of Object.entries(FORBIDDEN)) {
                const n = [...code.matchAll(new RegExp(re.source, 'g'))].length
                const max = allow[word]
                if (max === undefined ? n > 0 : n !== max) {
                  hits.push(`${rel}: ${word} ×${n}（白名单允许 ${max ?? 0}）`)
                }
              }
            }
          }
        }
      }
      walk(UI_ROOT)
      expect(hits, `preload 路径残留（定义豁免 = ${[...DEFINITION_FILES].join(', ')}；合法保留 = ${Object.keys(LEGIT).join(', ')}）`).toEqual([])
    })

    it('overview-client.ts：preloadTransport 恰 1 处消费（import+调用）且带 Typert 回落', () => {
      const s = src('../overview-client.ts')
      const n = [...s.matchAll(/\bpreloadTransport\b/g)].length
      expect(n, 'bugs 回落恰 1 处消费（词面 2：import + 调用）').toBe(2)
      expect(s).toMatch(/if \(channel !== BUGS_CHANNELS\.list\) return typert\(channel, payload\)/)
    })

    it('收口后 3 消费点零 preload 字面量且缺省 = Typert 工厂（bug-dialog/detail-section/BugPreview）', () => {
      const s = src('../bug-tab/bug-dialog.tsx')
      expect(s, 'bug-dialog 零 preload 工厂引用').not.toMatch(/\bpreloadRpcClientFactory\b/)
      expect(s, 'bug-dialog 缺省 = 概览 Typert 工厂').toContain('overviewRpcClientFactory')
      for (const rel of ['../../../detail-section/index.tsx', '../../../bug-refs/BugPreview.tsx']) {
        const s2 = src(rel)
        expect(s2, `${rel} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
        assertTypertRpcImport(s2, rel)
      }
    })
  })
})
