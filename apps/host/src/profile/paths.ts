// host 路径与 profile 形态解析（定位：基础）。双形态自本任务区分（Implementation Notes：
// dev / packaged），供 4.1 打包管线与 dev.mjs（DSH_FORGE_DEV_PROFILE=dev）消费。
//
// 环境开关（electron 与 node 侧统一）：
//   DSH_FORGE_DEV_PROFILE  真值 = dev 形态（profile 直链 workspace 构建产物，免整包组装）
//   DSH_FORGE_PROFILE_DIR  显式 profile 目录（两形态通用覆盖；e2e/调试用）
//   DSH_FORGE_INSTALL_ANCHOR 显式 installAnchor（@deepseek-ai/dsh/package.json 绝对路径）
//   DSH_FORGE_USER_DATA    userData 覆盖（e2e 隔离；main 侧 app.setPath 消费）
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** profile 形态：dev = workspace 预组装目录；packaged = 首启落地 {app-data}/dsh-forge/profile/ */
export type ProfileForm = 'dev' | 'packaged'

export interface HostPaths {
  form: ProfileForm
  /** dsh profile 目录（loadProfileDirectory 输入） */
  profileDir: string
  /** 重定向后的 DSH_HOME（S1 pin：runProfile 触碰 $DSH_HOME，产品须隔离到应用数据目录） */
  dshHome: string
  /** installAnchor = @deepseek-ai/dsh/package.json 绝对路径（runtime resolution 锚） */
  installAnchor: string
  /** 应用状态库（core 插件 dbFile——boot overlay 行注入；4.2） */
  stateDb: string
  /** knowledge 插件绑定表文件（会话 cwd → projectId；host 装配方维护，4.2） */
  bindingsFile: string
}

export interface PathEnv {
  DSH_FORGE_DEV_PROFILE?: string
  DSH_FORGE_PROFILE_DIR?: string
  DSH_FORGE_INSTALL_ANCHOR?: string
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
  return {
    form: dev ? 'dev' : 'packaged',
    profileDir,
    dshHome: join(userData, 'dsh-home'),
    installAnchor:
      env.DSH_FORGE_INSTALL_ANCHOR !== undefined && env.DSH_FORGE_INSTALL_ANCHOR !== ''
        ? resolveFromHost(env.DSH_FORGE_INSTALL_ANCHOR)
        : createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),
    stateDb: join(userData, 'state.db'),
    bindingsFile: join(userData, 'knowledge-bindings.json'),
  }
}

function resolveFromHost(p: string): string {
  return isAbsolute(p) ? p : join(hostRoot(), p)
}
