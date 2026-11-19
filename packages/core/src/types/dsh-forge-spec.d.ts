// @dsh-forge/spec 出口形状锚（core 侧环境模块声明——plugin-spec 1.10 docs 域收编装配缝）。
// 为何 ambient：依赖方向倒挂消解——spec 包（经 project）依赖 core，core 装配行反向 import
// spec 即构成 tsconfig/构建序死锁（spec 需 project d.ts、project 需 core d.ts、core 需
// spec d.ts）。ambient 声明使 core 编译零读取 spec dist 类型（冷构建序无关）；运行期值
// 经 node_modules workspace 链接解析真实 bundle（dist/host/index.js——根 build 序内
// `pnpm -C plugins/spec build` 落盘）。
//
// 形状锚 = ForgeDocsService（contracts Interface 4）+ DocsServiceDeps 结构化最小面；
// 漂移守卫 = spec 包单测（plugins/spec/tests/docs——factory 真身契约面）。
declare module '@dsh-forge/spec' {
  /** docs 读域装配入参（routing 注入——projectId → forge_dir） */
  export interface DocsServiceDeps {
    readonly resolveForgeDir: (projectId: string) => string
  }
  /** Interface 4：forge 文档读域服务面（ctx.forgeDocs——纯读单法） */
  export interface SpecDocsServiceFace {
    read(q: { projectId: string; docRel: string }): Promise<{
      title?: string
      summary?: string
      content: string
      canonicalPath: string
      dangling: boolean
    }>
  }
  export function createDocsService(deps: DocsServiceDeps): SpecDocsServiceFace
}
