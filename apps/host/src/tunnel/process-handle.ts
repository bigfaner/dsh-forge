// 子进程 → TunnelProcessHandle 装配（boot/child.ts spawn 缝的真实实现提取——
// 可测面：onLine 行事件流构成）。bug 3c98e297：cloudflared 的 trycloudflare URL 行
// 打在 stderr（实测 stdout 零行）——行事件必须双流合并，单挂 stdout 捕获必超时。
import { createInterface } from 'node:readline'
import type { ChildProcess } from 'node:child_process'
import type { TunnelProcessHandle } from './cloudflared.js'

/** 子进程句柄装配（onLine = stdout + stderr 行事件合并；kill 有界清理） */
export function createChildProcessHandle(child: ChildProcess): TunnelProcessHandle {
  return {
    pid: child.pid,
    onLine: (listener) => {
      // 双流合并：cloudflared URL 行在 stderr、pinggy banner 亦可能跨流——两路都喂
      for (const stream of [child.stdout, child.stderr]) {
        if (stream === null) continue
        void (async () => {
          for await (const line of createInterface({ input: stream })) listener(line)
        })()
      }
    },
    onExit: (listener) => {
      child.once('exit', (code) => listener(code))
    },
    kill: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve()
        child.once('exit', () => resolve())
        child.kill()
      }),
  }
}
