// 注册面输出 schema ↔ 实际返回值形状对验（host oneOf 回执校验的仓内镜像——
// plugin-forge output-schemas.test.ts 同款锚的 spec 侧落地）。三动词均带失败支
// （withFailureVariant——typed 服务错误经 callToolFace 转失败 DTO 返回面），成功值与
// 失败 DTO 必须各命中其 output.schema 的一支。
import { describe, expect, it } from 'vitest'
import AjvModule from 'ajv'
import type { ForgeSpecToolDeps } from './index.js'
import { createRegisterFeatureTool } from './register-feature.js'
import { createUpsertFeatureDocTool } from './upsert-feature-doc.js'
import { createValidateFeatureTasksTool } from './validate-feature-tasks.js'

/** 工厂仅闭包 deps（执行期才用）——空壳即可读 output.schema */
const DEPS = {} as ForgeSpecToolDeps

/** ajv CJS 默认导出在 NodeNext+verbatimModuleSyntax 下的类型面窄化（运行时为类——已实证可构造） */
interface AjvErrorLike {
  instancePath: string
  message?: string
}
type ValidateFn = ((data: unknown) => boolean) & { errors?: AjvErrorLike[] | null }
const Ajv = AjvModule as unknown as new (options?: { allErrors?: boolean }) => {
  compile(schema: object): ValidateFn
}
const ajv = new Ajv({ allErrors: true })

function expectValid(label: string, schema: object, value: unknown): void {
  const validate = ajv.compile(schema)
  const ok = validate(value)
  const errors = (validate.errors ?? []).map((e: AjvErrorLike) => `${e.instancePath} ${e.message}`).join('; ')
  expect(ok, `${label} 值须命中 schema（ajv: ${errors}）`).toBe(true)
}

/** 失败 DTO 代表值（callToolFace 对 typed 服务错误的转写产物） */
const FAILURE_DTO = { ok: false, code: 'ERR_WORKSPACE_NOT_REGISTERED', message: 'cwd not bound to a registered project', violations: [] }

const FEATURE_ROW = {
  featureId: 'f-1',
  slug: 'md-mermaid-plugin',
  title: 'md-mermaid cordis 插件',
  featureStatus: 'tasks',
  summary: 's',
  proposalId: 'p-1',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T01:00:00.000Z',
}

const FEATURE_DOC_ROW = {
  featureId: 'f-1',
  docKind: 'tech-design',
  relPath: 'features/md-mermaid-plugin/design/tech-design.md',
  summary: 's',
  createdAt: '2026-10-14T00:00:00.000Z',
  updatedAt: '2026-10-14T01:00:00.000Z',
}

describe('注册面输出 schema ↔ 返回值形状对验（host oneOf 回执校验镜像）', () => {
  it('registerFeature：FeatureRow 全形 + 失败 DTO 双支', () => {
    const schema = createRegisterFeatureTool(DEPS).output.schema as object
    expectValid('registerFeature:success', schema, FEATURE_ROW)
    expectValid('registerFeature:failure', schema, FAILURE_DTO)
  })

  it('upsertFeatureDoc：FeatureDocumentRow 全形 + 失败 DTO 双支', () => {
    const schema = createUpsertFeatureDocTool(DEPS).output.schema as object
    expectValid('upsertFeatureDoc:success', schema, FEATURE_DOC_ROW)
    expectValid('upsertFeatureDoc:failure', schema, FAILURE_DTO)
  })

  it('validateFeatureTasks：ValidateReport（taskRef 两径）+ 失败 DTO 双支', () => {
    const schema = createValidateFeatureTasksTool(DEPS).output.schema as object
    expectValid('validateFeatureTasks:success', schema, {
      violations: [
        { kind: 'cycle', message: 'cycle: f/1.1 → f/1.2 → f/1.1' },
        { kind: 'stale', message: 'blocked with all prerequisites satisfied', taskRef: { slug: 'f', localId: '1.3' } },
      ],
      checked: { featureSlug: 'f', tasks: 3 },
    })
    expectValid('validateFeatureTasks:empty', schema, { violations: [], checked: { featureSlug: 'f', tasks: 0 } })
    expectValid('validateFeatureTasks:failure', schema, FAILURE_DTO)
  })
})
