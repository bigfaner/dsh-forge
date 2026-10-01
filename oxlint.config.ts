import { defineConfig } from 'oxlint'

/**
 * G0 静态门 —— 依赖铁律（三条，no-restricted-imports 编码）。
 * 权威来源：tech-design「Monorepo 工程规范与协作机制」（基础/业务二分三条依赖铁律）。
 *
 * 分工（均在根 `pnpm lint` 即 G0 内）：
 * - 运行期边界（web 禁 import @dsh-forge/{core,knowledge}）+ SC2 无投影禁令
 *   （禁 fs.watch/chokidar 类监听回流）在 scripts/lint-imports.mjs——oxlint 1.86
 *   未实现 no-restricted-syntax，故以零依赖 import 扫描器机械执行；
 * - 令牌 lint（样式零裸值）在 scripts/lint-tokens.mjs——CSS 与内联样式不在 oxlint 解析面；
 * - 规则自证：scripts/lint-selftest.mjs（负样例种植 → 拦截断言 → 清理），每次 G0 重跑。
 */

const MSG_BASE =
  'dsh-forge 依赖铁律①基础↛业务：基础子模块禁 import 业务子模块（含类型 re-export 转发）——把该逻辑移入业务子模块'
const MSG_PEER_CORE =
  'dsh-forge 依赖铁律③同级业务互禁：core 内 forge ↔ knowledge 互禁 import（为未来知识域抽包保留边界）'
const MSG_PEER_VIEWS =
  'dsh-forge 依赖铁律③同级业务互禁：views/session ↔ views/knowledge 互禁 import——跨视图经 zones/ 槽位与 rpc/ 解耦'

export default defineConfig({
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/dist-types/**',
    'spikes/**',
    'docs/**',
    '.forge/**',
    '.claude/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
  ],
  categories: { correctness: 'error' },
  overrides: [
    // —— 铁律① 基础 ↛ 业务：web 基础子模块（shell/zones/components/rpc/styles）↛ views/flows ——
    {
      files: [
        'apps/web/src/shell/**',
        'apps/web/src/zones/**',
        'apps/web/src/components/**',
        'apps/web/src/rpc/**',
        'apps/web/src/styles/**',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                regex: '^\\.{1,2}/(?:.*/)?(?:views|flows)/',
                message: MSG_BASE,
              },
            ],
          },
        ],
      },
    },
    // —— 铁律① 基础 ↛ 业务：core db/（基础）↛ forge/knowledge（业务）——
    {
      files: ['packages/core/src/db/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [{ regex: '^\\.\\./(?:forge|knowledge)/', message: MSG_BASE }],
          },
        ],
      },
    },
    // —— 铁律③ 同级业务互禁：core forge/ ↛ knowledge/ ——
    {
      files: ['packages/core/src/forge/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [{ regex: '^\\.\\./knowledge/', message: MSG_PEER_CORE }],
          },
        ],
      },
    },
    // —— 铁律③ 同级业务互禁：core knowledge/ ↛ forge/ ——
    {
      files: ['packages/core/src/knowledge/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [{ regex: '^\\.\\./forge/', message: MSG_PEER_CORE }],
          },
        ],
      },
    },
    // —— 铁律③ 同级业务互禁：web views/session/ ↛ views/knowledge/ ——
    {
      files: ['apps/web/src/views/session/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [{ regex: '^\\.\\./knowledge/', message: MSG_PEER_VIEWS }],
          },
        ],
      },
    },
    // —— 铁律③ 同级业务互禁：web views/knowledge/ ↛ views/session/ ——
    {
      files: ['apps/web/src/views/knowledge/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [{ regex: '^\\.\\./session/', message: MSG_PEER_VIEWS }],
          },
        ],
      },
    },
  ],
})
