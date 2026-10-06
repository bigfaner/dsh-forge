// profile 模板（打包形态首启落地的唯一内容源；定位：基础）。
// 权威：tech-design「profile 组装与插件分发」——产品 profile 模板（cordis.patch.yml：
// 官方行 + @dsh-forge/core / @dsh-forge/knowledge 行）随应用资源分发，首启落地
// {app-data}/dsh-forge/profile/，此后每次启动 loadProfileDirectory 加载。
// dev 形态同义文件 = apps/host/profile.dev/（pnpm 需真实可安装目录，两处由
// materialize.test.ts 同步 pin 机械对齐）。

/** 上游 dsh 公开栈精确 pin（tech-design Dependencies：P1 期不开升级窗口） */
export const DSH_STACK_VERSION = '0.2.0-rc.2'

/** profile 目录引导文件名（cordis.yml 为 boot 拥有：runProfile 每启重写，此处仅首启兜底） */
export const PROFILE_TEMPLATE_FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify(
    {
      name: 'dsh-forge-profile',
      private: true,
      version: '0.0.0',
      description:
        'dsh-forge product profile (official web bundles + product plugin rows; materialized by host first launch).',
      dependencies: {
        '@deepseek-ai/dsh-base': DSH_STACK_VERSION,
        '@deepseek-ai/dsh-web-app': DSH_STACK_VERSION,
      },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
    },
    null,
    2,
  ) + '\n',
  'cordis.patch.yml': [
    '# dsh-forge product profile user layer (materialized on first launch; idempotent — never rewritten).',
    '# patch 按 row id 整体替换该行 config（非深合并），保留字段须重述。',
    '',
    '# ── 官方行（按 id 定位 web-app 出厂行：与出厂值一致的 no-op 重述）──',
    '- id: system-prompt',
    '  config:',
    '    personaSuffix: Your working directory is {{cwd}}.',
    '    personaPrefix: >-',
    '      You are a coding agent powered by the {{model}} model.',
    '',
    '# ── 官方行（置停）：client-hmr 全图 sync 会以宿主最新图对账掉壳掌舵追加的产品 client 行',
    '# （S2 清单残留 #3；2.7 实证：产品插件激活 ~145ms 后被 prune，槽位注册级联回收）。',
    '# 产品组合静态（随应用发版更新），P1 无 HMR 面——重启/刷新即重掌舵，不需要热替换链。',
    '- id: client-hmr',
    '  disabled: true',
    '',
    '# ── 产品插件行（4.2 转正启用——SMOKE-LEDGER §5 转正条件落位）──',
    '# core = 单 SQLite 句柄双服务（ctx.forgeProjects / ctx.forgeKnowledge；M2 起 tasksHome',
    '# 注入时增四域服务）；knowledge = 召回 tool 双件 + forge:knowledge 系统提示词段；',
    '# plugin-forge = forge 管线 tool 半身六动词 + forge:pipeline 提示段（M2 3.4 入列）。',
    '# config 不在用户层书写（dbFile / tasksHome / bindingsFile 与 skills 物理挂载目录',
    '# 均属应用装配期路径——boot overlay 按 userData/形态逐启生成）。',
    '- insert:',
    '    - id: dsh-forge-core',
    "      name: '@dsh-forge/core'",
    '    - id: dsh-forge-knowledge',
    "      name: '@dsh-forge/knowledge'",
    '    - id: dsh-forge-plugin-forge',
    "      name: '@dsh-forge/plugin-forge'",
    '',
  ].join('\n'),
  'pnpm-workspace.yaml': [
    'packages:',
    '  - .',
    '',
    'nodeLinker: hoisted',
    'autoInstallPeers: false',
    'allowBuilds:',
    "  '@deepseek-ai/dsh-subprocess-local': true",
    "  '@google/genai': true",
    '  better-sqlite3: true',
    '  koffi: true',
    '  node-pty: true',
    '  protobufjs: true',
    '',
  ].join('\n'),
}

/** boot 拥有的根配置（空根 include；runProfile 每启重写——S1 pin：空/纯注释会 fail boot 须写 []） */
export const PROFILE_ROOT_BOOTSTRAP = { name: 'cordis.yml', content: '[]\n' } as const
