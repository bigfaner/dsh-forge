// forge 工作区文档读域服务（任务 2.7；tech-design §Interface 4 单法 read——ctx.forgeDocs，
// 纯读零写动词）。定位：业务。三小域合并单目录承载（布局自由度注记——服务面四分是契约，
// 文件布局非契约）。
//
// 路径守卫（Hard Rule——安全边界，威胁 ① docRel 路径穿越诱导读仓外文件）：
//   candidate = resolve(canonical(forge_dir), docRel) 必须 startsWith(canonical(forge_dir) + sep)
//   ——越界（含 docRel 绝对路径/`..` 逃逸/指向 forge_dir 自身）一律 ERR_DOC_PATH_INVALID；
//   sep 纪律防同前缀目录误放行（`<forge>` vs `<forge>-x`）。
// 悬空态（SC-branch 容错）：守卫通过而文件不在场（stat 失败/非常规文件）→ dangling 只读
// 返回（content=''、canonicalPath=库内 rel_path 原值）——不崩溃、不写入、不删行（行稳定）。
//
// title/summary 水化：title = 正文首个 H1 标题（缺省 undefined）；summary = feature_documents
// 行 summary（按 rel_path 匹配——注册面登记的摘要，文件在场与否无关）。
// 一切 SQL prepared statements（Hard Rule）。
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve as resolvePath, sep } from 'node:path'
import type { DocContent, ForgeDocsService } from '@dsh-forge/contracts'
import type { ForgeWorkspaceStore } from '../workspace/store.js'
import { DocPathInvalidError } from './errors.js'

export interface DocsServiceDeps {
  /** 每工作区任务库惰性句柄（projectId → ensureOpen——summary 水化读注册面） */
  readonly store: ForgeWorkspaceStore
  /** projectId → forge_dir（中央 projects 行 forge_dir 列——装配层 routing 注入） */
  readonly resolveForgeDir: (projectId: string) => string
}

/** canonical(forge_dir)：可达则 realpath（磁盘真值拼写），缺席/不可达回退词法 resolve（悬空工作区容错） */
function canonicalForgeDir(dir: string): string {
  try {
    return realpathSync(dir)
  } catch {
    return resolvePath(dir)
  }
}

/** 正文首个 H1 标题（`# 标题`——markdown 惯例锚；无 H1 → undefined） */
function firstHeading(content: string): string | undefined {
  return content.match(/^#[ \t]+(\S.*?)[ \t]*$/m)?.[1]
}

/** 注册面 summary 水化（feature_documents.rel_path 命中行的非空摘要——多命中取字典序首行） */
function lookupSummary(db: ReturnType<ForgeWorkspaceStore['ensureOpen']>, docRel: string): string | undefined {
  const row = db
    .prepare<unknown[], { summary: string }>(
      `SELECT summary FROM feature_documents WHERE rel_path = ? AND summary IS NOT NULL
       ORDER BY feature_id, doc_kind LIMIT 1`,
    )
    .get(docRel)
  return row?.summary
}

/** Interface 4：core · forge 文档读域服务面（ctx.forgeDocs——纯读） */
export function createDocsService(deps: DocsServiceDeps): ForgeDocsService {
  return {
    async read(q: { projectId: string; docRel: string }): Promise<DocContent> {
      const db = deps.store.ensureOpen(q.projectId)
      const forgeDir = canonicalForgeDir(deps.resolveForgeDir(q.projectId))
      // 路径守卫：resolve 后必须严格位于 canonical(forge_dir) 之下（前缀 + 分隔符双条件）
      const candidate = resolvePath(forgeDir, q.docRel)
      if (!candidate.startsWith(forgeDir + sep)) {
        throw new DocPathInvalidError({ projectId: q.projectId, docRel: q.docRel, forgeDir })
      }
      const summary = lookupSummary(db, q.docRel)
      // 悬空态判定：不可达 / 非常规文件 = 文档不在场（占位面，非错误）
      let isFile = false
      try {
        isFile = statSync(candidate).isFile()
      } catch {
        isFile = false
      }
      if (!isFile) {
        return { summary, content: '', canonicalPath: q.docRel, dangling: true }
      }
      const content = readFileSync(candidate, 'utf-8')
      return { title: firstHeading(content), summary, content, canonicalPath: candidate, dangling: false }
    },
  }
}
