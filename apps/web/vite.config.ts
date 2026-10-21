// vite 构建配置（定位：装配）——官方 apps/web 母本模式同型（双入口：壳页 + 独立第二入口）。
// 产物两件（任务 1.5 AC1）：
//   1. 壳 dist：index.html + assets/*（壳内核 dsh-client-web 静态装配线——平台单例
//      （react/cordis/ui-* 基座）经本构建单实例化，client bundle 经模块表共享同一份）；
//   2. 产品 client 插件 bundle：forge-client.js（classic script 形状：求值即
//      window.__ModuleLoader__.load 注册工厂；经 shell/boot.ts 掌舵入 __DSH_BOOT__ 图）。
// 壳页无独立 serve 面（母本同裁决：bare vite 无 __DSH_BOOT__ 不可用——dev 走 build --watch）。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { assertClientBundleClassicScript } from './src/build/client-bundle-shape.js'
import { assertInputHistorySteeringLine } from './src/build/input-history-manifest.js'

const src = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url))
const STANDALONE_ERROR = 'apps/web 不是独立应用：bare vite serve 无 __DSH_BOOT__ 注入。'
  + '宿主载入 = apps/host 自定义 scheme 服务本 dist（build 产物）；开发迭代用 pnpm -C apps/web watch（build --watch）。'

/** 内容修订戳（掌舵入图 rev / bundle URL 缓存戳；可经 DSH_FORGE_BUILD_REV 显式指定）。 */
const BUILD_REV = process.env.DSH_FORGE_BUILD_REV ?? `b${Date.now().toString(36)}`

/** 拒绝 standalone serve（母本 rejectStandaloneServe 同语义——serve 面必经宿主）。 */
function rejectStandaloneServe(): Plugin {
  return {
    name: 'dsh-forge-reject-standalone-web-serve',
    config(_config, env) {
      if (env.command === 'serve') throw new Error(STANDALONE_ERROR)
    },
  }
}

/** 产品 client 插件形状 pin：classic script（零 import/export 语句）且注册面在场。 */
function pinClientBundleShape(): Plugin {
  return {
    name: 'dsh-forge-pin-client-bundle-shape',
    generateBundle(_options, bundle) {
      const chunk = Object.values(bundle).find((file) => file.type === 'chunk' && file.name === 'client-plugin')
      if (chunk === undefined) throw new Error('vite: forge-client 入口产物缺席（rollup input client-plugin 未产出）')
      assertClientBundleClassicScript(chunk.code)
    },
  }
}

/** input-history 插件 bundle 在壳 dist 的落位名（掌舵 url 文档相对引用同名）。 */
export const INPUT_HISTORY_BUNDLE_FILE = 'input-history-client.js'

/**
 * input-history 插件 bundle 发射（构建期原样复制 @dsh-forge/input-history dist/client.js
 * 入壳 dist 根——该产物已按官方 clientBundle 配方自注册（classic script），壳只运输，
 * 掌舵行由 shell/boot.ts 追加；缺构建产物 = fail-loud 指路先 build 插件包）。
 */
function emitInputHistoryBundle(): Plugin {
  return {
    name: 'dsh-forge-emit-input-history-bundle',
    generateBundle() {
      const req = createRequire(import.meta.url)
      // 经 exports["./client"] 正门解析产物路径（包 exports 未暴露 ./package.json）
      const bundlePath = req.resolve('@dsh-forge/input-history/client')
      let source: string
      try {
        source = readFileSync(bundlePath, 'utf8')
      } catch {
        throw new Error(`vite: @dsh-forge/input-history client bundle 缺席（${bundlePath}）——先 pnpm -C packages/plugins/input-history build`)
      }
      if (!source.includes('window.__ModuleLoader__.load') || !source.includes('"@dsh-forge/input-history"')) {
        throw new Error(`vite: @dsh-forge/input-history client bundle 非官方自注册形状（${bundlePath}）`)
      }
      this.emitFile({ type: 'asset', fileName: INPUT_HISTORY_BUNDLE_FILE, source })
    },
  }
}

/**
 * input-history 装载双真相源断言（构建期 fail-loud）：main.ts 掌舵行的
 * id/inject 字面量与 @dsh-forge/input-history package.json dsh.client 清单
 * 是同一契约的两处表达——漂移即构建失败，不靠人工同步。
 */
function assertInputHistoryManifest(): Plugin {
  return {
    name: 'dsh-forge-assert-input-history-manifest',
    generateBundle() {
      const req = createRequire(import.meta.url)
      const clientEntry = req.resolve('@dsh-forge/input-history/client')
      const pkgPath = resolve(dirname(clientEntry), '../package.json')
      let manifest: { name: string; inject: readonly string[] }
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          name?: string
          dsh?: { client?: { inject?: string[] } }
        }
        manifest = { name: pkg.name ?? '', inject: pkg.dsh?.client?.inject ?? [] }
      } catch (error) {
        throw new Error(`vite: 读 @dsh-forge/input-history package.json 失败（${pkgPath}）: ${String(error)}`)
      }
      assertInputHistorySteeringLine(readFileSync(src('./src/main.ts'), 'utf8'), manifest)
    },
  }
}

export default defineConfig({
  // 相对资产 URL：宿主自定义 scheme 于任意挂载深度服务本 dist，文档相对路由（plugins/…）同源解析
  base: './',
  plugins: [rejectStandaloneServe(), pinClientBundleShape(), assertInputHistoryManifest(), emitInputHistoryBundle()],
  define: {
    __DSH_FORGE_BUILD_REV__: JSON.stringify(BUILD_REV),
    // 已发布 cordis-plugin-loader 的 Node 探测替身（母本同款 define 集）
    'process.versions.node': '"0.0.0"',
    'process.execArgv': '[]',
    'process.env.CORDIS_SHARED': 'undefined',
  },
  resolve: {
    // 平台单例唯一实例（母本 dedupe 语义：防第二份 react 撕裂 hook/元素同一性）
    dedupe: ['react', 'react-dom'],
    alias: [{ find: /^node:module$/, replacement: src('./src/node-module-stub.ts') }],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        index: src('./index.html'),
        // 独立入口（非 html script）：壳页不引用，产物即 client 插件 bundle（母本 bootstrap 入口同型）
        'client-plugin': src('./src/client-plugin/index.ts'),
      },
      output: {
        entryFileNames(chunk) {
          return chunk.name === 'client-plugin' ? 'forge-client.js' : 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
