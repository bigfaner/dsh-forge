// 一次性探针（不入库）：验证种子收编链在真实 node 环境的表现
import { officialCloudflaredSeedCandidates } from '../apps/host/dist/boot/child.js'
import { ensureCloudflaredBinary } from '../apps/host/dist/tunnel/cloudflared.js'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'

const seeds = officialCloudflaredSeedCandidates()
console.log('APPDATA =', process.env['APPDATA'])
console.log('seeds =', JSON.stringify(seeds))
console.log('seed exists =', seeds.map((s) => existsSync(s)))

const deps = {
  fetch: async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
  sha256: (d) => createHash('sha256').update(d).digest('hex'),
  fs: {
    exists: (p) => existsSync(p),
    readFile: (p) => readFile(p),
    writeFile: (p, d) => writeFile(p, d),
    mkdir: (p) => mkdir(p, { recursive: true }),
    chmod: (p, m) => chmod(p, m),
  },
  tmpDir: () => tmpdir(),
  spawn: (command, args) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    return {
      pid: child.pid,
      onLine: (l) => {
        void (async () => {
          for await (const line of createInterface({ input: child.stdout })) l(line)
        })()
      },
      onExit: (l) => child.once('exit', (c) => l(c)),
      kill: () => new Promise((r) => (child.exitCode !== null ? r() : (child.once('exit', () => r()), child.kill()))),
    }
  },
  now: () => Date.now(),
}

try {
  const t0 = Date.now()
  const path = await ensureCloudflaredBinary(deps, 'win32', 'x64', seeds)
  console.log(`就位成功（${Date.now() - t0}ms）: ${path}`)
  console.log('缓存目录内容:')
  console.log(spawnSync('cmd', ['/c', 'dir /b', `${tmpdir()}\\dsh-cloudflared`]).stdout.toString())
} catch (e) {
  console.log('就位失败:', e.message)
}
