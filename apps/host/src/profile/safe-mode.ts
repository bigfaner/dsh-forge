// 安全模式 profile 三件套（fix-12 B——官方 DSH Desktop 0.10.0 main.js:2697-2732 语义搬运：
// SAFE_MODE_PROFILE 隔离区 dshHome/profiles/desktop-safe-mode；package.json 仅官方基座
// bundle（@deepseek-ai/dsh-base + @deepseek-ai/dsh-web-app，版本 pin 与产品模板同源），
// cordis.patch.yml 空 patch []（用户层/第三方行零注入），pnpm-workspace.yaml hoisted——
// 产品口径 = 跳过用户层与第三方 bundle，仅官方基座启动）。幂等纪律同 materialize.ts：
// writeIfChanged（内容相同零写入；已存在异内容 = 保持不覆盖用户态？——安全模式为宿主
// 自管文件，官方 writeIfChanged 语义 = 内容一致跳过、不一致覆写，逐字对齐官方）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DSH_STACK_VERSION } from './template.js'

/** 安全模式 profile 目录名（官方 SAFE_MODE_PROFILE 逐字） */
export const SAFE_MODE_PROFILE_NAME = 'desktop-safe-mode'

/** 官方基座 bundle（官方 SAFE_MODE_BUNDLES 逐字——与产品模板 dsh.profile.bundles 同源） */
export const SAFE_MODE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] as const

/** 安全模式三件套内容生产（纯函数——版本 pin 与产品模板 DSH_STACK_VERSION 单源；
 *  文案逐字对齐官方 SAFE_MODE_PATCH / SAFE_MODE_WORKSPACE） */
export function safeModeProfileFiles(): Record<string, string> {
  const manifest = `${JSON.stringify(
    {
      name: 'dsh-profile-desktop-safe-mode',
      private: true,
      dependencies: Object.fromEntries(SAFE_MODE_BUNDLES.map((bundle) => [bundle, DSH_STACK_VERSION])),
      dsh: { profile: { bundles: [...SAFE_MODE_BUNDLES] } },
    },
    null,
    2,
  )}\n`
  const patch = [
    '# Managed by DSH Desktop Safe Mode.',
    '# Third-party bundles and the normal web profile\'s patch layer are intentionally omitted.',
    '[]',
    '',
  ].join('\n')
  const workspace = ['packages:', '  - .', '', 'nodeLinker: hoisted', 'autoInstallPeers: false', ''].join('\n')
  return {
    'package.json': manifest,
    'cordis.patch.yml': patch,
    'pnpm-workspace.yaml': workspace,
  }
}

/** 官方 writeIfChanged 语义（main.js:2712-2718 同名搬运）：读得同内容跳过，缺席/异内容覆写 */
export function writeIfChanged(path: string, content: string): boolean {
  try {
    if (readFileSync(path, 'utf8') === content) return false
  } catch {
    // 缺席/不可读 → 落写
  }
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content, 'utf8')
  return true
}

/**
 * 安全模式 profile 隔离区确保（{dshHome}/profiles/desktop-safe-mode 三件套幂等落地；
 * 返回目录绝对路径 + 本次实写文件名清单——装配日志/诊断面）。
 */
export function ensureSafeModeProfile(
  dshHome: string,
): { directory: string; written: readonly string[] } {
  const directory = join(dshHome, 'profiles', SAFE_MODE_PROFILE_NAME)
  mkdirSync(directory, { recursive: true })
  const files = safeModeProfileFiles()
  const written: string[] = []
  for (const [name, content] of Object.entries(files)) {
    if (writeIfChanged(join(directory, name), content)) written.push(name)
  }
  return { directory, written }
}
