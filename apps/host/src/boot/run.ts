// dsh 宿主 boot（定位：基础）——S1 pin 的直跑形态（direct-in-main，裁决=可行不触发 vendor）。
// 缝（S1 实测签名，上游 0.2.0-rc.2）：
//   loadProfileDirectory(binName, dir, installAnchor, {userLayer?}) → Profile
//   runProfile({environment, profile, resolvedProfile, patchFiles, args, packageManager?})
//     → { ctx, shutdown }；就绪后 ctx.connection.authenticatedUrl(base) + ctx.webServer.collectIndexInjections()
import * as dshAppBoot from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
// 以下 type-only 引入仅为拉入 cordis Context 模块增强（ctx.connection / ctx.webServer 类型）
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { buildBootManifest, type BootManifest } from './manifest.js'

export interface BootDshOptions {
  profileDir: string
  installAnchor: string
  /** webserver 监听端口（main 侧解析后传入） */
  port: number
}

export interface DshHostHandle {
  manifest: BootManifest
  /** dsh 应用树优雅关停（bounded 5s 升级；before-quit 消费） */
  shutdown: () => Promise<void>
}

/** 经 runProfile 拉起 dsh 宿主进程内插件面，产出 {url, injections} boot manifest */
export async function bootDshHost(options: BootDshOptions): Promise<DshHostHandle> {
  const profile = dshAppBoot.loadProfileDirectory('dsh', options.profileDir, options.installAnchor)
  dshAppBoot.reportSkippedBundles('dsh', profile)
  const { ctx, shutdown: processShutdown } = await runProfile({
    environment: dshAppBoot.loadLayeredEnv('dsh'),
    profile: 'dsh-forge',
    resolvedProfile: { profile, installAnchor: options.installAnchor },
    patchFiles: [],
    args: ['--no-open', '--port', String(options.port)],
  })
  const url = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`)
  const injections = ctx.webServer.collectIndexInjections()
  return { manifest: buildBootManifest(url, injections), shutdown: () => processShutdown.shutdown(0) }
}
