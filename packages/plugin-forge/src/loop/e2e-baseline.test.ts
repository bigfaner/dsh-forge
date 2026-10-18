// 改进7（dispatch-loop-hardening · e2e 取证债）· 红灯基线门单测：
// parseE2eRedSpecs（FAIL/✘ 行解析/去重/排序/噪音滤除）、runE2eBaseline（成功 + 执行故障
// fail-soft + 超时 fail-soft）、baselineForHead（HEAD 键控缓存）、attributionTaskInput
// （三分流归因卡载荷形状）、createE2eBaselineFace（真子进程装配面）。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { attributionTaskInput, baselineForHead, createE2eBaselineFace, parseE2eRedSpecs, runE2eBaseline } from './e2e-baseline.js'

describe('parseE2eRedSpecs（套件输出 → 红灯 spec 清单）', () => {
  it('FAIL 行提取 + 去重 + 字母序', () => {
    const output = [
      'FAIL  e2e/specs/b.spec.ts > suite > case',
      'PASS  e2e/specs/green.spec.ts > suite > case',
      'FAIL e2e/specs/a.spec.ts > suite > case',
      'FAIL  e2e/specs/b.spec.ts > suite > case-2',
    ].join('\n')
    expect(parseE2eRedSpecs(output)).toEqual(['e2e/specs/a.spec.ts', 'e2e/specs/b.spec.ts'])
  })

  it('非 spec 路径滤除 + 空输出零清单', () => {
    expect(parseE2eRedSpecs('FAIL packages/core/src/x.ts\n✗ something else')).toEqual([])
    expect(parseE2eRedSpecs('')).toEqual([])
  })

  it('playwright list reporter ✘ 行（[project] › path:12:5 › title）提取 + 去重 + 字母序', () => {
    const output = [
      'Running 128 tests using 4 workers',
      '',
      '  ✘  1 [chromium] › e2e/specs/m2/dogfood.spec.ts:12:5 › chain › seed (302ms)',
      '  -  2 skipped',
      '  ✘  2 [chromium] › e2e\\specs\\m3\\blitz.spec.ts:8:3 › direct (1.2s)',
      '  ✘  1 [chromium] › e2e/specs/m2/dogfood.spec.ts:12:5 › chain › seed (retry #1)',
      '',
      '  2 failed',
      '  1 skipped',
      '  125 passed',
    ].join('\n')
    expect(parseE2eRedSpecs(output)).toEqual(['e2e/specs/m2/dogfood.spec.ts', 'e2e\\specs\\m3\\blitz.spec.ts'])
  })

  it('vitest default reporter：❯ 汇总行（带 failed）计红；❯ 运行指示行不计', () => {
    const output = [
      ' RUN  v5.0.3 Z:/repo',
      '',
      ' ❯ |plugin-forge| packages/plugin-forge/src/__probe__/red.test.ts (1 test | 1 failed) 7ms',
      '   ❯ probe-red (1)',
      '     × fails for baseline probe 6ms',
      '',
      ' Test Files  1 failed (1)',
    ].join('\n')
    expect(parseE2eRedSpecs(output)).toEqual(['packages/plugin-forge/src/__probe__/red.test.ts'])
  })
})

describe('runE2eBaseline（基线跑批）', () => {
  it('成功：ranAt + 红灯清单', async () => {
    const r = await runE2eBaseline(async () => 'FAIL e2e/specs/x.spec.ts > s')
    expect(r.redSpecs).toEqual(['e2e/specs/x.spec.ts'])
    expect(r.error).toBeUndefined()
    expect(Number.isNaN(Date.parse(r.ranAt))).toBe(false)
  })

  it('套件执行故障：fail-soft 空清单 + error 留痕（不阻循环）', async () => {
    const r = await runE2eBaseline(async () => {
      throw new Error('harness missing')
    })
    expect(r.redSpecs).toEqual([])
    expect(r.error).toBe('harness missing')
  })

  it('套件挂死超时包裹：fail-soft 空清单 + 超时 error 留痕（不拖循环入场）', async () => {
    const r = await runE2eBaseline(
      () => new Promise<string>(() => {}),
      { timeoutMs: 20 },
    )
    expect(r.redSpecs).toEqual([])
    expect(r.error).toContain('超时')
  })
})

describe('createE2eBaselineFace（宿主装配面——真子进程）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'forge-e2e-baseline-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('runSuite：真子进程 reporter 输出 → 红灯清单（非零退出输出照常解析）', async () => {
    const face = createE2eBaselineFace({
      cwd: dir,
      command: process.execPath,
      args: ['-e', 'process.stdout.write("  ✘  1 [chromium] › e2e/specs/probe.spec.ts:10:5 › t"); process.exitCode = 1'],
      shell: false,
    })
    const r = await runE2eBaseline(face.runSuite, { timeoutMs: 30_000 })
    expect(r.error).toBeUndefined()
    expect(r.redSpecs).toEqual(['e2e/specs/probe.spec.ts'])
  })

  it('runSuite：命令缺席/零输出 → fail-soft error 留痕', async () => {
    const face = createE2eBaselineFace({
      cwd: dir,
      command: process.execPath,
      args: ['-e', 'process.exitCode = 1'],
      shell: false,
      timeoutMs: 30_000,
    })
    const r = await runE2eBaseline(face.runSuite, { timeoutMs: 30_000 })
    expect(r.redSpecs).toEqual([])
    expect(r.error).toBeDefined()
  })

  it('bug 637fcb9e：套件崩溃形态（stderr 堆栈零红灯行）→ 基线「不可得」（error 在场），与全绿不同形', async () => {
    const face = createE2eBaselineFace({
      cwd: dir,
      command: process.execPath,
      args: [
        '-e',
        'console.error("Error: harness config boom"); console.error("    at Object.<anonymous> (config.ts:3:9)"); process.exitCode = 1',
      ],
      shell: false,
      timeoutMs: 30_000,
    })
    const r = await runE2eBaseline(face.runSuite, { timeoutMs: 30_000 })
    expect(r.redSpecs).toEqual([])
    expect(r.error).toBeDefined() // 修复前：error 缺席 = 崩溃被记「基线全绿」（漏报）
  })

  it('face cwd 锚定：runSuite 按传入 worktree 定 cwd（与 readHead 缓存键同源——多 worktree 不错位）', async () => {
    const d1 = mkdtempSync(join(tmpdir(), 'forge-baseline-wt1-'))
    const d2 = mkdtempSync(join(tmpdir(), 'forge-baseline-wt2-'))
    writeFileSync(join(d1, 'marker.txt'), 'x')
    try {
      const face = createE2eBaselineFace({
        cwd: d2,
        command: process.execPath,
        args: ['-e', "process.stdout.write(String(require('fs').existsSync('marker.txt')))"],
        shell: false,
        timeoutMs: 30_000,
      })
      expect(await face.runSuite(d1)).toBe('true') // 修复前：恒落 deps.cwd（d2）= 'false'
      expect(await face.runSuite(d2)).toBe('false')
    } finally {
      rmSync(d1, { recursive: true, force: true })
      rmSync(d2, { recursive: true, force: true })
    }
  })

  it('timeout 整树回收：孙进程不残留（shell 层 kill 孤儿收口——真机形态）', async () => {
    const innerPidFile = join(dir, 'inner.pid')
    const bootstrap = `require('node:fs').writeFileSync(${JSON.stringify(innerPidFile)},String(process.pid));setInterval(()=>{},1000)`
    const script = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(bootstrap)}],{stdio:'ignore'});setInterval(()=>{},1000)`
    const face = createE2eBaselineFace({
      cwd: dir,
      command: process.execPath,
      args: ['-e', script],
      shell: false,
      timeoutMs: 1_500,
    })
    const r = await runE2eBaseline(face.runSuite, { timeoutMs: 30_000 })
    expect(r.error).toContain('超时')
    // 等孙进程 pid 落盘（spawn 竞态宽限），随后断言其被整树回收
    for (let i = 0; i < 50 && !existsSync(innerPidFile); i++) await new Promise((r2) => setTimeout(r2, 100))
    expect(existsSync(innerPidFile)).toBe(true)
    const innerPid = Number(readFileSync(innerPidFile, 'utf8').trim())
    const alive = (pid: number): boolean => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    // 回收宽限上界 10s——超时仍未回收即孤儿在场（修复前形态）
    let reaped = false
    for (let i = 0; i < 100 && !reaped; i++) {
      reaped = !alive(innerPid)
      if (!reaped) await new Promise((r2) => setTimeout(r2, 100))
    }
    expect(reaped).toBe(true)
  })

  it('readHead：真 git 仓库 → HEAD；非 git 目录 → undefined（键不可得）', async () => {
    execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' })
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'probe@example.invalid'], { stdio: 'pipe' })
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'probe'], { stdio: 'pipe' })
    execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-m', 'base'], { cwd: dir, stdio: 'pipe' })
    const face = createE2eBaselineFace({ cwd: dir })
    const head = await face.readHead(dir)
    expect(head).toMatch(/^[0-9a-f]{40}$/)
    const outside = await face.readHead(join(dir, 'no-such-wt'))
    expect(outside).toBeUndefined()
  })
})

describe('baselineForHead（disc-2 · HEAD 键控基线缓存）', () => {
  it('HEAD 一致：复用缓存（零套件执行——成本约束）', async () => {
    const cache = { commit: 'c1', redSpecs: ['e2e/specs/a.spec.ts'] }
    let runs = 0
    const r = await baselineForHead('c1', cache, async () => {
      runs += 1
      return ''
    })
    expect(runs).toBe(0)
    expect(r).toBe(cache)
  })

  it('commit 落地漂移：重算并更新缓存键（简报不再烤死于循环启动时点）', async () => {
    const cache = { commit: 'c1', redSpecs: ['e2e/specs/old.spec.ts'] }
    const r = await baselineForHead('c2', cache, async () => 'FAIL e2e/specs/new.spec.ts > suite')
    expect(r).toEqual({ commit: 'c2', redSpecs: ['e2e/specs/new.spec.ts'] })
  })

  it('重算故障 fail-soft：空清单 + error 留痕，键仍记当前 HEAD（不阻循环）', async () => {
    const r = await baselineForHead('c2', undefined, async () => {
      throw new Error('boom')
    })
    expect(r).toEqual({ commit: 'c2', redSpecs: [], error: 'boom' })
  })

  it('HEAD 不可得（两侧 undefined）：首算一次后恒复用（无 worktree = 无漂移可判）', async () => {
    let runs = 0
    const first = await baselineForHead(undefined, undefined, async () => {
      runs += 1
      return 'FAIL x.spec.ts'
    })
    const second = await baselineForHead(undefined, first, async () => {
      runs += 1
      return ''
    })
    expect(runs).toBe(1)
    expect(second).toBe(first)
  })
})

describe('attributionTaskInput（三分流归因卡载荷）', () => {
  it('test-run 卡 + 三分流指示 + BASELINE_SPEC var', () => {
    const input = attributionTaskInput({ kind: 'feature', slug: 'feat-x' }, 'e2e/specs/a.spec.ts', { projectId: 'p-1' })
    expect(input).toMatchObject({
      projectId: 'p-1',
      source: { kind: 'feature', slug: 'feat-x' },
      title: 'e2e 基线红灯归因：e2e/specs/a.spec.ts',
      type: 'test-run',
      priority: 'P1',
      vars: { BASELINE_SPEC: 'e2e/specs/a.spec.ts' },
    })
    expect(input.taskDesc).toContain('环境')
    expect(input.taskDesc).toContain('陈旧断言')
    expect(input.taskDesc).toContain('真回归')
    expect(input.taskDesc).toContain('recordBug')
  })
})
