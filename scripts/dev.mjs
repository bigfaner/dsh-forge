#!/usr/bin/env node
// `pnpm dev` —— 并行：vite dev server（apps/web）+ `tsc -b --watch`（全拓扑）
// + electron（指 dev profile：DSH_FORGE_DEV_PROFILE=dev，开发 profile 直链
// workspace 构建产物，免整包组装——1.4 接线消费该环境变量）。
// electron 面守卫：apps/host/dist/main.js 就绪后才拉起（1.4 落地宿主前仅跑前两者）。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const procs = []

function start(name, cmd, env = {}) {
  const p = spawn(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, ...env },
  })
  procs.push([name, p])
  p.on('exit', (code) => {
    if (code) console.error(`[dev] ${name} exited (${code})`)
  })
  console.log(`[dev] ${name}: ${cmd}`)
}

start('vite', 'pnpm -C apps/web dev')
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
  for (const [, p] of procs) {
    try {
      p.kill()
    } catch {
      /* 已退出 */
    }
  }
  process.exit(0)
}
process.on('SIGINT', bye)
process.on('SIGTERM', bye)
