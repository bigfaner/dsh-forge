// 1.3 单测 —— worker 进程树 Job Object 整树回收（spawn/job-tree.ts）：
// keeper 进程协议（ready/candidate/assigned/assign-failed ←；claim/exclude/terminate →
// 经指令文件队列）经注入桩 launcher 全测（真 keeper = PowerShell P/Invoke，真机端到端
// 取证另行归档）。锁面：①win32 门（非 win32 = 禁用态 no-op，launcher 不触）；②spawn
// 失败 fail-soft（禁用态不抛、reclaim 返回 false）；③指令文件队列投递（claim/exclude/
// terminate 落 *.cmd）；④candidate 仲裁单点互斥（先报者 claim、余者 exclude——嵌套 Job
// 误归属的消解）；⑤reclaim 幂等（terminate 单发）；⑥pid 复位（reclaim 后 keeperPid
// 复位——guard 复位回归断言）。
import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { createWorkerTreeGuard, noopWorkerTreeGuard } from './job-tree.js'
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
