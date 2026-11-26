// project-key 单测（forge-dirs-unification 2.1）：projectKeyOf = deriveDirName 原文口径
// （空/空白抛 ProjectKeyDerivationError）+ resolveProjectKey 取法三径（注册表命中 /
// git 现查归拢 / 双失败回退 cwd 键）+ 规范化先于键派生 + 标记预检零 git 调用 + 非本仓回退。
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { deriveDirName } from './derive-dir.js'
import {
  type GitPorcelainRunner,
  MARKER_PATTERN,
  resolveProjectKey,
  ProjectKeyDerivationError,
  projectKeyOf,
} from './project-key.js'

const WT_CWD = 'Z:\\project\\demo\\.forge\\worktrees\\wt-a'

/** 临时目录登记（afterAll 统一清理——不留盘污染临时区） */
const tempDirs: string[] = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('projectKeyOf', () => {
  it('任意工作区路径 → projectKey = deriveDirName 同键', () => {
    expect(projectKeyOf(WT_CWD)).toBe(deriveDirName(WT_CWD))
    expect(projectKeyOf('Z:/project/demo/.forge/worktrees/wt-a/')).toBe(deriveDirName('Z:/project/demo/.forge/worktrees/wt-a/'))
  })

  it.each(['', '   ', '\t\n'])('空/空白路径 %j → ProjectKeyDerivationError（ERR_PROJECT_KEY_DERIVATION）', (p) => {
    expect(() => projectKeyOf(p)).toThrowError(ProjectKeyDerivationError)
    expect(() => projectKeyOf(p)).toThrowError(/ERR_PROJECT_KEY_DERIVATION/)
  })
})

describe('resolveProjectKey', () => {
  it('注册表命中：主工作区行归一后派生键，rolledUp = true，零 git 调用', () => {
    const gitRunner: GitPorcelainRunner = () => {
      throw new Error('git 不应被调用')
    }
    const r = resolveProjectKey(WT_CWD, {
      registryQuery: (cwd) => (cwd === WT_CWD ? 'Z:/project/demo' : undefined),
      gitRunner,
    })
    expect(r.rolledUp).toBe(true)
    expect(r.mainRoot).toBe('Z:/project/demo')
    expect(r.key).toBe(projectKeyOf('Z:/project/demo'))
    expect(r.fallbackReason).toBeUndefined()
  })

  it('注册表缺席 → git 现查归拢主检出，键 = 主根键', () => {
    const porcelain = [
      'worktree Z:/project/demo',
      'HEAD abc',
      'branch refs/heads/main',
      '',
      `worktree ${WT_CWD.replaceAll('\\', '/')}`,
      'HEAD abc',
      'branch refs/heads/wt-a',
      '',
    ].join('\n')
    const r = resolveProjectKey(WT_CWD, {
      registryQuery: () => undefined,
      gitRunner: () => porcelain,
    })
    expect(r.rolledUp).toBe(true)
    // 主根拼写随 cwd 改写（反斜杠风格）
    expect(r.mainRoot).toBe('Z:\\project\\demo')
    expect(r.key).toBe(projectKeyOf('Z:\\project\\demo'))
  })

  it('标记不命中 → 零 git 调用，原样 cwd 键，无回退原因', () => {
    const spy = vi.fn<GitPorcelainRunner>()
    const r = resolveProjectKey('Z:\\project\\demo', { registryQuery: () => undefined, gitRunner: spy })
    expect(r).toEqual({ key: projectKeyOf('Z:\\project\\demo'), rolledUp: false })
    expect(spy).not.toHaveBeenCalled()
    expect(MARKER_PATTERN.test('Z:\\project\\demo\\.forge\\tmp')).toBe(false)
    expect(MARKER_PATTERN.test('Z:/project/demo/.forge/worktrees/x')).toBe(true)
  })

  it('git 清单不含 cwd（非本仓 worktree）→ 回退 cwd 键 + 回退原因', () => {
    const r = resolveProjectKey(WT_CWD, { registryQuery: () => undefined, gitRunner: () => 'worktree Z:/other/repo\n' })
    expect(r.rolledUp).toBe(false)
    expect(r.key).toBe(projectKeyOf(WT_CWD))
    expect(r.fallbackReason).toBe('porcelain 清单不含 cwd（非本仓 worktree）——回退 cwd 键')
  })

  it('空 cwd → 派生拒绝原样上抛（标记不命中径）', () => {
    expect(() => resolveProjectKey('', { registryQuery: () => undefined })).toThrowError(ProjectKeyDerivationError)
  })

  it('注册表缺席 + git fail-soft → 回退 cwd 键，rolledUp = false + fallbackReason', () => {
    const r = resolveProjectKey(WT_CWD, {
      registryQuery: () => undefined,
      gitRunner: () => {
        throw new Error('git 缺席')
      },
    })
    expect(r.rolledUp).toBe(false)
    expect(r.key).toBe(projectKeyOf(WT_CWD))
    expect(r.fallbackReason).toMatch(/git/)
  })

  it('主检出路径先规范化（真实路径与大小写）再算键', () => {
    const real = mkdtempSync(join(tmpdir(), 'pk-'))
    tempDirs.push(real)
    // 注入 canonicalize 模拟 realpath 大小写收敛：注册表行给小写盘符拼写，规范化后异键
    const r = resolveProjectKey(WT_CWD, {
      registryQuery: () => real.toLowerCase(),
      canonicalize: (p) => (p === real.toLowerCase() ? real : p),
    })
    expect(r.mainRoot).toBe(real)
    expect(r.key).toBe(projectKeyOf(real))
    expect(r.key).not.toBe(projectKeyOf(real.toLowerCase()))
  })

  it('默认规范化 = realpath（临时目录真实解析）', () => {
    const real = mkdtempSync(join(tmpdir(), 'pk-'))
    tempDirs.push(real)
    const r = resolveProjectKey(WT_CWD, { registryQuery: () => real })
    expect(r.mainRoot).toBe(real)
    expect(r.key).toBe(projectKeyOf(real))
  })
})
