# host/docs — forge 工作区文档读域

定位：**业务**。`ctx.forgeDocs` 单法 `read`（纯读零写动词）——plugin-spec 1.10 自 core
small-domains 收编改写。

- 路径守卫双锚：`.forge/specs/` 主锚（Spec 文档新树）+ `.forge/docs/` 只读兼容锚（旧树
  proposals/features/roundtables 在产可读，随 M5 目录树收敛退役）；越界一律
  `ERR_DOC_PATH_INVALID`（`errors.ts` 本地错误面）。
- 悬空态：守卫通过而文件不在场 → dangling 只读返回（`spec_docs` 「db 行在、文件缺失」
  存量态只读降级不报错）。
- title 水化 = 正文首个 H1；summary 恒缺省（feature_documents 摘要耦合已解除）。

装配：装配层以 `createDocsService({ resolveForgeDir })` 组装并 provide `forgeDocs`
（包出口 `@dsh-forge/spec`）。测试锚 `tests/docs/`。
