// worker 任务目录锚点节单测（worker-lean-execution 追加轮）：节形态（标题/引导句/锚点行+
// 行下职责注释）、键名随 source.kind、feature 附带同名 proposal_dir（盘上命中才出）、logs
// 锚点恒出（首跑目录未建也给出路径）、树渲染（目录优先/码序/深度与条目上限/隐藏项跳过）、
// fail-soft（主容器与 logs 锚点均缺席 = 空串）。
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { renderWorkerContext } from './worker-context.js'

const ROOT = mkdtempSync(join(tmpdir(), 'worker-ctx-'))
const FORGE = join(ROOT, '.forge')
const WS = join(ROOT, 'ws')
const LOGS = join(ROOT, 'ws-home', 'logs')

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

const HEADER = ['## 任务目录锚点', '本任务领取的目录锚点（绝对路径即取用值；行下注释为该目录职责）：', ''].join('\n')

describe('renderWorkerContext（worker 任务目录锚点节）', () => {
  it('proposal 任务：WORKSPACE + proposal_dir + forge.project_logs_dir（无 feature_dir）', () => {
    seed(join(FORGE, 'docs', 'proposals'), 'prop-a', ['proposal.md', 'persona-examples.md'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsDir: join(LOGS, 'prop-a', 'fix-1'),
      source: { kind: 'proposal', slug: 'prop-a' },
    })
    const lines = block.split('\n')
    expect(lines.slice(0, 3).join('\n')).toBe(HEADER)
    expect(block).toBe(
      [
        HEADER,
        `WORKSPACE: ${WS}`,
        '  工作区仓库根——代码、测试与配置所在；检索与改动均在此树内。',
        `proposal_dir: ${join(FORGE, 'docs', 'proposals', 'prop-a')}/`,
        '  提案文档目录——本任务的提案出处（proposal.md 及配套）。',
        '  ├─ persona-examples.md',
        '  └─ proposal.md',
        `forge.project_logs_dir: ${join(LOGS, 'prop-a', 'fix-1')}/`,
        '  任务运行产物根——按编号命名的各轮证据子文件夹与 resume.md 进度文件所在。',
      ].join('\n'),
    )
    expect(block).not.toContain('feature_dir')
  })

  it('feature 任务：proposal_dir（命中才出）+ feature_dir 两段，proposal 在前、logs 收尾', () => {
    seed(join(FORGE, 'docs', 'proposals'), 'feat-x', ['proposal.md'])
    seed(join(FORGE, 'docs', 'features'), 'feat-x', ['prd/prd-spec.md', 'design/tech-design.md', 'test/test-plan.md'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsDir: join(LOGS, 'feat-x', '2.2'),
      source: { kind: 'feature', slug: 'feat-x' },
    })
    const at = (k: string): number => block.indexOf(k)
    expect(block.startsWith(HEADER)).toBe(true)
    expect(at('proposal_dir:')).toBeGreaterThan(at('WORKSPACE:'))
    expect(at('feature_dir:')).toBeGreaterThan(at('proposal_dir:'))
    expect(at('forge.project_logs_dir:')).toBeGreaterThan(at('feature_dir:'))
    expect(block).toContain('  特性文档目录——prd/（需求与用户故事）、design/（技术设计）、test/（测试规划）。')
    // 树渲染：目录优先 + 码序 + box-drawing + 目录尾斜杠
    expect(block).toContain('  ├─ design/\n  │  └─ tech-design.md')
    expect(block).toContain('  ├─ prd/\n  │  └─ prd-spec.md')
    expect(block).toContain('  └─ test/\n     └─ test-plan.md')
  })

  it('feature 任务且 proposal 目录缺席：省附段（WORKSPACE + feature_dir + logs 仍出）', () => {
    seed(join(FORGE, 'docs', 'features'), 'solo-feat', ['prd/prd-spec.md'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsDir: join(LOGS, 'solo-feat', '1.1'),
      source: { kind: 'feature', slug: 'solo-feat' },
    })
    expect(block).toContain(`feature_dir: ${join(FORGE, 'docs', 'features', 'solo-feat')}/`)
    expect(block).not.toContain('proposal_dir')
    expect(block).toContain('forge.project_logs_dir:')
  })

  it('logs 锚点恒出：首跑目录未创建也给出路径（零树行）；主容器缺席 + logs 在 → 节仍出', () => {
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsDir: join(LOGS, 'ghost', '1.1'),
      source: { kind: 'proposal', slug: 'ghost' },
    })
    expect(block).toContain(`forge.project_logs_dir: ${join(LOGS, 'ghost', '1.1')}/`)
    expect(block).toContain('任务运行产物根')
    // 主容器缺席 → 无 proposal_dir/feature_dir 段（fail-soft 省段不省节）
    expect(block).not.toContain('proposal_dir:')
  })

  it('树深度上限 3 + 隐藏项跳过 + 条目截断符', () => {
    seed(join(FORGE, 'docs', 'features'), 'deep', ['a/1/2/3/deep-file.md', 'a/1/shallow.md', '.hidden'])
    const block = renderWorkerContext({
      wsPath: WS,
      forgeDir: FORGE,
      logsDir: join(LOGS, 'deep', '1.1'),
      source: { kind: 'feature', slug: 'deep' },
    })
    expect(block).toContain('  └─ a/\n     └─ 1/\n        ├─ 2/\n        └─ shallow.md')
    expect(block).not.toContain('deep-file.md') // 第 4 层截断
    expect(block).not.toContain('.hidden')
  })
})
