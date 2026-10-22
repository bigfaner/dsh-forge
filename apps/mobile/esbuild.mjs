// 构建脚本：src/main.ts → dist/index.html 单文件（JS IIFE + CSS 内联）。
// 默认 run-once（Windows commit 纪律 AD-5：质量门/任务执行一律 run-once）；
// `--watch` 形态仅供 scripts/dev.mjs 受管接线（与 vite/tsc watch 同生命周期，
// dev 退出即杀树——手机静态面 = host 服务本 dist，不接线则手机端迭代恒吃旧 bundle）。
// 零配置外部依赖：构建自身即依赖清单（esbuild devDep 精确 pin，见 package.json）。
import { build, context } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outDir = join(root, 'dist')
const outFile = join(outDir, 'bundle')
const watch = process.argv.includes('--watch')

const options = {
	entryPoints: [join(root, 'src/main.ts')],
	bundle: true,
	format: 'iife',
	target: 'es2022',
	minify: true,
	write: false,
	outdir: outDir,
	entryNames: 'bundle',
	legalComments: 'none',
	logLevel: 'warning'
}

/** 产出内联骨架（单文件产物，静态面 /remote/ 直接服务此 HTML）。 */
function emitHtml(outputFiles) {
	const js = outputFiles.find((f) => f.path === `${outFile}.js`)
	const css = outputFiles.find((f) => f.path === `${outFile}.css`)
	if (!js) throw new Error('esbuild 未产出 bundle.js——构建面异常')
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
		''
	].join('\n')
	writeFileSync(join(outDir, 'index.html'), html, 'utf8')
	return html.length
}

if (watch) {
	rmSync(outDir, { recursive: true, force: true })
	mkdirSync(outDir, { recursive: true })
	const ctx = await context(options)
	const initial = await ctx.rebuild()
	console.log(`[esbuild] dist/index.html 产出（${emitHtml(initial.outputFiles)} bytes，JS+CSS 内联）`)
	await ctx.watch()
	console.log('[esbuild] watch 已挂——src 变更自动重建 dist/index.html（dev 退出即杀树）')
} else {
	rmSync(outDir, { recursive: true, force: true })
	mkdirSync(outDir, { recursive: true })
	const result = await build(options)
	console.log(`[esbuild] dist/index.html 产出（${emitHtml(result.outputFiles)} bytes，JS${result.outputFiles.some((f) => f.path === `${outFile}.css`) ? '+CSS' : ''} 内联）`)
}
