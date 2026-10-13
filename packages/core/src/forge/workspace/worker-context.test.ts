// worker 任务目录锚点节单测（worker-lean-execution 追加轮）：节形态（标题/引导句/介绍行顶格+
// 路径行缩进+树同缩进）、锚点间空行分组、键名随 source.kind、feature 附带同名 proposal_dir
// （盘上命中才出）、logs 双锚恒出（forge.project_logs_dir 根 + forge.task_logs_dir 任务目录）、
// 任务日志树仅目录在盘时、树渲染（目录优先/码序/深度与条目上限/隐藏项跳过）。
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { renderWorkerContext } from './worker-context.js'

const ROOT = mkdtempSync(join(tmpdir(), 'worker-ctx-'))
const FORGE = join(ROOT, '.forge')
const WS = join(ROOT, 'ws')
const LOGS_ROOT = join(ROOT, 'ws-home', 'logs')

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

function seed(base: string, slug: string, files: string[]): void {
  for (const rel of files) {
    const abs = join(base, slug, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, 'x')
  }
}

const HEADER = ['## 任务目录锚点', '本任务领取的目录锚点（首行职责介绍；缩进行为绝对路径与目录内容）：', ''].join('\n')

describe('renderWorkerContext（worker 任务目录锚点节）', () => {
  it('proposal 任务：WORKSPACE + proposal_dir + logs 双锚（无 feature_dir；介绍行在前、路径与树在后）', () => {
    seed(join(FORGE, 'docs', 'proposals'), 'prop-a', ['proposal.md', 'persona-examples.md'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsRoot: LOGS_ROOT,
      localId: 'fix-1',
      source: { kind: 'proposal', slug: 'prop-a' },
    })
    expect(block).toBe(
      [
        HEADER,
        'WORKSPACE——工作区仓库根：代码、测试与配置所在；检索与改动均在此树内。',
        `  ${WS}`,
        '',
        'proposal_dir——提案文档目录：本任务的提案出处（proposal.md 及配套）。',
        `  ${join(FORGE, 'docs', 'proposals', 'prop-a')}\\`,
        '  ├─ persona-examples.md',
        '  └─ proposal.md',
        '',
        'forge.project_logs_dir——forge 运行日志目录：任务日志存放的根目录（位于工作区仓库之外，属 dsh-forge 运行数据——不进 git）。',
        `  ${LOGS_ROOT}\\`,
        '',
        'forge.task_logs_dir——任务日志目录：{forge.task_logs_dir} = {forge.project_logs_dir}/{slug}/{local_id}；本轮任务的证据子文件夹与 resume.md 进度文件存储在此。',
        `  ${join(LOGS_ROOT, 'prop-a', 'fix-1')}\\`,
      ].join('\n'),
    )
    expect(block).not.toContain('feature_dir')
  })

  it('feature 任务：proposal_dir（命中才出）+ feature_dir 两段；锚点序 = WORKSPACE→proposal→feature→logs 根→任务日志', () => {
    seed(join(FORGE, 'docs', 'proposals'), 'feat-x', ['proposal.md'])
    seed(join(FORGE, 'docs', 'features'), 'feat-x', ['prd/prd-spec.md', 'design/tech-design.md', 'test/test-plan.md'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsRoot: LOGS_ROOT,
      localId: '2.2',
      source: { kind: 'feature', slug: 'feat-x' },
    })
    const at = (k: string): number => block.indexOf(k)
    expect(block.startsWith(HEADER)).toBe(true)
    expect(at('proposal_dir——')).toBeGreaterThan(at('WORKSPACE——'))
    expect(at('feature_dir——')).toBeGreaterThan(at('proposal_dir——'))
    expect(at('forge.project_logs_dir——')).toBeGreaterThan(at('feature_dir——'))
    expect(at('forge.task_logs_dir——')).toBeGreaterThan(at('forge.project_logs_dir——'))
    expect(block).toContain('feature_dir——特性文档目录：prd/（需求与用户故事）、design/（技术设计）、test/（测试规划）。')
    // 树渲染：目录优先 + 码序 + box-drawing + 目录尾反斜杠
    expect(block).toContain('  ├─ prd\\\n  │  └─ prd-spec.md')
    expect(block).toContain('  ├─ design\\\n  │  └─ tech-design.md')
    expect(block).toContain('  └─ test\\\n     └─ test-plan.md')
  })

  it('feature 任务且 proposal 目录缺席：省附段；logs 双锚恒出', () => {
    seed(join(FORGE, 'docs', 'features'), 'solo-feat', ['prd/prd-spec.md'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsRoot: LOGS_ROOT,
      localId: '1.1',
      source: { kind: 'feature', slug: 'solo-feat' },
    })
    expect(block).toContain('feature_dir——')
    expect(block).not.toContain('proposal_dir——')
    expect(block).toContain('forge.project_logs_dir——')
    expect(block).toContain('forge.task_logs_dir——')
  })

  it('容器全缺席：WORKSPACE + logs 双锚仍出（首跑任务日志目录未建 → 无树行）', () => {
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsRoot: LOGS_ROOT,
      localId: '1.1',
      source: { kind: 'proposal', slug: 'ghost' },
    })
    expect(block).toContain('forge.task_logs_dir——任务日志目录：')
    expect(block).toContain(`  ${join(LOGS_ROOT, 'ghost', '1.1')}\\`)
    // 任务日志目录未建 → 介绍行 + 路径行后无树行（该段两行收束）
    const taskLogsSection = block.slice(block.indexOf('forge.task_logs_dir——'))
    expect(taskLogsSection.split('\n')).toHaveLength(2)
    expect(block).not.toContain('proposal_dir——')
  })

  it('任务日志树：目录在盘时展开（{slug}/{local_id} 下各轮子文件夹 + resume.md）', () => {
    seed(LOGS_ROOT, 'deep', ['1.1/a/1/2/3/deep-file.md', '1.1/a/1/shallow.md', '1.1/.hidden'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsRoot: LOGS_ROOT,
      localId: '1.1',
      source: { kind: 'feature', slug: 'deep' },
    })
    // feature 容器缺席 → 无 feature_dir 段；任务日志树在 logs 双锚下展开
    expect(block).not.toContain('feature_dir——')
    expect(block).toContain('  └─ a\\\n     └─ 1\\\n        ├─ 2\\\n        └─ shallow.md')
    expect(block).not.toContain('deep-file.md') // 第 4 层截断
    expect(block).not.toContain('.hidden')
  })
})
