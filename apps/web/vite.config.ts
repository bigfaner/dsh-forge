// vite 构建配置（定位：装配）——官方 apps/web 母本模式同型（双入口：壳页 + 独立第二入口）。
// 产物两件（任务 1.5 AC1）：
//   1. 壳 dist：index.html + assets/*（壳内核 dsh-client-web 静态装配线——平台单例
//      （react/cordis/ui-* 基座）经本构建单实例化，client bundle 经模块表共享同一份）；
//   2. 产品 client 插件 bundle：forge-client.js（classic script 形状：求值即
//      window.__ModuleLoader__.load 注册工厂；经 shell/boot.ts 掌舵入 __DSH_BOOT__ 图）。
// 壳页无独立 serve 面（母本同裁决：bare vite 无 __DSH_BOOT__ 不可用——dev 走 build --watch）。
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

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
      const code = chunk.code
      if (/(?<![.\w$])import\s*[("'\s]|(?<![.\w$])export\s*[{*(\w]/.test(code)) {
        throw new Error('vite: forge-client 产物含 import/export 语句——classic script 形状破坏（模块系统以 <script> 装载）')
      }
      if (!code.includes('__ModuleLoader__')) {
        throw new Error('vite: forge-client 产物未见 __ModuleLoader__ 注册面')
      }
    },
  }
}

export default defineConfig({
  // 相对资产 URL：宿主自定义 scheme 于任意挂载深度服务本 dist，文档相对路由（plugins/…）同源解析
  base: './',
  plugins: [rejectStandaloneServe(), pinClientBundleShape()],
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
