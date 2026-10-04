// boot 链统一实例解析（fix-20；定位：基础）。
// 动机：dev 形态 dsh-app-boot 模块二象性——child 静态 import 链按 dist 位置解析到
// workspace .pnpm 物理拷贝，而 profile 树内插件（dsh-plugin-manager / dsh-config-editor）
// 按配置目录位置解析到 profile.dev/node_modules 平铺拷贝。bootstrapIncludes 是
// dsh-app-boot 模块级 WeakMap（注册面 boot→mountRootInclude :3691-3718，消费面
// reconcileProfilePatches :3468-3470）——两副本各自模块域互不可见 → 原生设置流程
// 「添加第三方模型提供商」抛「dsh: profile reload requires the root Include entry」
// （走查 2026-10-03 P0；fix-12 已定性 dev 形态全 volatile 设置写同因恒拒）。
// 统一策略（裁决）：child 的 boot 链两件（@deepseek-ai/dsh-app-boot +
// @deepseek-ai/dsh/profile-boot）改按 profile 目录位置解析——与插件消费面同锚点，
// 两消费面落到同一物理拷贝（profile.dev 补 @deepseek-ai/dsh 依赖镜像 profile.install
// 先例，树承载完整 boot 链）。打包形态 profile 目录无 node_modules（4.1 拓扑：child
// 入口与 runtime/node_modules 同容器邻接）——自然解析即单实例，走 adjacent 回退面。
// fail-loud 自证（防依赖树漂移再犯）：profile 树在场服务插件时，boot 链任一件解析
// 逃逸出树即 fatal——宁可启动显形也不静默双实例。
import { createRequire } from 'node:module'
import { existsSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as DshAppBootModule from '@deepseek-ai/dsh-app-boot'
import type { runProfile as RunProfileFn } from '@deepseek-ai/dsh/profile-boot'

/** boot 链两件在场门（树服务插件 ↔ 树承载 boot 链，二者必须一致——半树 = 双实例裂缝） */
const TREE_CHAIN_PACKAGES = ['@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh'] as const

export interface BootChain {
  /** dsh-app-boot 模块实例（loadProfileDirectory / loadLayeredEnv / reportSkippedBundles 消费面） */
  dshAppBoot: typeof DshAppBootModule
  /** runProfile（boot 本体入口——其内部 boot() 注册 bootstrapIncludes 的那份实例即本链实例） */
  runProfile: typeof RunProfileFn
  /** 实际生效的 dsh-app-boot 解析 URL（fix-20 实例统一 dump/执行记录用） */
  appBootResolvedUrl: string
  /** 解析形态：profile-tree = 与插件树同拷贝；adjacent = 邻接回退（打包形态 4.1 布局） */
  source: 'profile-tree' | 'adjacent'
}

/** 树模式 boot 链件解析逃逸（双实例拓扑漂移——fail-loud 不静默回退） */
export class BootChainSplitError extends Error {
  constructor(profileDir: string, specifier: string, resolvedUrl: string) {
    super(
      `boot chain split risk: profile tree at ${profileDir} serves plugins, but ${specifier} resolved outside it (${resolvedUrl}) — boot registration copy would diverge from the plugin consumer copy (fix-20); reinstall apps/host/profile.dev`,
    )
    this.name = 'BootChainSplitError'
  }
}

/**
 * 按 profile 目录位置加载 boot 链（与插件 bare import 同锚点）。
 * - 树完整在场（两件 package.json 均在 profileDir/node_modules）→ 树内解析 + import，
 *   逃逸即 BootChainSplitError；
 * - 两件均缺席（打包形态 / 无树 fixture）→ adjacent 回退：以本模块位置自然解析
 *   （打包形态 = {res}/runtime 邻接单容器，dev 直跑 dist = 原双实例形态仅测试兜底）；
 * - 半树（恰一件在场）→ 直接抛错：树已服务插件而 boot 链不完整 = 确定双实例。
 */
export async function loadBootChain(profileDir: string): Promise<BootChain> {
  const treeBase = join(profileDir, 'node_modules')
  const present = TREE_CHAIN_PACKAGES.filter((name) =>
    existsSync(join(treeBase, ...name.split('/'), 'package.json')),
  )
  if (present.length === 0) {
    const dshAppBoot = (await import('@deepseek-ai/dsh-app-boot')) as typeof DshAppBootModule
    const { runProfile } = (await import('@deepseek-ai/dsh/profile-boot')) as {
      runProfile: typeof RunProfileFn
    }
    return {
      dshAppBoot,
      runProfile,
      appBootResolvedUrl: pathToFileURL(
        createRequire(import.meta.url).resolve('@deepseek-ai/dsh-app-boot'),
      ).href,
      source: 'adjacent',
    }
  }
  if (present.length !== TREE_CHAIN_PACKAGES.length) {
    const missing = TREE_CHAIN_PACKAGES.filter((name) => !present.includes(name))
    throw new Error(
      `boot chain split risk: profile tree at ${profileDir} is incomplete (${missing.join(', ')} missing) — tree would serve plugins while the boot chain falls back to another copy (fix-20); reinstall apps/host/profile.dev`,
    )
  }
  // 与插件同锚点：根配置文件位置（cordis.yml = runProfile 每启重写的根配置）——
  // bare import 自此解析的首个命中 = profileDir/node_modules，即插件消费面拷贝
  const profileRequire = createRequire(join(profileDir, 'cordis.yml'))
  const realTreeBase = realpathSync(treeBase)
  const resolveInTree = (specifier: string): string => {
    const resolved = realpathSync(profileRequire.resolve(specifier))
    if (!(resolved + sep).startsWith(realTreeBase + sep)) {
      throw new BootChainSplitError(profileDir, specifier, pathToFileURL(resolved).href)
    }
    return resolved
  }
  const appBootEntry = resolveInTree('@deepseek-ai/dsh-app-boot')
  const profileBootEntry = resolveInTree('@deepseek-ai/dsh/profile-boot')
  const dshAppBoot = (await import(pathToFileURL(appBootEntry).href)) as typeof DshAppBootModule
  const { runProfile } = (await import(pathToFileURL(profileBootEntry).href)) as {
    runProfile: typeof RunProfileFn
  }
  return {
    dshAppBoot,
    runProfile,
    appBootResolvedUrl: pathToFileURL(appBootEntry).href,
    source: 'profile-tree',
  }
}
