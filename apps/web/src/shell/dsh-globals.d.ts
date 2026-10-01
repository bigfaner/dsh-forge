// dsh 页面全局形状（renderer 侧消费面；G1 契约面清单第 1/2 项的窗侧类型）。
// 权威 = 上游 0.2.0-rc.2（packages/client/modules/src/client/manifest.ts 的 DshWindow、
// packages/client/connection/src/client/index.ts 的 ClientTransportHooks 切片）——
// 本包不引 host 侧包，仅结构同型镜像（S2 清单 pin，漂移由 G1 pin 测试对拍）。

/** __ModuleLoader__ 注册面（HTML 队列态 → 模块系统 live 态；client bundle 经 load 注册工厂） */
export interface ModuleLoaderFacade {
  mode: 'queue' | 'live'
  pendingQueue: ModuleLoaderRegistration[]
  load(registration: ModuleLoaderRegistration): void
  create(options: { boot: unknown; staticModules: Record<string, unknown> }): unknown
}

/** 一个 client bundle 的工厂注册（id = 包名；factory(require) 返回插件 exports） */
export interface ModuleLoaderRegistration {
  id: string
  chunk?: string
  factory: (require: (specifier: string) => unknown) => Record<string, unknown>
}

declare global {
  /** 宿主注入的组合图（applyIndexInjections 的 global 行写入；壳掌舵追加产品行） */
  var __DSH_BOOT__: unknown
  /** boot 就绪门（injections 全部生效后放行；AppWebEntry.run 在其 promise 上等待） */
  var __DSH_BOOT_READY__: { promise: Promise<void>; resolve(): void; reject(reason?: unknown): void } | undefined
  /** dsh 面 RPC carrier（shell/carrier.ts 装；连接层与 Gateway 流消费） */
  var __DSH_TRANSPORT__: { ownsHost: boolean; streamBaseUrl: string } | undefined
  /** 模块系统注册面（宿主注入行建立；client bundle 与壳内核共同消费） */
  var __ModuleLoader__: ModuleLoaderFacade | undefined
}
