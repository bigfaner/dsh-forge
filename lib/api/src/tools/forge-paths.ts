// forge-paths 路径派生常量单源（plugin-spec 1.4 新落位）——Spec 文档落盘路径的唯一
// 派生源：{projectDir}/.forge/specs/{slug}/spec.md（提案 §五——进 git 活正本）。
// tool 面 doc_path 缺省派生与本常量同源，禁插件侧手写镜像字符串（漂移即机检红面）。

/** Spec 文档树根（相对项目检出根） */
export const SPEC_DOC_ROOT = '.forge/specs' as const

/** Spec 文档固定文件名 */
export const SPEC_DOC_FILE_NAME = 'spec.md' as const

/**
 * Spec 文档相对路径派生（单源）：`.forge/specs/{slug}/spec.md`。
 * slug 须非空且不含 `/` 与 `\`（路径段安全性守卫——越界即拒绝，零静默纠正）。
 */
export function specDocRelPath(slug: string): string {
  if (typeof slug !== 'string' || slug === '' || slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
    throw new Error(`specDocRelPath: illegal slug '${String(slug)}' — must be a non-empty path segment`)
  }
  return `${SPEC_DOC_ROOT}/${slug}/${SPEC_DOC_FILE_NAME}`
}
