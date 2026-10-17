// run-once 构建脚本：src/main.ts → dist/index.html 单文件（JS IIFE + CSS 内联）。
// Windows commit 纪律（AD-5）：一律 run-once，禁 --watch 形态。
// 零配置外部依赖：构建自身即依赖清单（esbuild devDep 精确 pin，见 package.json）。
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outDir = join(root, 'dist')
const outFile = join(outDir, 'bundle')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const result = await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: true,
  write: false,
  outdir: outDir,
  entryNames: 'bundle',
  legalComments: 'none',
  logLevel: 'warning',
})

const js = result.outputFiles.find((f) => f.path === `${outFile}.js`)
const css = result.outputFiles.find((f) => f.path === `${outFile}.css`)
if (!js) throw new Error('esbuild 未产出 bundle.js——构建面异常')

// 内联骨架：单文件产物，静态面（/remote/）直接服务此 HTML。
const html = [
  '<!doctype html>',
  '<html lang="zh-CN">',
  '<head>',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  '<title>dsh-forge mobile</title>',
  css ? `<style>${css.text}</style>` : '',
  '</head>',
  '<body>',
  '<div id="app"></div>',
  `<script>${js.text}</script>`,
  '</body>',
  '</html>',
  '',
].join('\n')

writeFileSync(join(outDir, 'index.html'), html, 'utf8')
console.log(`[esbuild] dist/index.html 产出（${html.length} bytes，JS${css ? '+CSS' : ''} 内联）`)
