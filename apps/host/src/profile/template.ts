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
    '# ── 产品插件行（2.x/3.x 产品插件 bundle 就绪后转正启用）──',
    '- insert:',
    '    - id: dsh-forge-core',
    "      name: '@dsh-forge/core'",
    '      disabled: true',
    '    - id: dsh-forge-knowledge',
    "      name: '@dsh-forge/knowledge'",
    '      disabled: true',
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
    '  koffi: true',
    '  node-pty: true',
    '  protobufjs: true',
    '',
  ].join('\n'),
}

/** boot 拥有的根配置（空根 include；runProfile 每启重写——S1 pin：空/纯注释会 fail boot 须写 []） */
export const PROFILE_ROOT_BOOTSTRAP = { name: 'cordis.yml', content: '[]\n' } as const
