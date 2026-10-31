#!/usr/bin/env node
// `pnpm dist:win` 末端 —— electron-builder NSIS 封包。
//
// 压缩档位：7z 载荷实际档位 = ELECTRON_BUILDER_COMPRESSION_LEVEL（compute7zCompressArgs
// env 分支，优先级高于 config compression 字段）。默认 1 = 速度优先（实测：mx=1 总耗时
// 1.5min/296MB，mx=5 3.2min/233MB）。覆盖方式二选一：
//   pnpm run dist:win 5              （位置参数，1-9 单数字）
//   ELECTRON_BUILDER_COMPRESSION_LEVEL=9 pnpm dist:win（环境变量）
// 本机实证（Defender 排除开发链路后）：mx=1 94s/296MB，mx=5 192s/233MB，其余段 67s 恒定。
//
// 下载镜像（本机实证）：electron-builder 默认从 GitHub Releases 拉 Electron
// 运行时 zip（electron-v44.0.0-win32-x64.zip ~130MB）及自身 binaries（nsis/
// winCodeSign）——直连实测 ETA 65 分钟级。默认改走 npmmirror 镜像（与官方
// zip 字节一致，checksum 校验不受影响）；两个变量均可用环境变量显式覆盖。
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// 位置参数（单数字 1-9）> ELECTRON_BUILDER_COMPRESSION_LEVEL env > 默认 1
// 用法：pnpm run dist:win 5
const posArg = process.argv.slice(2).find(a => /^[1-9]$/.test(a))

if (posArg != null) {
  process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = posArg
  console.log(`[dist:win] ELECTRON_BUILDER_COMPRESSION_LEVEL=${posArg}（位置参数覆盖）`)
} else if (process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL == null) {
  process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = '1'
  console.log('[dist:win] ELECTRON_BUILDER_COMPRESSION_LEVEL=1（默认，速度优先）')
} else {
  console.log(`[dist:win] ELECTRON_BUILDER_COMPRESSION_LEVEL=${process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL}（env 覆盖）`)
}

process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/'
process.env.ELECTRON_BUILDER_BINARIES_MIRROR ??= 'https://npmmirror.com/mirrors/electron-builder-binaries/'
console.log(`[dist:win] ELECTRON_MIRROR=${process.env.ELECTRON_MIRROR}（默认 npmmirror，GitHub 直连过慢；可用环境变量覆盖）`)

const result = spawnSync('pnpm exec electron-builder --win --config electron-builder.config.mjs', {
  shell: true,
  stdio: 'inherit',
  cwd: ROOT,
  env: process.env,
})
process.exit(result.status ?? 1)
