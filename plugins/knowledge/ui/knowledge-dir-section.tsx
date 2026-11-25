// 知识库目录只读节·组件本体（knowledge-plugin-migration 1.5 提案项 4 UI 侧）：
// 向项目台插槽（project.section.knowledge-dir 官方缝——槽名/行协议自 plugins/project/ui
// keyed-section.ts 正本读源核销后落座；bundle 自含副本逐字 pin = mirrors-pin）呈现本项目
// 知识库目录只读节。单向：零写面零 configForms 依赖；目录值 = deriveKnowledgeDir 缺省派生
// 单源（@dsh-forge/lib-path path-key——use-knowledge-browse 空库引导同源，产品口径恒缺省
// 派生；host config.knowledgeDir 显式覆盖的回读通道不在本批范围）。锚解析判据 = 唯一非
// archived 项目充锚（project detail-section 同型——零/多项目/拉取失败不猜锚 fail-soft）。
import { useEffect, useState, type ReactNode } from 'react'
import { deriveKnowledgeDir } from '@dsh-forge/lib-path/path-key'
import { currentDefaultRpcClientFactory, type RpcClientFactory } from './rpc-channels.js'

/** 节 keyed 占用键（官方 SlotCore keyed 槽判同键；e2e/排障锚） */
export const KNOWLEDGE_DIR_SECTION_KEY = 'dswf-knowledge-dir'

/** 节行 label（官方 SlotLabel 字符串形态——插槽节文案沿用现状口径） */
export const KNOWLEDGE_DIR_SECTION_LABEL = '知识库目录'

/** 项目锚相位（唯一非 archived 项目充锚；absent = 零/多项目/拉取失败——节退 null） */
export type KnowledgeDirAnchorPhase =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly knowledgeDir: string }
  | { readonly state: 'absent' }

/**
 * 锚解析（纯异步面，mount 期单拉）：projects.list 唯一非 archived 行充锚 → 缺省派生
 * 知识目录。absent 三形态均 fail-soft（拉取失败 console.warn 留痕不静默——AGENTS §7）。
 */
export async function loadKnowledgeDirAnchor(makeClient: RpcClientFactory): Promise<KnowledgeDirAnchorPhase> {
  try {
    const projects = await makeClient().projects.list()
    const live = projects.filter((row) => !row.archived)
    if (live.length !== 1) return { state: 'absent' }
    return { state: 'ready', knowledgeDir: deriveKnowledgeDir(live[0]!.wsPath) }
  } catch (cause) {
    console.warn('[dsh-forge/knowledge] knowledge-dir section projects.list failed——节退 null（fail-soft）', cause)
    return { state: 'absent' }
  }
}

/** 节呈现本体（纯组件——props 注入便于静态渲染测试） */
export function KnowledgeDirSectionView(props: { readonly knowledgeDir: string }): ReactNode {
  return (
    <div className="dswf-knowledge-dir" data-dswf-knowledge-dir="">
      <h2 data-cfg-title style={{ fontSize: 14, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', margin: '0 0 6px' }}>
        {KNOWLEDGE_DIR_SECTION_LABEL}
      </h2>
      <p data-cfg-hint style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', margin: '0 0 6px' }}>
        本项目知识库的 Markdown 沉淀目录（只读）：
      </p>
      <code
        data-dswf-knowledge-dir-path
        style={{ fontFamily: 'var(--ds-font-family-code, monospace)', fontSize: 12, color: 'var(--dsw-alias-label-primary)', wordBreak: 'break-all' }}
      >
        {props.knowledgeDir}
      </code>
    </div>
  )
}

/** 节组件本体（槽 runtime 消费——锚相位装载，absent = render null 不悬空） */
export function KnowledgeDirSection(props: { readonly makeClient?: RpcClientFactory } = {}): ReactNode {
  const makeClient = props.makeClient ?? currentDefaultRpcClientFactory()
  const [phase, setPhase] = useState<KnowledgeDirAnchorPhase>({ state: 'loading' })
  useEffect(() => {
    let alive = true
    void loadKnowledgeDirAnchor(makeClient).then((next) => {
      if (alive) setPhase(next)
    })
    return () => {
      alive = false
    }
  }, [makeClient])
  if (phase.state !== 'ready') return null
  return <KnowledgeDirSectionView knowledgeDir={phase.knowledgeDir} />
}
