// 1.3 单测 —— worker 进程树 Job Object 整树回收（spawn/job-tree.ts）：
// keeper 进程协议（ready/candidate/assigned/assign-failed ←；claim/exclude/terminate →
// 经指令文件队列）经注入桩 launcher 全测（真 keeper = PowerShell P/Invoke，真机端到端
// 取证另行归档）。锁面：①win32 门（非 win32 = 禁用态 no-op，launcher 不触）；②spawn
// 失败 fail-soft（禁用态不抛、reclaim 返回 false）；③指令文件队列投递（claim/exclude/
// terminate 落 *.cmd）；④candidate 仲裁单点互斥（先报者 claim、余者 exclude——嵌套 Job
// 误归属的消解）；⑤reclaim 幂等（terminate 单发）；⑥pid 复位（reclaim 后 keeperPid
// 复位——guard 复位回归断言）。
import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import { createWorkerTreeGuard, ensureKeeperAssembly, hostOwnedPidsSnapshot, noopWorkerTreeGuard, noteHostOwnedChild } from './job-tree.js'
import type { KeeperProcess, WorkerTreeGuardDeps } from './job-tree.js'

/** 测试装配桩（真 PowerShell 编译不触——assembly 注入假路径） */
const ASSEMBLY_STUB = Promise.resolve({ assemblyPath: 'C:\\stub\\jobtree.dll', scriptPath: 'C:\\stub\\keeper.ps1' })

/** 指令队列当前内容（按文件名序拼接——投递顺序断言面） */
function queueContent(queueDir: string): string {
  try {
    return readdirSync(queueDir)
      .sort()
      .map((f) => readFileSync(join(queueDir, f), 'utf8'))
      .join('')
  } catch {
    return ''
  }
}

function deps(p: string, launch: NonNullable<WorkerTreeGuardDeps['keeperLauncher']>): WorkerTreeGuardDeps {
  return { platform: p, keeperLauncher: launch, keeperAssembly: ASSEMBLY_STUB }
}

describe('createWorkerTreeGuard（keeper 协议契约）', () => {
  it('非 win32 = 禁用态：launcher 不触、keeperPid undefined、reclaim no-op false', async () => {
    let calls = 0
    const guard = createWorkerTreeGuard({
      platform: 'linux',
      keeperLauncher: () => {
        calls++
        throw new Error('must not launch')
      },
    })
    await guard.whenReady
    expect(calls).toBe(0)
    expect(guard.keeperPid).toBeUndefined()
    expect(await guard.reclaim()).toBe(false)
  })

  it('noopWorkerTreeGuard：全 no-op（单测/驱动器缺省注入位）', async () => {
    const guard = noopWorkerTreeGuard()
    guard.exclude(1)
    await guard.whenReady
    expect(guard.keeperPid).toBeUndefined()
    expect(await guard.reclaim()).toBe(false)
  })

  it('就绪握手：ready 行 → keeperPid 置位 + whenReady 兑现；launcher 收齐装配参数', async () => {
    let captured: Parameters<NonNullable<WorkerTreeGuardDeps['keeperLauncher']>>[0] | undefined
    const guard = createWorkerTreeGuard(
      deps('win32', (args) => {
        captured = args
        const stdout = new EventEmitter()
        queueMicrotask(() => stdout.emit('data', `ready 4242\n`))
        return { pid: 4242, stdout: stdout as unknown as Readable, exited: new Promise<void>(() => {}) } satisfies KeeperProcess
      }),
    )
    expect(guard.keeperPid).toBeUndefined()
    await guard.whenReady
    expect(guard.keeperPid).toBe(4242)
    expect(captured).toBeDefined()
    expect(captured!.hostPid).toBeTypeOf('number')
    expect(captured!.pollMs).toBeGreaterThan(0)
    expect(captured!.assemblyPath).toContain('jobtree.dll')
    expect(captured!.scriptPath).toContain('keeper.ps1')
    expect(captured!.queueDir).toContain('queue-')
  })

  it('指令队列：exclude 在就绪后投递（claim/exclude 落 *.cmd 文件）', async () => {
    let queueDir: string | undefined
    const guard = createWorkerTreeGuard(
      deps('win32', (args) => {
        queueDir = args.queueDir
        const stdout = new EventEmitter()
        queueMicrotask(() => stdout.emit('data', `ready 4242\n`))
        return { pid: 4242, stdout: stdout as unknown as Readable, exited: new Promise<void>(() => {}) } satisfies KeeperProcess
      }),
    )
    guard.exclude(11)
    guard.exclude(22)
    await guard.whenReady
    const content = queueContent(queueDir!)
    expect(content).toContain('exclude 11')
    expect(content).toContain('exclude 22')
    rmSync(queueDir!, { recursive: true, force: true })
  })

  it('candidate 仲裁：先报者 claim、余者 exclude（双 guard 互斥单点归属）', async () => {
    const dirs: string[] = []
    const stdoutPipes: EventEmitter[] = []
    const launcher: WorkerTreeGuardDeps['keeperLauncher'] = (args) => {
      dirs.push(args.queueDir)
      const stdout = new EventEmitter()
      stdoutPipes.push(stdout)
      queueMicrotask(() => stdout.emit('data', 'ready 4242\n'))
      return { pid: 4242, stdout: stdout as unknown as Readable, exited: new Promise<void>(() => {}) } satisfies KeeperProcess
    }
    const guard1 = createWorkerTreeGuard(deps('win32', launcher))
    const guard2 = createWorkerTreeGuard(deps('win32', launcher))
    await Promise.all([guard1.whenReady, guard2.whenReady])
    stdoutPipes[0]!.emit('data', 'candidate 777\n')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(queueContent(dirs[0]!)).toContain('claim 777')
    expect(queueContent(dirs[1]!)).toContain('exclude 777')
    // 后报者（已 exclude）不再 claim——嵌套 Job 误归属消解
    stdoutPipes[1]!.emit('data', 'candidate 777\n')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(queueContent(dirs[1]!)).not.toContain('claim 777')
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('仲裁第二例：guard2 先报 → claim 落 guard2、exclude 落 guard1（非 guard1 固定优先）', async () => {
    const dirs: string[] = []
    const stdoutPipes: EventEmitter[] = []
    const launcher: WorkerTreeGuardDeps['keeperLauncher'] = (args) => {
      dirs.push(args.queueDir)
      const stdout = new EventEmitter()
      stdoutPipes.push(stdout)
      queueMicrotask(() => stdout.emit('data', 'ready 4242\n'))
      return { pid: 4242, stdout: stdout as unknown as Readable, exited: new Promise<void>(() => {}) } satisfies KeeperProcess
    }
    const guard1 = createWorkerTreeGuard(deps('win32', launcher))
    const guard2 = createWorkerTreeGuard(deps('win32', launcher))
    await Promise.all([guard1.whenReady, guard2.whenReady])
    stdoutPipes[1]!.emit('data', 'candidate 888\n')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(queueContent(dirs[1]!)).toContain('claim 888')
    expect(queueContent(dirs[0]!)).toContain('exclude 888')
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  it('assigned/assign-failed 行不产生指令投递（单知会语义）', async () => {
    let queueDir: string | undefined
    const guard = createWorkerTreeGuard(
      deps('win32', (args) => {
        queueDir = args.queueDir
        const stdout = new EventEmitter()
        queueMicrotask(() => stdout.emit('data', 'ready 4242\n'))
        return { pid: 4242, stdout: stdout as unknown as Readable, exited: new Promise<void>(() => {}) } satisfies KeeperProcess
      }),
    )
    await guard.whenReady
    await new Promise((resolve) => setTimeout(resolve, 0))
    const before = queueContent(queueDir!)
    const stdout = (guard as unknown as { keeper?: { stdout: EventEmitter } }).keeper!.stdout
    stdout.emit('data', 'assigned 900\n')
    stdout.emit('data', 'assign-failed 901\n')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(queueContent(queueDir!)).toBe(before)
  })

  it('reclaim：terminate 单发 + 幂等 + keeperPid 复位 + 队列回收（guard 复位回归断言）', async () => {
    let queueDir: string | undefined
    let finishKeeper!: () => void
    const guard = createWorkerTreeGuard(
      deps('win32', (args) => {
        queueDir = args.queueDir
        const stdout = new EventEmitter()
        queueMicrotask(() => stdout.emit('data', 'ready 4242\n'))
        return {
          pid: 4242,
          stdout: stdout as unknown as Readable,
          exited: new Promise<void>((resolve) => {
            finishKeeper = resolve
          }),
        } satisfies KeeperProcess
      }),
    )
    await guard.whenReady
    const first = guard.reclaim()
    const queued = queueContent(queueDir!)
    expect(queued).toContain('terminate')
    finishKeeper()
    expect(await first).toBe(true)
    expect(guard.keeperPid).toBeUndefined()
    expect(await guard.reclaim()).toBe(true) // 幂等：二次 no-op
    expect(queued.split('terminate').length - 1).toBe(1)
    rmSync(queueDir!, { recursive: true, force: true })
  })

  it('spawn 失败 = fail-soft 禁用态：不抛、reclaim false、后续 exclude no-op', async () => {
    const guard = createWorkerTreeGuard(
      deps('win32', () => {
        throw new Error('PowerShell missing')
      }),
    )
    await guard.whenReady
    guard.exclude(5)
    expect(guard.keeperPid).toBeUndefined()
    expect(await guard.reclaim()).toBe(false)
  })

  it('keeper 未就绪先亡 = 禁用态（脚本异常/PowerShell 缺席形态）', async () => {
    let finish!: () => void
    const guard = createWorkerTreeGuard(
      deps('win32', () => ({
        pid: 4242,
        stdout: new EventEmitter() as unknown as Readable,
        exited: new Promise<void>((resolve) => {
          finish = resolve
        }),
      })),
    )
    await new Promise((resolve) => setTimeout(resolve, 0)) // bootstrap 微任务先行——keeper 桩已 spawn
    finish()
    await guard.whenReady
    expect(guard.keeperPid).toBeUndefined()
    expect(await guard.reclaim()).toBe(false)
  })
})

describe('R2-minor②（hostOwned 出生路径补全）', () => {
  it('Add-Type 编译子进程出生即登记 hostOwned（在世 keeper 不收编——修复声称保护却未登记的缺口）', async () => {
    const fake = new EventEmitter() as unknown as ChildProcess
    Object.defineProperty(fake, 'pid', { value: 777 })
    const compiling = ensureKeeperAssembly({
      forceCompile: true, // 真机 Dll 缓存在场也强制走编译分支——出生路径登记断言不依赖缓存缺席
      spawnCompile: (() => fake) as unknown as typeof import('node:child_process').spawn,
    })
    expect(hostOwnedPidsSnapshot()).toContain(777) // spawn 同步返回后登记即在
    fake.emit('exit')
    await expect(compiling).rejects.toThrow('编译失败') // 桩退出码非 0——缓存终态消化，零 unhandled rejection
    expect(hostOwnedPidsSnapshot()).not.toContain(777) // 退出解除（pid 复用零误伤）
  })

  it('readHead git 子进程出生即登记（e2e-baseline 面——同口径断言，见 e2e-baseline.test.ts）', () => {
    // 装配面属 e2e-baseline.test.ts 真子进程断言——此处仅 pin 观察缝导出在位
    expect(typeof hostOwnedPidsSnapshot).toBe('function')
  })
})

describe('R2-major②③（bug 458fa355）：互认竞态 / 宿主子进程收编 / 失能可观测 / 兜底独立 enabled', () => {
  const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

  it('互认竞态：新 keeper spawn 后 ready 前，旧 keeper 报其 pid 为 candidate 不收编、旧 reclaim 不波及新 keeper', async () => {
    const dirs: string[] = []
    const pipes: EventEmitter[] = []
    const launcher: WorkerTreeGuardDeps['keeperLauncher'] = (args) => {
      dirs.push(args.queueDir)
      const stdout = new EventEmitter()
      pipes.push(stdout)
      if (pipes.length === 1) queueMicrotask(() => stdout.emit('data', 'ready 4242\n'))
      // 第二个 keeper：pid 已定（5151）但 ready 行不发——宿主处理 ready 前的互认竞态窗口
      return { pid: pipes.length === 1 ? 4242 : 5151, stdout: stdout as unknown as Readable, exited: new Promise<void>(() => {}) } satisfies KeeperProcess
    }
    const guard1 = createWorkerTreeGuard(deps('win32', launcher))
    createWorkerTreeGuard(deps('win32', launcher)) // guard2：keeper pid=5151（ready 不发）
    await guard1.whenReady
    pipes[0]!.emit('data', 'candidate 5151\n')
    await tick()
    expect(queueContent(dirs[0]!)).not.toContain('claim 5151')
    expect(queueContent(dirs[0]!)).toContain('exclude 5151')
    void guard1.reclaim()
    await tick()
    expect(queueContent(dirs[1]!)).not.toContain('terminate') // 旧守卫回收零波及新 keeper
  })

  it('宿主自有 exec 子进程：登记后 candidate 零收编（exclude 落队）；exit 后登记解除恢复可收编', async () => {
    const fake = new EventEmitter() as unknown as ChildProcess
    Object.defineProperty(fake, 'pid', { value: 999 })
    noteHostOwnedChild(fake)
    let queueDir: string | undefined
    const guard = createWorkerTreeGuard(
      deps('win32', (args) => {
        queueDir = args.queueDir
        const stdout = new EventEmitter()
        queueMicrotask(() => stdout.emit('data', 'ready 4242\n'))
        return { pid: 4242, stdout: stdout as unknown as Readable, exited: new Promise<void>(() => {}) } satisfies KeeperProcess
      }),
    )
    await guard.whenReady
    const stdout = (guard as unknown as { keeper?: { stdout: EventEmitter } }).keeper!.stdout
    stdout.emit('data', 'candidate 999\n')
    await tick()
    expect(queueContent(queueDir!)).not.toContain('claim 999')
    expect(queueContent(queueDir!)).toContain('exclude 999')
    fake.emit('exit') // 进程退出——登记解除（pid 复用零误伤）
    stdout.emit('data', 'candidate 999\n')
    await tick()
    expect(queueContent(queueDir!)).toContain('claim 999')
    rmSync(queueDir!, { recursive: true, force: true })
  })

  it('失能可观测：launcher 装配失败 → console.error 无条件告警（非 DEBUG 门控）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const guard = createWorkerTreeGuard(
        deps('win32', () => {
          throw new Error('PowerShell missing')
        }),
      )
      await guard.whenReady
      expect(guard.keeperPid).toBeUndefined()
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes('[job-tree]'))).toBe(true)
    } finally {
      errSpy.mockRestore()
    }
  })

  it('reclaim 兜底独立于 enabled：队列写失败禁用后 reclaim 仍投递 terminate 并返回 true', async () => {
    let queueDir: string | undefined
    let finishKeeper!: () => void
    const guard = createWorkerTreeGuard(
      deps('win32', (args) => {
        queueDir = args.queueDir
        const stdout = new EventEmitter()
        queueMicrotask(() => stdout.emit('data', 'ready 4242\n'))
        return {
          pid: 4242,
          stdout: stdout as unknown as Readable,
          exited: new Promise<void>((resolve) => {
            finishKeeper = resolve
          }),
        } satisfies KeeperProcess
      }),
    )
    await guard.whenReady
    // 破坏队列：目录改放同名文件 → send 写失败 → enabled=false（失能路径）
    rmSync(queueDir!, { recursive: true, force: true })
    writeFileSync(queueDir!, 'x', 'utf8')
    guard.exclude(5)
    await tick()
    // 恢复目录使 terminate 可达——reclaim 不得被 enabled 判定拦截
    rmSync(queueDir!, { force: true })
    mkdirSync(queueDir!, { recursive: true })
    const reclaiming = guard.reclaim()
    const queued = queueContent(queueDir!) // reclaim 完成段会清队列目录——投递面在返回前断言
    expect(queued).toContain('terminate')
    finishKeeper()
    expect(await reclaiming).toBe(true)
    rmSync(queueDir!, { recursive: true, force: true })
  })
})
