// workbench/proposals/proposals-service — 提案读动词服务(任务 5.3)。
//
// tech-design §Interface 1 提案段(UF5 数据面)的两条只读动词:
//   - getProposalBoard → proposal_snapshot 派生索引行集 + 排序基线
//     (forge-cli Discover 权威序:created 降序;平局 slug 升序裁决 —
//     Go sort.Slice 不稳定,确定性补齐)+ hasEval 活性拼接(eval/
//     存在性,schema 无列 → 每 read 活性 fs 判定,getStageGate 门态
//     同款「不吃索引时滞」纪律)+ proposalsRoot(空态卡的文档根路径
//     说明数据源,ui-design UF5 empty 态);
//   - readProposalDoc → markdown 原文只读返回(proposal | eval 两 kind;
//     渲染层白名单归 UI 任务,Hard Rule:本域零写动词)。
//
// 路径授权:proposals 根由 services.ts 注入(projects 行 → 文档根三分
// 模型解析);项目缺失 → ERR_PROJECT_NOT_FOUND(knowledge/stages 同码
// 口径)。slug 段形态 = 单段非空无分隔/控制字符(内核权威校验;
// ERR_PROPOSAL_PATH_INVALID);文件缺失/不可读/eval 无报告 →
// ERR_PROPOSAL_NOT_FOUND。
//
// 感知回流(DF007 ≤5s)不在此层:proposal_snapshot 随 scanForgeFiles
// 每轮同步(行集替换,proposals/ 感知根已入 watch),事件面复用既有
// sync 批(v2 事件词表闭合,无 proposals 专属事件型)。

import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { RepoDb } from '../repos/types.ts'
import { WorkbenchRepoError } from '../repos/types.ts'
import { listProposalRows, pickEvalReport, type ProposalIndexRow } from './proposal-indexer.ts'
import type { ProposalBoardData, ProposalDoc, ProposalSummary } from '../ipc/types.ts'

/** proposals 域错误码。 */
export type ProposalsErrorCode = 'ERR_PROPOSAL_PATH_INVALID' | 'ERR_PROPOSAL_NOT_FOUND'

/** proposals 域错误(读动词的调用方契约拒绝形态)。 */
export class ProposalDomainError extends Error {
  constructor(
    readonly code: ProposalsErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ProposalDomainError'
  }
}

/** 服务依赖缝(db + proposals 根解析;装配缺省见 services.ts,测试注入观测)。 */
export interface ProposalsVerbDeps {
  readonly db: RepoDb
  /** proposals 根绝对路径解析;项目不存在 → null。 */
  readonly resolveProposalsRoot: (projectId: string) => string | null
}

/** 本模块装配产物:两条提案读动词(并入 WorkbenchVerbServices 面)。 */
export interface ProposalsVerbService {
  getProposalBoard(projectId: string): ProposalBoardData
  readProposalDoc(input: { readonly projectId: string; readonly slug: string; readonly kind: 'proposal' | 'eval' }): ProposalDoc
}

/** 单段路径片段判定(knowledge isKnowledgeSegment 同规则,域内镜像)。 */
function isSegment(segment: string): boolean {
  if (segment === '') return false
  for (const ch of segment) {
    const code = ch.codePointAt(0)
    if (code === undefined) return false
    if (code <= 0x1f || code === 0x7f) return false
    if (ch === '/' || ch === '\\') return false
  }
  return true
}

/**
 * 排序基线(forge-cli Discover 权威):created 降序(字符串日期比较);
 * created 缺失(null,防御位 —— 索引层恒回退 mtime 日期)排末尾;平局
 * slug 升序(Go sort.Slice 不稳定,确定性裁决)。
 */
export function boardSortBaseline(rows: readonly ProposalIndexRow[]): ProposalIndexRow[] {
  return [...rows].sort((a, b) => {
    if (a.created !== null && b.created !== null && a.created !== b.created) {
      return a.created < b.created ? 1 : -1
    }
    if (a.created !== null && b.created === null) return -1
    if (a.created === null && b.created !== null) return 1
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
  })
}

/** eval 报告活性存在判定 + 选锚(eval/*.md;目录缺失/不可读 → 无报告)。 */
function evalReportOf(proposalsRoot: string, slug: string): string | null {
  let names: string[]
  try {
    names = readdirSync(join(proposalsRoot, slug, 'eval'))
  } catch {
    return null
  }
  return pickEvalReport(names)
}

export function createProposalsVerbService(deps: ProposalsVerbDeps): ProposalsVerbService {
  const { db } = deps

  /** 项目存在性前置(两动词统一)。 */
  const requireProposalsRoot = (projectId: string): string => {
    const root = deps.resolveProposalsRoot(projectId)
    if (root === null) {
      throw new WorkbenchRepoError('ERR_PROJECT_NOT_FOUND', `project ${projectId} does not exist`)
    }
    return root
  }

  return {
    getProposalBoard(projectId: string): ProposalBoardData {
      const proposalsRoot = requireProposalsRoot(projectId)
      const proposals: ProposalSummary[] = boardSortBaseline(listProposalRows(db, projectId)).map(row => ({
        slug: row.slug,
        status: row.status,
        author: row.author,
        created: row.created,
        // NULL = 无关联(管线早期)→ 呈现层不渲染徽标(Cross-Layer Data Map)。
        featureSlug: row.featureSlug,
        hasEval: evalReportOf(proposalsRoot, row.slug) !== null,
        updatedAt: row.updatedAt,
      }))
      return { proposals, generatedAt: new Date().toISOString(), proposalsRoot }
    },

    readProposalDoc(input: { readonly projectId: string; readonly slug: string; readonly kind: 'proposal' | 'eval' }): ProposalDoc {
      const proposalsRoot = requireProposalsRoot(input.projectId)
      const slug = input.slug
      if (!isSegment(slug)) {
        throw new ProposalDomainError(
          'ERR_PROPOSAL_PATH_INVALID',
          `proposal slug ${JSON.stringify(slug)} must be a single non-empty path segment (no '/', no path separators or control characters)`,
        )
      }
      const docPath = input.kind === 'proposal'
        ? join(proposalsRoot, slug, 'proposal.md')
        : join(proposalsRoot, slug, 'eval', evalReportOf(proposalsRoot, slug) ?? '')
      // 纵深防御(knowledge assertInsideBase 同款):段校验已排除分隔符,
      // 此处解析后包含性复核挡 `..` 等点段拼接逃逸 —— 拒绝形态 = 同码
      // PATH_INVALID(段形态/越界同属路径授权面)。
      const resolvedBase = resolve(proposalsRoot)
      const resolvedDoc = resolve(docPath)
      const basePrefix = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep
      if (!resolvedDoc.startsWith(basePrefix)) {
        throw new ProposalDomainError(
          'ERR_PROPOSAL_PATH_INVALID',
          `proposal slug ${JSON.stringify(slug)} must stay inside the proposals root ${resolvedBase} (got ${resolvedDoc})`,
        )
      }
      let markdown: string
      try {
        markdown = readFileSync(docPath, 'utf8')
      } catch (error) {
        throw new ProposalDomainError(
          'ERR_PROPOSAL_NOT_FOUND',
          input.kind === 'proposal'
            ? `proposal doc proposals/${slug}/proposal.md is unreadable (${String(error)})`
            : `proposal ${slug} has no eval report under proposals/${slug}/eval/ (no readable .md)`,
        )
      }
      return { kind: input.kind, markdown }
    },
  }
}
