// worker 容器上下文段单测（worker-lean-execution 追加轮）：块形态（键名随 source.kind）、
// feature 附带同名 proposal_dir（盘上命中才出）、树渲染（目录优先/码序/深度与条目上限/
// 隐藏项跳过）、fail-soft（主容器缺席 = 空串；附段缺席 = 省段）。
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { renderWorkerContext } from './worker-context.js'

const ROOT = mkdtempSync(join(tmpdir(), 'worker-ctx-'))
const FORGE = join(ROOT, '.forge')
const WS = join(ROOT, 'ws')

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

function seedFeature(slug: string, files: string[]): void {
  for (const rel of files) {
    const abs = join(FORGE, 'docs', 'features', slug, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, 'x')
  }
}

function seedProposal(slug: string, files: string[]): void {
  for (const rel of files) {
    const abs = join(FORGE, 'docs', 'proposals', slug, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, 'x')
  }
}

describe('renderWorkerContext（worker 容器上下文块）', () => {
  it('proposal 任务：WORKSPACE + proposal_dir 一段（无 feature 目录）', () => {
    seedProposal('prop-a', ['proposal.md', 'persona-examples.md'])
    const block = renderWorkerContext({ wsPath: WS, forgeDir: FORGE, source: { kind: 'proposal', slug: 'prop-a' } })
    expect(block).toBe(
      `WORKSPACE: ${WS}\n\nproposal_dir: ${join(FORGE, 'docs', 'proposals', 'prop-a')}/\n├─ persona-examples.md\n└─ proposal.md`,
    )
    expect(block).not.toContain('feature_dir')
  })

  it('feature 任务：proposal_dir（命中才出）+ feature_dir 两段，proposal 在前', () => {
    seedProposal('feat-x', ['proposal.md'])
    seedFeature('feat-x', ['prd/prd-spec.md', 'design/tech-design.md', 'test/test-plan.md'])
    const block = renderWorkerContext({ wsPath: WS, forgeDir: FORGE, source: { kind: 'feature', slug: 'feat-x' } })
    const lines = block.split('\n')
    expect(lines[0]).toBe(`WORKSPACE: ${WS}`)
    expect(block).toContain(`proposal_dir: ${join(FORGE, 'docs', 'proposals', 'feat-x')}/`)
    expect(block).toContain(`feature_dir: ${join(FORGE, 'docs', 'features', 'feat-x')}/`)
    expect(block.indexOf('proposal_dir:')).toBeGreaterThan(0)
    expect(block.indexOf('feature_dir:')).toBeGreaterThan(block.indexOf('proposal_dir:'))
    // 树渲染：目录优先 + 码序 + box-drawing + 目录尾斜杠
    expect(block).toContain('├─ design/\n│  └─ tech-design.md')
    expect(block).toContain('├─ prd/\n│  └─ prd-spec.md')
    expect(block).toContain('└─ test/\n   └─ test-plan.md')
  })

  it('feature 任务且 proposal 目录缺席：仅 feature_dir 段（附段省略）', () => {
    seedFeature('solo-feat', ['prd/prd-spec.md'])
    const block = renderWorkerContext({ wsPath: WS, forgeDir: FORGE, source: { kind: 'feature', slug: 'solo-feat' } })
    expect(block).toContain(`feature_dir: ${join(FORGE, 'docs', 'features', 'solo-feat')}/`)
    expect(block).not.toContain('proposal_dir')
  })

  it('主容器缺席 → 空串（fail-soft——claim 跳过追加）', () => {
    expect(
      renderWorkerContext({ wsPath: WS, forgeDir: FORGE, source: { kind: 'feature', slug: 'ghost' } }),
    ).toBe('')
    expect(
      renderWorkerContext({ wsPath: WS, forgeDir: FORGE, source: { kind: 'proposal', slug: 'ghost' } }),
    ).toBe('')
  })

  it('树深度上限 3 + 隐藏项跳过', () => {
    seedFeature('deep', [
      'a/1/2/3/deep-file.md', // 第 4 层文件——超深截断
      'a/1/shallow.md',
      '.hidden',
    ])
    const block = renderWorkerContext({ wsPath: WS, forgeDir: FORGE, source: { kind: 'feature', slug: 'deep' } })
    expect(block).toContain('└─ a/\n   └─ 1/\n      ├─ 2/\n      └─ shallow.md')
    expect(block).not.toContain('deep-file.md') // 第 4 层截断
    expect(block).not.toContain('.hidden')
  })
})
