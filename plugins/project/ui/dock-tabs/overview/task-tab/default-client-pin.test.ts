// 生产默认值守护钉（2.12 回归判例 2026-11-25）：
// 任务子 tab 的数据装载 hooks（useTasksTabLoad / useTaskContainerCards / TasksTab）缺省 client
// 工厂必须是官方宿主可达的 Typert 工厂（overviewRpcClientFactory）——此前缺省为
// preloadRpcClientFactory（window.dshForge.invoke，仅自建宿主 dsh-forge 存在），官方宿主上
// 渲染期同步抛「宿主 preload 未接 RPC 面」→ slot entry crashed → 项目概览整片空白。
//
// 为什么读源码而不渲染：既有用例全部注入 makeClient 替身，绕过缺省值——替身永远绿、
// 真机恒炸（本容器「替身绕过生产路径」判例族）。本钉直接对源码文本断言缺省值归属，
// 不经任何注入面，任一工厂退回 preload 即红。
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = import.meta.dirname
const src = (f: string): string => readFileSync(join(DIR, f), 'utf8')

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
  //    Typert 工厂）——同读源码口径，零替身注入，任一文件退回 preload 即红。──
  describe('侧栏/树/抽屉组缺省 client 工厂扩面（生产默认值——零替身注入面）', () => {
    const typertPin = (rel: string, label: string): void => {
      const s = src(rel)
      expect(s, `${label} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
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
  //    全量换官方宿主可达 Typert 工厂）——同读源码口径，零替身注入，任一文件退回 preload 即红。──
  describe('添加项目向导/Bug 引用/侧栏改名组缺省 client 工厂扩面（生产默认值——零替身注入面）', () => {
    const files = [
      '../../../add-project/AddProjectFlow.tsx',
      '../../../add-project/derive-source.ts',
      '../../../add-project/dir-source.ts',
      '../../../add-project/flow-actions.ts',
      '../../../official-seams.ts',
      '../../../sidebar/ForgeSidebarSlot.tsx',
    ]
    it('本组 6 文件零 preloadRpcClientFactory 字面量，缺省消费点 = createForgeRpcClient（ui/rpc Typert 切片）', () => {
      for (const rel of files) {
        const s = src(rel)
        expect(s, `${rel} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
        expect(s, `${rel} 数据通路 = Typert 切片工厂`).toContain('createForgeRpcClient')
      }
    })
  })

  // ── 2.16 会话徽章/worktree 选择器组扩面（用户裁决 2026-11-25 收尾组）——同读源码口径，
  //    零替身注入，任一文件退回 preload 即红。渲染期构造安全性：createForgeRpcClient 构造
  //    期不抛（face 缺席 = 调用期诚实降级），chip/seal-notice 均在 effect 内 try/catch 消费。──
  describe('会话徽章/worktree 选择器组缺省 client 工厂扩面（生产默认值——零替身注入面）', () => {
    const files = [
      '../../../session-badge/chip.tsx',
      '../../../session-badge/seal-notice.tsx',
      '../../../worktree-picker/hero-workspace-picker.tsx',
      '../../../worktree-picker/picker.tsx',
    ]
    it('本组 4 文件零 preloadRpcClientFactory 字面量，缺省消费点 = createForgeRpcClient（ui/rpc Typert 切片）', () => {
      for (const rel of files) {
        const s = src(rel)
        expect(s, `${rel} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
        expect(s, `${rel} 数据通路 = Typert 切片工厂`).toContain('createForgeRpcClient')
      }
    })

    it('picker.tsx：features.list 死通道零残留（feature 域已随 G2 退役——2.16 遗留处置钉）', () => {
      const s = src('../../../worktree-picker/picker.tsx')
      expect(s, 'features.list 消费零残留').not.toMatch(/\bfeatures\.list\b/)
      expect(s, 'slug 候选拉取死分支已拔除').not.toContain('collectSlugCandidates')
    })
  })

  // ── 2.16 全仓收口门（用户裁决 2026-11-25：preload 消费点全量修复收尾）——扫描
  //    plugins/project/ui 全部非测试源码，preloadRpcClientFactory 字面量仅允许出现在
  //    定义本身（ui/rpc.ts、dock-tabs/rpc-channels.ts）、sidebar 再导出面与
  //    overview-client.ts 的 bugs.list preload 优先回落（Typert fail-soft 色底）。
  //    任一消费点回引 preload 工厂即红。──
  describe('全仓收口门（plugins/project/ui 非测试源码 preload 调用零残留）', () => {
    const UI_ROOT = join(DIR, '../../..')
    const LEGIT = new Set(['rpc.ts', 'dock-tabs/rpc-channels.ts', 'sidebar/index.ts', 'dock-tabs/overview/overview-client.ts'])

    it('收口后 3 消费点零 preload 字面量且缺省 = Typert 工厂（bug-dialog/detail-section/BugPreview）', () => {
      const s = src('../bug-tab/bug-dialog.tsx')
      expect(s, 'bug-dialog 零 preload 工厂引用').not.toMatch(/\bpreloadRpcClientFactory\b/)
      expect(s, 'bug-dialog 缺省 = 概览 Typert 工厂').toContain('overviewRpcClientFactory')
      for (const rel of ['../../../detail-section/index.tsx', '../../../bug-refs/BugPreview.tsx']) {
        const s2 = src(rel)
        expect(s2, `${rel} 零 preload 工厂引用`).not.toMatch(/\bpreloadRpcClientFactory\b/)
        expect(s2, `${rel} 数据通路 = Typert 切片工厂`).toContain('createForgeRpcClient')
      }
    })

    it('plugins/project/ui 非测试源码 preloadRpcClientFactory 字面量仅剩四处合法保留', () => {
      const hits: string[] = []
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name)
          if (e.isDirectory()) walk(p)
          else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && readFileSync(p, 'utf8').includes('preloadRpcClientFactory')) {
            hits.push(relative(UI_ROOT, p).replaceAll('\\', '/'))
          }
        }
      }
      walk(UI_ROOT)
      expect(hits.filter((h) => !LEGIT.has(h)), `preload 残留消费点（合法保留 = ${[...LEGIT].join(', ')}）`).toEqual([])
    })
  })
})
