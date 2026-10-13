// 就绪门单测（跑批就绪硬门——proposal worker-exec-evidence-replay SC2）：
// 判据覆盖 journey 实际前置——构建产物形态 + 环境进程存活（pidfile）+ 端口/锁残留；
// 未过即 fail-fast（报告失败项，gate 抛错）。纯 Node 面（不启 Electron）。
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPortAllocator } from './ports.js'
import {
  readinessGate,
  runReadiness,
  type ReadinessOptions,
} from './readiness.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const TMP = join(ROOT, 'e2e', 'test-results', 'readiness-test')

let holder: ReturnType<typeof createServer> | undefined

function writePidFile(dir: string, pid: number): string {
  mkdirSync(dir, { recursive: true })
  const p = join(dir, 'web.pid')
  writeFileSync(p, `${pid}\n`)
  return p
}

async function opts(patch: Partial<ReadinessOptions> = {}): Promise<ReadinessOptions> {
  return {
    root: TMP,
    pidFile: join(TMP, 'absent.pid'),
    requiredArtifacts: [],
    ports: [],
    electronCheck: false,
    ...patch,
  }
}

beforeAll(() => {
  mkdirSync(join(TMP, 'apps', 'host', 'dist'), { recursive: true })
  mkdirSync(join(TMP, 'apps', 'web', 'dist'), { recursive: true })
  writeFileSync(join(TMP, 'apps', 'host', 'dist', 'main.js'), '// host main\n')
  writeFileSync(join(TMP, 'apps', 'web', 'dist', 'index.html'), '<!doctype html>')
})

afterEach(() => {
  if (holder !== undefined) {
    holder.close()
    holder = undefined
  }
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('runReadiness：构建产物形态', () => {
  it('产物齐备且非空 → ok', async () => {
    const report = await runReadiness(
      await opts({
        requiredArtifacts: [
          { label: 'host-main', path: join(TMP, 'apps', 'host', 'dist', 'main.js'), minBytes: 1 },
          { label: 'web-index', path: join(TMP, 'apps', 'web', 'dist', 'index.html'), minBytes: 1 },
        ],
      }),
    )
    expect(report.ok).toBe(true)
  })

  it('产物缺失 → fail-fast 列出缺失项', async () => {
    const report = await runReadiness(
      await opts({
        requiredArtifacts: [
          { label: 'host-main', path: join(TMP, 'apps', 'host', 'dist', 'missing.js'), minBytes: 1 },
        ],
      }),
    )
    expect(report.ok).toBe(false)
    expect(report.failed.map((c) => c.name)).toEqual(['artifact host-main'])
  })

  it('产物空壳（0 字节）→ 形态不合格', async () => {
    const empty = join(TMP, 'apps', 'host', 'dist', 'empty.js')
    writeFileSync(empty, '')
    const report = await runReadiness(
      await opts({ requiredArtifacts: [{ label: 'host-main', path: empty, minBytes: 1 }] }),
    )
    expect(report.ok).toBe(false)
  })
})

describe('runReadiness：环境进程存活（pidfile 锁）', () => {
  it('pidfile 在场且进程存活 → ok', async () => {
    const pidFile = writePidFile(TMP, process.pid)
    const report = await runReadiness(await opts({ pidFile }))
    expect(report.ok).toBe(true)
  })

  it('pidfile 在场但进程已死（锁残留）→ fail', async () => {
    // 真实 dead pid：spawn 一个立即退出的子进程，等它退出后其 pid 必不存在
    const child = spawn(process.execPath, ['-e', ''])
    await new Promise<void>((resolve) => child.once('exit', () => resolve()))
    const report = await runReadiness(await opts({ pidFile: writePidFile(TMP, child.pid ?? 0) }))
    expect(report.ok).toBe(false)
    expect(report.failed[0]?.detail).toContain('锁残留')
  })

  it('pidfile 缺席且 requireDevProcess=false（独立跑批形态）→ 不判失败', async () => {
    const report = await runReadiness(await opts({}))
    expect(report.ok).toBe(true)
  })

  it('pidfile 缺席且 requireDevProcess=true → fail（环境进程未起）', async () => {
    const report = await runReadiness(await opts({ requireDevProcess: true }))
    expect(report.ok).toBe(false)
    expect(report.failed[0]?.name).toBe('dev-process')
  })
})

describe('runReadiness：端口残留', () => {
  it('空口 → ok', async () => {
    const port = createPortAllocator(process.pid).next()
    const report = await runReadiness(await opts({ ports: [port] }))
    expect(report.ok).toBe(true)
  })

  it('端口被占（残留）→ fail-fast 指明端口', async () => {
    const port = createPortAllocator(process.pid).next()
    holder = createServer()
    await new Promise<void>((resolve) => holder!.listen(port, '127.0.0.1', resolve))
    const report = await runReadiness(await opts({ ports: [port] }))
    expect(report.ok).toBe(false)
    expect(report.failed[0]?.name).toBe(`port ${port}`)
    expect(report.failed[0]?.detail).toContain('残留')
  })
})

describe('readinessGate：fail-fast 门', () => {
  it('全过 → 静默返回', async () => {
    await expect(readinessGate(await opts({}))).resolves.toBeUndefined()
  })

  it('任一未过 → 抛错且报文含失败项', async () => {
    await expect(
      readinessGate(
        await opts({
          requiredArtifacts: [
            { label: 'host-main', path: join(TMP, 'nope.js'), minBytes: 1 },
          ],
        }),
      ),
    ).rejects.toThrow(/就绪门/)
  })
})

describe('载体无关：CLI 探针（node --experimental-strip-types）', () => {
  it('以当前仓库根实跑，dist 缺席时 exit≠0 且报错明确（探针可独立于任何编排器执行）', () => {
    if (!existsSync(join(ROOT, 'apps', 'host', 'dist', 'main.js'))) {
      // 未构建环境本身就是"人为破坏前置"形态——exit≠0 即为证据
      const r = spawnSync(
        process.execPath,
        ['--experimental-strip-types', join(ROOT, 'e2e', 'support', 'readiness.ts')],
        { cwd: ROOT, encoding: 'utf8', timeout: 60_000 },
      )
      expect(r.status).not.toBe(0)
      expect(String(r.stderr) + String(r.stdout)).toContain('就绪门')
      return
    }
    const r = spawnSync(
      process.execPath,
      ['--experimental-strip-types', join(ROOT, 'e2e', 'support', 'readiness.ts'), '--no-dev-process'],
      { cwd: ROOT, encoding: 'utf8', timeout: 60_000 },
    )
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})
