// host 路径与 profile 形态解析（定位：基础）。双形态自本任务区分（Implementation Notes：
// dev / packaged），供 4.1 打包管线与 dev.mjs（DSH_FORGE_DEV_PROFILE=dev）消费。
//
// 环境开关（electron 与 node 侧统一）：
//   DSH_FORGE_DEV_PROFILE  真值 = dev 形态（profile 直链 workspace 构建产物，免整包组装）
//   DSH_FORGE_PROFILE_DIR  显式 profile 目录（两形态通用覆盖；e2e/调试用）
//   DSH_FORGE_INSTALL_ANCHOR 显式 installAnchor（@deepseek-ai/dsh/package.json 绝对路径）
//   DSH_FORGE_USER_DATA    userData 覆盖（e2e 隔离；main 侧 app.setPath 消费）——在场兼作
//                          dshHome 隐式隔离门（fix-18：隔离语义经此隐式保留，e2e 全套零改动）
//   DSH_FORGE_DSH_HOME     显式 DSH_HOME 覆盖（fix-18 新增测试/调试口；优先级最高）
//   DSH_FORGE_RESOURCES_DIR 安装包 resources 根（4.1 打包形态；main 侧 app.isPackaged 时
//                           自 process.resourcesPath 注入，e2e 以 staging/已安装目录模拟）——
//                           置位后 installAnchor 取 {resources}/runtime/package.json（合成
//                           anchor 清单，assemble-installer-resources.mjs 物化），壳 dist 取
//                           {resources}/web-dist（resolveWebDistDir 同源消费），boot child
//                           入口取 {resources}/runtime/host-dist（run.ts resolveChildEntry）
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** profile 形态：dev = workspace 预组装目录；packaged = 首启落地 {app-data}/dsh-forge/profile/ */
export type ProfileForm = 'dev' | 'packaged'

export interface HostPaths {
  form: ProfileForm
  /** dsh profile 目录（loadProfileDirectory 输入） */
  profileDir: string
  /** 重定向后的 DSH_HOME（fix-18 翻案 S1 隔离 pin——产品属主裁决：产品是同一用户 dsh 环境的
   * 伴生窗口，缺省共享真 home ~/.dsh 复用原生凭据/配置/账本；USER_DATA 在场（e2e）隐式隔离） */
  dshHome: string
  /** installAnchor（runtime resolution 锚；打包形态 = resources 合成 anchor 清单） */
  installAnchor: string
  /** 应用状态库（core 插件 dbFile——boot overlay 行注入；4.2） */
  stateDb: string
  /** knowledge 插件绑定表文件（会话 cwd → projectId；host 装配方维护，4.2） */
  bindingsFile: string
  /** 安装包 resources 根（仅 DSH_FORGE_RESOURCES_DIR 置位时存在；e2e/4.3 冒烟消费） */
  resourcesDir?: string
}

export interface PathEnv {
  DSH_FORGE_DEV_PROFILE?: string
  DSH_FORGE_PROFILE_DIR?: string
  DSH_FORGE_INSTALL_ANCHOR?: string
  DSH_FORGE_RESOURCES_DIR?: string
  DSH_FORGE_USER_DATA?: string
  DSH_FORGE_DSH_HOME?: string
}

/** apps/host 包根（本模块位于 {src|dist}/profile/ 下，上溯三级；dev 形态默认 profile 目录锚） */
export function hostRoot(): string {
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))))
}

export function resolveHostPaths(env: PathEnv, userData: string): HostPaths {
  const dev = env.DSH_FORGE_DEV_PROFILE !== undefined && env.DSH_FORGE_DEV_PROFILE !== '' && env.DSH_FORGE_DEV_PROFILE !== '0'
  const profileDir =
    env.DSH_FORGE_PROFILE_DIR !== undefined && env.DSH_FORGE_PROFILE_DIR !== ''
      ? resolveFromHost(env.DSH_FORGE_PROFILE_DIR)
      : dev
        ? join(hostRoot(), 'profile.dev')
        : join(userData, 'profile')
  const resourcesDir =
    env.DSH_FORGE_RESOURCES_DIR !== undefined && env.DSH_FORGE_RESOURCES_DIR !== ''
      ? resolveFromHost(env.DSH_FORGE_RESOURCES_DIR)
      : undefined
  const dshHome = resolveDshHome(env, userData)
  return {
    form: dev ? 'dev' : 'packaged',
    profileDir,
    dshHome,
    installAnchor:
      env.DSH_FORGE_INSTALL_ANCHOR !== undefined && env.DSH_FORGE_INSTALL_ANCHOR !== ''
        ? resolveFromHost(env.DSH_FORGE_INSTALL_ANCHOR)
        : resourcesDir !== undefined
          ? join(resourcesDir, 'runtime', 'package.json')
          : createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),
    stateDb: join(userData, 'state.db'),
    bindingsFile: join(userData, 'knowledge-bindings.json'),
    resourcesDir,
  }
}

function resolveFromHost(p: string): string {
  return isAbsolute(p) ? p : join(hostRoot(), p)
}

/** DSH_HOME 三态解析（fix-18 翻案 S1 隔离 pin，优先级自上而下）：
 *  1. DSH_FORGE_DSH_HOME 显式指定（测试/调试口，相对路径锚 host 根）
 *  2. DSH_FORGE_USER_DATA 在场（e2e/隔离场景）→ {userData}/dsh-home（e2e 全套零改动）
 *  3. 缺省（人用 dev / 打包形态）→ 真 home {homedir}/.dsh——与官方桌面共享用户环境，
 *     凭据/会话账本/设置用户层/workspace 注册表复用原生 dsh（真 home 即真相源，零迁移逻辑） */
function resolveDshHome(env: PathEnv, userData: string): string {
  if (env.DSH_FORGE_DSH_HOME !== undefined && env.DSH_FORGE_DSH_HOME !== '') {
    return resolveFromHost(env.DSH_FORGE_DSH_HOME)
  }
  if (env.DSH_FORGE_USER_DATA !== undefined && env.DSH_FORGE_USER_DATA !== '') {
    return join(userData, 'dsh-home')
  }
  return join(homedir(), '.dsh')
}
