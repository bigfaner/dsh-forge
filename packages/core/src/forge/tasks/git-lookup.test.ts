// 任务 2.6 测试 —— git 只读查找（tech-design §Interface 1 taskDetail「实际改动范围 =
// files_json → commit 只读 git 查询」+ §Security Mitigations ③ + Dependencies「git = 可选
// 环境依赖」）。Hard Rule 断言面：白名单子命令封闭 ['show','diff-tree']；execFile 恒数组参
// （禁 shell 字符串拼接）；timeout 2s；ENOENT 与失败同路静默回退记录语（不区分形态）。
import { describe, expect, it } from 'vitest'
import {
  assertGitSubcommandAllowed,
  GIT_LOOKUP_FALLBACK_ENTRY,
  GIT_LOOKUP_TIMEOUT_MS,
  GIT_WHITELIST_SUBCOMMANDS,
  listCommitFiles,
  type GitExecFile,
} from './git-lookup.js'

/** execFile 注入桩（记录调用形状 + 受控成败——生产/测试同签名） */
function gitSpy(outcome: {
  stdout?: string
  error?: Error & { code?: string | number | null }
  syncThrow?: Error
}) {
  const calls: Array<{ command: string; args: readonly string[]; options: { cwd: string; timeout: number } }> = []
  const execFile: GitExecFile = (command, args, options, callback) => {
    calls.push({ command, args, options })
    if (outcome.syncThrow !== undefined) throw outcome.syncThrow
    if (outcome.error !== undefined) {
      queueMicrotask(() => callback(outcome.error as Error & { code?: string | number | null }, '', ''))
      return
    }
    queueMicrotask(() => callback(null, outcome.stdout ?? '', ''))
  }
  return { calls, execFile }
}

describe('AC4-① 白名单子命令封闭（Hard Rule：新增 = 契约面变更）', () => {
  it("白名单常量 pin：恰 ['show', 'diff-tree'] 两值", () => {
    expect(GIT_WHITELIST_SUBCOMMANDS).toEqual(['show', 'diff-tree'])
  })

  it('守卫：白名单内子命令放行；外子命令（log/status/push…）fail-loud 拒绝', () => {
    expect(() => assertGitSubcommandAllowed('show')).not.toThrow()
    expect(() => assertGitSubcommandAllowed('diff-tree')).not.toThrow()
    for (const forbidden of ['log', 'status', 'push', 'config', '', 'diff-tree ']) {
      expect(() => assertGitSubcommandAllowed(forbidden)).toThrow(/白名单/)
    }
  })
})

describe('AC4-② 调用形状：恒数组参 + timeout 2s + cwd 透传（禁 shell 字符串拼接）', () => {
  it("execFile('git', [数组参], { cwd, timeout: 2000 })——首参恒 'git'、args 是数组、子命令 ∈ 白名单", async () => {
    const spy = gitSpy({ stdout: 'a.ts\n' })
    await listCommitFiles({ execFile: spy.execFile }, { cwd: 'C:\\repo', commitHash: 'abc123' })
    expect(spy.calls).toHaveLength(1)
    const call = spy.calls[0]!
    expect(call.command).toBe('git')
    expect(Array.isArray(call.args)).toBe(true)
    expect(GIT_WHITELIST_SUBCOMMANDS).toContain(call.args[0])
    expect(call.args).toEqual(['diff-tree', '--no-commit-id', '--name-only', '-r', 'abc123'])
    expect(call.options.timeout).toBe(GIT_LOOKUP_TIMEOUT_MS)
    expect(call.options.timeout).toBe(2000)
    expect(call.options.cwd).toBe('C:\\repo')
  })

  it("commit 两侧空白剪除（'abc123 ' → 'abc123'——入参规范化零拼装面）", async () => {
    const spy = gitSpy({ stdout: 'a.ts\n' })
    await listCommitFiles({ execFile: spy.execFile }, { cwd: 'C:\\r', commitHash: ' abc123 ' })
    expect(spy.calls[0]?.args.at(-1)).toBe('abc123')
  })
})

describe('AC4-③ ENOENT 与失败同路回退记录语（git = 可选环境依赖）', () => {
  it('ENOENT（git 二进制缺席）→ [回退记录语]', async () => {
    const spy = gitSpy({ error: Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' }) })
    await expect(
      listCommitFiles({ execFile: spy.execFile }, { cwd: 'C:\\repo', commitHash: 'abc' }),
    ).resolves.toEqual([GIT_LOOKUP_FALLBACK_ENTRY])
  })

  it('非零退出（未知 revision 等）→ 同路 [回退记录语]（不区分形态）', async () => {
    const spy = gitSpy({ error: Object.assign(new Error('exit 128'), { code: 1 }) })
    await expect(
      listCommitFiles({ execFile: spy.execFile }, { cwd: 'C:\\repo', commitHash: 'deadbeef' }),
    ).resolves.toEqual([GIT_LOOKUP_FALLBACK_ENTRY])
  })

  it('空 commitHash（数据面缺席）→ 同路 [回退记录语]（零子进程发起）', async () => {
    const spy = gitSpy({ stdout: '' })
    await expect(
      listCommitFiles({ execFile: spy.execFile }, { cwd: 'C:\\repo', commitHash: '  ' }),
    ).resolves.toEqual([GIT_LOOKUP_FALLBACK_ENTRY])
    expect(spy.calls).toHaveLength(0)
  })

  it('注入面同步抛出 → 同路 [回退记录语]（查找永不拖垮读面）', async () => {
    const spy = gitSpy({ syncThrow: new Error('exec unavailable') })
    await expect(
      listCommitFiles({ execFile: spy.execFile }, { cwd: 'C:\\repo', commitHash: 'abc' }),
    ).resolves.toEqual([GIT_LOOKUP_FALLBACK_ENTRY])
  })
})

describe('AC4-④ 成功路径：stdout 每行一文件（正斜杠路径）', () => {
  it('多行输出 → 文件清单（空白行剪除）；空输出（空 commit）→ []', async () => {
    const spy = gitSpy({ stdout: 'packages/core/src/a.ts\npackages/web/src/b/c.ts\n\n' })
    await expect(
      listCommitFiles({ execFile: spy.execFile }, { cwd: 'C:\\repo', commitHash: 'abc' }),
    ).resolves.toEqual(['packages/core/src/a.ts', 'packages/web/src/b/c.ts'])

    const empty = gitSpy({ stdout: '' })
    await expect(
      listCommitFiles({ execFile: empty.execFile }, { cwd: 'C:\\repo', commitHash: 'abc' }),
    ).resolves.toEqual([])
  })
})
