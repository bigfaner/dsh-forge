// registry-adapter——官方 workspaceRegistry 注入缝（plugin-project 1.10，code-design §2）：
// 注册域三方一致性链条（register / reconcile / queries）统一消费本窄端口 ProjectRegistryPort；
// 官方 @deepseek-ai/dsh-workspace WorkspaceRegistry/Workspace 以结构化本地声明映射（插件可移植性
// 纪律：插件不静态依赖宿主官方包——窄面同形即可），测试以 fake 端口构造注入。

/** registry entry 端口投影（id→workspaceId / path→wsPath 驼列口径——调用方零官方形状耦合）。 */
export interface RegistryEntry {
  readonly workspaceId: string
  readonly wsPath: string
  readonly title: string
}

/** 官方 Workspace 消费窄面（结构化本地声明——@deepseek-ai/dsh-workspace Workspace 同形子集）。 */
export interface OfficialWorkspaceFace {
  /** 官方 Workspace.id（durable uuid） */
  readonly id: string
  /** 官方 canonical path（create 时点 realpath） */
  readonly path: string
  readonly title: string
  /** 官方 durable 改名（标题对齐缝；替身可缺席） */
  setTitle?(title: string): Promise<void>
}

/** 官方 WorkspaceRegistry 消费窄面（结构化本地声明——create/get/list/delete/resolveByPath 同形）。 */
export interface OfficialRegistryFace {
  list(): Promise<readonly OfficialWorkspaceFace[]>
  get(id: string): Promise<OfficialWorkspaceFace | undefined>
  /** find-or-create：同规范路径已存在即复用不改 title（官方幂等面） */
  create(path: string, title?: string): Promise<OfficialWorkspaceFace>
  delete(id: string): Promise<void>
  /** 按规范路径只读解析；缺席 = 旧替身/降级面 */
  resolveByPath?(path: string): Promise<OfficialWorkspaceFace | undefined>
}

export type RegistryEntryMutable = RegistryEntry & { setTitle?(title: string): Promise<void> }

/**
 * 注册域 registry 端口（注入缝）——register 补偿链 / reconcile 对账 / queries 标题读面的
 * 唯一 registry 出入口；单测以 fake 实现构造注入（零官方依赖）。
 */
export interface ProjectRegistryPort {
  list(): Promise<readonly RegistryEntry[]>
  get(workspaceId: string): Promise<RegistryEntryMutable | undefined>
  /** 幂等 find-or-create；返回 entry */
  create(wsPath: string, title?: string): Promise<RegistryEntryMutable>
  /** 补偿删除（步 4 失败且 createdNow 时点唯一消费者） */
  delete(workspaceId: string): Promise<void>
  resolveByPath(wsPath: string): Promise<RegistryEntryMutable | undefined>
}

/** 官方实体 → 端口 entry 投影（setTitle 透传可缺席）。 */
function toEntry(w: OfficialWorkspaceFace): RegistryEntryMutable {
  return { workspaceId: w.id, wsPath: w.path, title: w.title, setTitle: w.setTitle }
}

/**
 * 官方 workspaceRegistry face → ProjectRegistryPort 适配（装配期唯一缝合点——
 * 域服务只认端口，测试与未来替身注入面）。
 */
export function createRegistryAdapter(face: OfficialRegistryFace): ProjectRegistryPort {
  return {
    list: async () => (await face.list()).map(toEntry),
    get: async (workspaceId) => {
      const w = await face.get(workspaceId)
      return w ? toEntry(w) : undefined
    },
    create: async (wsPath, title) => toEntry(await face.create(wsPath, title)),
    delete: (workspaceId) => face.delete(workspaceId),
    resolveByPath: async (wsPath) => {
      const w = await face.resolveByPath?.(wsPath)
      return w ? toEntry(w) : undefined
    },
  }
}
