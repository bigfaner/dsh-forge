// forge:docs/* 两通道注册（3.1 注册行；定位：基础——通道面装配；read 域语义归 core
// 文档读域，openExternal = 宿主原生能力行（shell.openPath，boot-channel/fs-rpc 同类））。
// 通道名仅出自 @dsh-forge/contracts DOCS_CHANNELS（三处一体）。
//
// openExternal 安全面（Security Mitigations ②——威胁：shell.openPath 滥用）：
//   · 仅 main 侧执行（renderer 恒无 shell 面）；
//   · 先经桥校验路径在册——「projectHead 路径集」= 该工作区 feature_documents ∪
//     proposals 的 rel_path canonical 解析全集（越界即拒）。全集枚举在现契约面无
//     RPC 数据源（Interface 2 listFeatures 仅 docCount；Interface 3 仅 proposals 半边），
//     以 docs.read 的 canonical(forge_dir) 前缀守卫落地（在册集 ⊂ canonical(forge_dir)
//     树——前缀守卫 = 全集的必要条件，越界即 ERR_DOC_PATH_INVALID typed 拒绝）+
//     悬空拒绝（文件不在场 = 无 canonical 解析，绝不把库内 rel_path 原值交 openPath）。
//     残余面（forge_dir 下未登记文件可开）记账于任务 3.1 record——严格集合校验需后续
//     契约扩法（文档清单枚举面）。
//   · openPath 失败（无关联应用等）→ typed ERR_DOC_PATH_INVALID 经 RpcErr 信封
//     （contracts DocsChannelResponses 注记：openExternal = 触发即忘——失败经 RpcErr）。
import {
  DOCS_CHANNELS,
  type ForgeDocsService,
  type ReadDocRequest,
} from '@dsh-forge/contracts'
import type { ForgeIpc } from './forge-channels.js'
import { rpcEnvelope } from './rpc-envelope.js'

/** 注入服务面 = 文档读单法（Interface 4 纯读域） */
export type DocsChannelService = Pick<ForgeDocsService, 'read'>

/** openExternal 能力注入面（shell.openPath 结构同型：成功 '' / 失败错误文案——electron 依赖隔离出装配层） */
export type OpenPathFace = (target: string) => Promise<string>

export interface DocsChannelDeps {
  readonly docs: DocsChannelService
  readonly openPath: OpenPathFace
}

/** typed ERR_DOC_PATH_INVALID 构造（code ∈ contracts ERROR_CODES → rpcEnvelope 判型入 RpcErr 信封） */
function docPathInvalid(message: string, data: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { code: 'ERR_DOC_PATH_INVALID', data })
}

/**
 * openExternal 主侧执行（先经桥校验后开——两段守卫见文件头）。
 * @param deps - docs.read 桥校验面 + openPath 能力注入
 * @param q - ReadDocRequest（contracts DocsChannelRequests.openExternal）
 */
export async function openExternalDoc(deps: DocsChannelDeps, q: ReadDocRequest): Promise<void> {
  const doc = await deps.docs.read(q) // 越界（绝对路径/`..` 逃逸/forge_dir 外）→ typed ERR_DOC_PATH_INVALID 原样上抛
  if (doc.dangling) {
    throw docPathInvalid(`文档不在场（悬空），拒绝外开：${q.docRel}`, {
      projectId: q.projectId,
      docRel: q.docRel,
      dangling: true,
    })
  }
  const openError = await deps.openPath(doc.canonicalPath)
  if (openError !== '') {
    throw docPathInvalid(`外部打开失败（shell.openPath）：${openError}`, {
      projectId: q.projectId,
      docRel: q.docRel,
      openError,
    })
  }
}

/** 两通道全集注册（负载映射 = contracts DocsChannelRequests/Responses，键键对应） */
export function registerDocsChannels(ipc: ForgeIpc, deps: DocsChannelDeps): void {
  ipc.register(DOCS_CHANNELS.read, rpcEnvelope((q: ReadDocRequest) => deps.docs.read(q)))
  ipc.register(DOCS_CHANNELS.openExternal, rpcEnvelope((q: ReadDocRequest) => openExternalDoc(deps, q)))
}
