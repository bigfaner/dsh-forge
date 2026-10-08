#!/usr/bin/env node
// `pnpm dist:win` 末端 —— electron-builder NSIS 封包（含 7za 内存坑默认值）。
//
// 内存坑（本机实证）：electron-builder 26.17 对 7z 载荷硬编码 -mx=9
// （app-builder-lib archive.js compute7zCompressArgs：非 zip 一律 "9"，config
// compression:"normal" 不降级），而其自带 7za.exe 为 32 位（7-Zip 24.09 (x86)，
// ~2GB 地址空间）。~870MiB staging + 64MB LZMA 字典 × 多线程 match finder
// → "Can't allocate required memory!"（退出码 8）。
// 官方逃生门 = ELECTRON_BUILDER_COMPRESSION_LEVEL（compute7zCompressArgs 显式
// 读取并校验 0-9）：本脚本默认压到 5（16MB 字典，内存约 1/4；体积差异 <1%），
// 需要极限体积时显式设 9 可覆盖。
//
// 下载镜像（本机实证）：electron-builder 默认从 GitHub Releases 拉 Electron
// 运行时 zip（electron-v44.0.0-win32-x64.zip ~130MB）及自身 binaries（nsis/
// winCodeSign）——直连实测 ETA 65 分钟级。默认改走 npmmirror 镜像（与官方
// zip 字节一致，checksum 校验不受影响）；两个变量均可用环境变量显式覆盖。
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const level = process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ?? '5'
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = level
console.log(`[dist:win] ELECTRON_BUILDER_COMPRESSION_LEVEL=${level}${level === '5' ? '（默认，防 32 位 7za -mx=9 内存耗尽）' : '（用户覆盖）'}`)

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
