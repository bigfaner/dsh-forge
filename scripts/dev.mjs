#!/usr/bin/env node
// `pnpm dev` —— 并行：apps/web `vite build --watch`（壳非独立应用——母本裁决：bare vite serve
// 无 __DSH_BOOT__ 注入；宿主载 build dist，1.5 起 watch 迭代）+ `tsc -b --watch`（全拓扑）
// + electron（指 dev profile：DSH_FORGE_DEV_PROFILE=dev，开发 profile 直链
// workspace 构建产物，免整包组装——1.4 接线消费该环境变量）。
// electron 面守卫：apps/host/dist/main.js 就绪后才拉起（1.4 落地宿主前仅跑前两者）。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const procs = []
let shuttingDown = false // 主动收尾标记:级联终止触发的子退出不算异常

/**
 * 级联终止一棵 watcher 树。spawn({ shell: true }) 的直接子进程是 cmd.exe 壳——
 * p.kill() 只杀壳，真正的 node 孙进程（vite/tsc/electron）全部孤儿化（Windows 内核
 * 无父子生命周期绑定；2026-10-06 内存事故根因：跨天孤儿 watcher 各滚至 GB 级提交
 * 内存）。治本 = Windows taskkill /T 整树强杀；POSIX 同进程组信号可达，退回 p.kill()。
 */
function killTree(child) {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' })
      return
    } catch {
      /* taskkill 不可用（极端精简环境）——退回单点杀 */
    }
  }
  try {
    child.kill()
  } catch {
    /* 已退出 */
  }
}

function start(name, cmd, env = {}) {
  const p = spawn(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, ...env },
  })
  procs.push([name, p])
  p.on('exit', (code) => {
    if (shuttingDown) return // 主动收尾的级联终止，不算异常退出
    if (code) console.error(`[dev] ${name} exited (${code})`)
  })
  console.log(`[dev] ${name}: ${cmd}`)
  return p
}

start('vite', 'pnpm -C apps/web watch')
start('tsc', 'pnpm exec tsc -b --watch')

const HOST_MAIN = join(ROOT, 'apps/host/dist/main.js')
const ELECTRON_PATH_TXT = join(ROOT, 'apps/host/node_modules/electron/path.txt')
setTimeout(() => {
  if (!existsSync(HOST_MAIN)) {
    console.warn(
      '[dev] apps/host/dist/main.js 未就绪——electron 未启动（1.4 落地宿主装配后自动拉起；当前仅 vite + tsc watch）。',
    )
    return
  }
  if (!existsSync(ELECTRON_PATH_TXT)) {
    // S1/memory 实测：pnpm 11 不执行 electron 安装脚本——二进制须手动补齐（1.4 前执行一次）
    console.warn(
      '[dev] electron 二进制未安装——先执行：ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ node apps/host/node_modules/electron/install.js（spike S1 记录；当前仅 vite + tsc watch）。',
    )
    return
  }
  start('electron', 'pnpm -C apps/host exec electron .', { DSH_FORGE_DEV_PROFILE: 'dev' })
}, 2500)

function bye() {
  if (shuttingDown) return
  shuttingDown = true
  for (const [, p] of procs) killTree(p)
  process.exit(0)
}
process.on('SIGINT', bye)
process.on('SIGTERM', bye)
process.on('SIGBREAK', bye)
