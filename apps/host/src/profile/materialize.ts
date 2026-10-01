// profile 首启落地（定位：基础）。幂等铁律：已存在的文件一律不重写——
// cordis.patch.yml 是用户层状态，重写即破坏「插件升级 = 随应用发版更新资源目录」约定。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PROFILE_ROOT_BOOTSTRAP, PROFILE_TEMPLATE_FILES } from './template.js'

export interface MaterializeResult {
  dir: string
  /** 本次实际写入的文件名（首启 = 全量；重复启动 = 空） */
  created: string[]
  /** 已存在而保持不动的文件名（幂等不重写） */
  kept: string[]
}

/**
 * 首启将 profile 模板落地 profileDir（tech-design「profile 组装与插件分发」）。
 * 写入集 = 模板三件（package.json / cordis.patch.yml / pnpm-workspace.yaml）
 * + cordis.yml 空根兜底（boot 拥有：runProfile 每启重写，此处仅保证 Loader 有真实根锚定）。
 * node_modules 不在本函数职责：packaged 形态随应用资源分发（4.1 extraResources）。
 */
export function ensureProfileMaterialized(profileDir: string): MaterializeResult {
  const files: Record<string, string> = {
    ...PROFILE_TEMPLATE_FILES,
    [PROFILE_ROOT_BOOTSTRAP.name]: PROFILE_ROOT_BOOTSTRAP.content,
  }
  const created: string[] = []
  const kept: string[] = []
  for (const [name, content] of Object.entries(files)) {
    const path = join(profileDir, name)
    if (existsSync(path)) {
      kept.push(name)
      continue
    }
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
    created.push(name)
  }
  return { dir: profileDir, created, kept }
}
