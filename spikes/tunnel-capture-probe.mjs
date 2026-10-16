// 一次性探针（不入库）：双流句柄 + startCloudflaredTunnel 真实捕获验证（bug 3c98e297）
import { startCloudflaredTunnel } from '../apps/host/dist/tunnel/cloudflared.js'
import { createChildProcessHandle } from '../apps/host/dist/tunnel/process-handle.js'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn as nodeSpawn } from 'node:child_process'

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
    const child = nodeSpawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    return createChildProcessHandle(child)
  },
  now: () => Date.now(),
}

const exe = `${tmpdir()}\\dsh-cloudflared\\cloudflared-windows-amd64.exe`
try {
  const t = startCloudflaredTunnel(exe, 43127, deps, 25_000)
  const tunnel = await t
  console.log('捕获成功（产品链）:', tunnel.url, 'pid', tunnel.process.pid)
  await tunnel.process.kill()
  console.log('kill 收口完成')
} catch (e) {
  console.log('捕获失败:', e.message)
}
