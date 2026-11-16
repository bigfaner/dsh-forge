// gen-preset-standard-overlay.mjs — 从官方 dsh-web-app 标准预设底稿生成 spec bundle
// patch 的 preset-standard 覆写块（Web 编辑器同款机制：按 row id 整体替换 config）。
// 生成规则：config 子树整体左移 4 列；skill-filesystem 行补 customSkillDirs（spec 包
// skills/ 安装后绝对路径 !!js 表达式——官方同款 baseUrl 表达式先例）；其余逐字保留。
// 漂移提示：官方底稿更新后需重跑本脚本再生成（源锚 = 安装树 dsh-web-app/presets/standard.patch.yml）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = join(PKG, '..', '..')
// 源锚 = 官方 dsh CLI 安装树（被测宿主运行时实际装载的 dsh-web-app 世代——profile.install
// 树 pin 的是 forge 打包代（0.2.0-rc.2），与 CLI 宿主（0.2.2-rc.2）不同世代，勿混用）。
const SOURCES = [
  'Z:/project/github/deepseek-harness/apps/cli/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml',
  join(REPO, 'apps/host/profile.install/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml'),
]
const SRC = SOURCES.find((p) => existsSync(p))
if (SRC === undefined) throw new Error('standard.patch.yml 源锚双双缺席')

const raw = readFileSync(SRC, 'utf8').replaceAll('\r\n', '\n')
const lines = raw.split('\n')
const cfgAt = lines.findIndex((l) => l === '      config:')
if (cfgAt < 0) throw new Error('standard.patch.yml: config: 行未找到')
const cfg = lines.slice(cfgAt + 1).filter((l) => l.trim() !== '')
// 左移 4 列（原 config 子树缩进 8+ → 4+）
const shifted = cfg.map((l) => (l.startsWith('    ') ? l.slice(4) : l))

// skill-filesystem 行补 config.customSkillDirs（spec skills 锚表达式）
const out = []
for (let i = 0; i < shifted.length; i++) {
  const l = shifted[i]
  out.push(l)
  if (l.trim() === "- id: skill-filesystem") {
    const name = shifted[i + 1]
    if (name === undefined || !name.includes("name: '@deepseek-ai/dsh-skill-filesystem'")) {
      throw new Error('skill-filesystem 行形状漂移——重检官方底稿')
    }
    out.push(name)
    out.push("        config:")
    out.push("          customSkillDirs:")
    out.push("            - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/spec/package.json')), 'skills')")
    i += 1
  }
}

const header = [
  '# skill-filesystem 挂载 + preset-standard 覆写（bug fefd5149 缝③）。',
  '# 单装形态 skills 挂载 = config 载体（research/official-verification.md §2）：',
  '# ① dsh-web-app 将顶层 skill-filesystem 行 disabled（预设会话由预设行内实例供服）——',
  '#    故标准预设会话的挂载唯一正径 = 按 row id 覆写 preset-standard 行 config',
  '#    （Web 编辑器同款机制：config 整体替换非合并），skill-filesystem 补',
  '#    customSkillDirs 锚包内 skills/ 的安装后绝对路径（!!js baseUrl 表达式，官方',
  '#    dsh-web-app 预设底稿同款先例）。其余行逐字保留官方底稿。',
  '# ② preset-standard 子树由 scripts/gen-preset-standard-overlay.mjs 从官方',
  '#    dsh-web-app/presets/standard.patch.yml 生成——官方底稿更新后须重跑再生成。',
  '- insert:',
  "    - id: spec",
  "      name: '@dsh-forge/spec'",
  '- id: skill-filesystem',
  "  name: '@deepseek-ai/dsh-skill-filesystem'",
  '  config:',
  '    customSkillDirs:',
  "      - !!js process.getBuiltinModule('node:path').join(process.getBuiltinModule('node:path').dirname(process.getBuiltinModule('node:module').createRequire(baseUrl).resolve('@dsh-forge/spec/package.json')), 'skills')",
  '- id: preset-standard',
  "  name: '@deepseek-ai/dsh-agent-preset'",
  '  config:',
]
writeFileSync(join(PKG, 'cordis.patch.yml'), [...header, ...out].join('\n') + '\n', 'utf8')
console.log('gen done:', out.length, 'config lines')
