// forge 工作区文档读域服务（plugin-spec 1.10 docs 域收编——core small-domains/docs.ts 迁入
// 改写：读域行为等价 + 摘要耦合解除）。定位：业务。ctx.forgeDocs 单法 read——纯读零写动词。
//
// 路径守卫（Hard Rule——安全边界，威胁 ① docRel 路径穿越诱导读仓外文件）——双锚兼容：
//   主锚   = canonical(forge_dir)/specs（Spec 文档新树——读写）
//   兼容锚 = canonical(forge_dir)/docs （旧树 proposals/features/roundtables 归档面——
//            只读在产可读，随 M5 目录树收敛退役——退役删一行锚表）
//   candidate = resolve(canonical(forge_dir), docRel) 必须严格位于任一锚之下（startsWith
//   (anchor + sep)——sep 纪律防同前缀目录误放行 `<forge>` vs `<forge>-x`）；越界（含
//   docRel 绝对路径/`..` 逃逸/指向 forge_dir 自身/锚外路径）一律 ERR_DOC_PATH_INVALID。
//
// 悬空态（守卫通过而文件不在场——stat 失败/非常规文件）：dangling 只读返回（content=''、
// canonicalPath=入参 docRel 原值）——不崩溃、不写入、不删行（spec_docs「db 行在、文件缺失」
// 存量态只读降级不报错，提案 §二裁定）。
//
// title 水化：title = 正文首个 H1 标题（缺省 undefined）——语义与收编前逐字保持。
// summary 恒缺省（摘要耦合解除）：feature_documents 注册面摘要依赖退役——DocContent.summary
// 字段保留（契约面不回退）但本读域不再水化。
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve as resolvePath, sep } from 'node:path'
import type { DocContent, ForgeDocsService } from '@dsh-forge/lib-api/dto/forge'
import { DocPathInvalidError } from './errors.js'

export interface DocsServiceDeps {
  /** projectId → forge_dir（中央 projects 行 forge_dir 列——装配层 routing 注入） */
  readonly resolveForgeDir: (projectId: string) => string
}

/** 守卫锚表（双锚兼容单点——M5 目录树收敛退役旧锚 = 删兼容锚行） */
const GUARD_ANCHOR_SEGMENTS = ['specs', 'docs'] as const

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

/** Interface 4：forge 文档读域服务面（ctx.forgeDocs——纯读） */
export function createDocsService(deps: DocsServiceDeps): ForgeDocsService {
  return {
    async read(q: { projectId: string; docRel: string }): Promise<DocContent> {
      const forgeDir = canonicalForgeDir(deps.resolveForgeDir(q.projectId))
      // 路径守卫：resolve 后必须严格位于任一锚之下（前缀 + 分隔符双条件）
      const candidate = resolvePath(forgeDir, q.docRel)
      const anchored = GUARD_ANCHOR_SEGMENTS.some((segment) => candidate.startsWith(join(forgeDir, segment) + sep))
      if (!anchored) {
        throw new DocPathInvalidError({ projectId: q.projectId, docRel: q.docRel, forgeDir })
      }
      // 悬空态判定：不可达 / 非常规文件 = 文档不在场（占位面，非错误）
      let isFile = false
      try {
        isFile = statSync(candidate).isFile()
      } catch {
        isFile = false
      }
      if (!isFile) {
        return { content: '', canonicalPath: q.docRel, dangling: true }
      }
      const content = readFileSync(candidate, 'utf-8')
      return { title: firstHeading(content), content, canonicalPath: candidate, dangling: false }
    },
  }
}
