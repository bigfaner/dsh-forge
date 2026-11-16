// forge 工作区文档读域错误面（plugin-spec 1.10 docs 域收编——core small-domains/errors.ts
// DocPathInvalidError 同义本地化：插件包零 core 运行期依赖，错误形状/错误码/文案逐字保持）。

/** ERR_DOC_PATH_INVALID 附载（read 路径守卫拒绝面——威胁 ①） */
export interface DocPathInvalidData {
  readonly projectId: string
  readonly docRel: string
  /** 守卫基准（canonical(forge_dir)——诊断面；本机路径非敏感） */
  readonly forgeDir: string
}

/** read 路径越界（400）：resolve 后不落在任一守卫锚（specs 主锚 / docs 兼容锚）之下 */
export class DocPathInvalidError extends Error {
  readonly code = 'ERR_DOC_PATH_INVALID' as const
  readonly data: DocPathInvalidData

  constructor(data: DocPathInvalidData) {
    super(`文档路径越界拒绝：${data.docRel} 不在 forge 目录（${data.forgeDir}）内——ERR_DOC_PATH_INVALID`)
    this.name = 'DocPathInvalidError'
    this.data = data
  }
}
