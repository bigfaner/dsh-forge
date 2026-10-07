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
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const level = process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL ?? '5'
process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL = level
console.log(`[dist:win] ELECTRON_BUILDER_COMPRESSION_LEVEL=${level}${level === '5' ? '（默认，防 32 位 7za -mx=9 内存耗尽）' : '（用户覆盖）'}`)

const result = spawnSync('pnpm exec electron-builder --win --config electron-builder.config.mjs', {
  shell: true,
  stdio: 'inherit',
  cwd: ROOT,
  env: process.env,
})
process.exit(result.status ?? 1)
