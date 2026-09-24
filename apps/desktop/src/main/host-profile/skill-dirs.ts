// host-profile/skill-dirs — customSkillDirs boot 同步接线(M3 task 5.7;
// tech-design §Interface 6 / §Layer Placement 打包装配层)。
//
// D2 裁决:应用负责把插件技能根写入用户层 dsh 配置并维护升级路径同步 ——
// 本模块 = 壳主进程在 projectHostProfile 物化插件之后、supervisor.startHost
// 之前的那一步(vendored 宿主在 composeProfile 时一次性读入 user layer,
// spawn 后再写对当次 boot 不生效)。
//
// 机制归属与调用形态(Hard Rule:customSkillDirs 仅应用写入):同步机制代码
// 随插件交付(packages/plugins/forge-workbench/src/host/skill-dirs/sync.ts,
// 构建产物 lib/skill-dirs.js —— node 内建之外零依赖,壳侧动态导入无需插件
// peers);壳代码零插件身份硬编码 —— 遍历产品配置(plugin-bundles.json)的
// bundle 条目,仅对物化目录内实际存在 lib/skill-dirs.js 的 bundle 触发同步
// (未随包该产物的 bundle 自然跳过)。配置身份、技能根知识全部留在插件侧。
//
// 失败显式不静默(Hard Rule):任一 bundle 的导入/同步失败 → shellLog
// ERR_SKILL_DIR_SYNC + 告警条目(经 createWorkbenchIpcServices 的
// skillDirSyncAlerts 装配进 WorkbenchState.getState,设置面呈现);同步失败
// 不阻断 boot(技能面降级非致命,告警可查)。

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { shellLog } from '../log.ts'
import { materializationPath, type PluginBundleEntry } from './index.ts'

/** 技能同步机制产物在插件物化目录内的相对位置(lib/skill-dirs.js,5.7 约定)。 */
export const SKILL_DIRS_ARTIFACT = join('lib', 'skill-dirs.js')

/**
 * 设置面告警条目(tech-design §Error Types & Codes 的 ERR_SKILL_DIR_SYNC 行)。
 * 形态与插件侧 sync.ts 的 SkillDirSyncAlert 一致 —— 壳侧以结构类型消费,
 * 不静态依赖插件包(两 Tier 不焊死,G6)。
 */
export interface SkillDirSyncAlert {
  readonly code: 'ERR_SKILL_DIR_SYNC'
  readonly plugin: string
  readonly message: string
  readonly detail?: string | undefined
}

/** syncSkillDirs 的结构契约(动态导入面上的最小形状)。 */
interface SkillDirsModule {
  syncSkillDirs(input: { profileDir: string; pluginDir: string }): {
    status: 'clean' | 'written' | 'repaired' | 'failed'
    plugin: string
    skillRoot: string
    alert?: SkillDirSyncAlert | undefined
    changes: readonly string[]
  }
}

/** 动态导入 seam(测试注入源码形态;生产 = 运行时 ESM 导入物化产物)。 */
export type SkillDirsImporter = (url: string) => Promise<unknown>

const defaultImporter: SkillDirsImporter = url => import(/* @vite-ignore */ url)

/** syncProfileSkillDirs 入参。 */
export interface ProfileSkillDirsDeps {
  /** 应用自有 host profile 目录(物化根 + 用户层配置落点)。 */
  readonly profileDir: string
  /** 产品配置 bundle 清单(唯一身份来源;含 source/mandatory 均不影响本面)。 */
  readonly bundles: readonly PluginBundleEntry[]
  /** 动态导入 seam(缺省 = 运行时 import)。 */
  readonly importModule?: SkillDirsImporter | undefined
}

/** 聚合结局:alerts 为空 = 全部健康(设置面零告警条目)。 */
export interface ProfileSkillDirsOutcome {
  readonly alerts: readonly SkillDirSyncAlert[]
}

/**
 * 对配置内每个随包技能同步面的 bundle 执行 boot 同步(配置序)。逐 bundle
 * 独立成败 —— 一个失败不拦截其余;失败仅告警(见模块头)。
 */
export async function syncProfileSkillDirs(deps: ProfileSkillDirsDeps): Promise<ProfileSkillDirsOutcome> {
  const importModule = deps.importModule ?? defaultImporter
  const alerts: SkillDirSyncAlert[] = []
  for (const entry of deps.bundles) {
    const pluginDir = materializationPath(deps.profileDir, entry.name)
    const artifact = join(pluginDir, SKILL_DIRS_ARTIFACT)
    if (!existsSync(artifact)) continue // 该 bundle 不携带技能同步面 —— 跳过
    try {
      const mod = (await importModule(pathToFileURL(artifact).href)) as Partial<SkillDirsModule> | undefined
      if (mod === null || typeof mod !== 'object' || typeof (mod as SkillDirsModule).syncSkillDirs !== 'function') {
        throw new Error(`skill-dirs artifact at ${artifact} exports no syncSkillDirs`)
      }
      const result = (mod as SkillDirsModule).syncSkillDirs({ profileDir: deps.profileDir, pluginDir })
      if (result.status === 'failed') {
        const alert = result.alert ?? {
          code: 'ERR_SKILL_DIR_SYNC' as const,
          plugin: entry.name,
          message: 'customSkillDirs drift repair failed',
        }
        alerts.push({ ...alert, plugin: entry.name })
        shellLog.error({
          code: 'ERR_SKILL_DIR_SYNC',
          message: `customSkillDirs sync failed for bundle ${entry.name}: ${alert.message}`,
          data: { plugin: entry.name, skillRoot: result.skillRoot, ...(alert.detail === undefined ? {} : { detail: alert.detail }) },
        })
        continue
      }
      if (result.status === 'clean') continue
      shellLog.info({
        code: 'SKILL_DIRS_SYNCED',
        message: `customSkillDirs ${result.status} for bundle ${entry.name}`,
        data: { plugin: entry.name, skillRoot: result.skillRoot, changes: result.changes },
      })
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      alerts.push({ code: 'ERR_SKILL_DIR_SYNC', plugin: entry.name, message: `skill-dirs sync module failed to load or run: ${detail}` })
      shellLog.error({
        code: 'ERR_SKILL_DIR_SYNC',
        message: `customSkillDirs sync crashed for bundle ${entry.name}`,
        data: { plugin: entry.name, detail },
      })
    }
  }
  return { alerts }
}
