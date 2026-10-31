// experts 服务双源契约对齐（proposal expert-squad-default-routing 1.18——architect 中危项收敛）：
// plugin-forge ExpertsServiceFace（faces.ts——消费侧结构收窄面，本插件不依赖 expert-squad）
// ↔ expert-squad ExpertsService/ExpertEntry（registry.ts——实现面）。两源已发生过一次同步
// 扩张（reasoning 位两处各加一遍），本测试以编译期 satisfies 断言收敛：
//   ① 实现面 ⊇ 消费面：ExpertsService satisfies ExpertsServiceFace（registerRoot ctx 参数
//      方法位双变相容；refresh 为可选缺席位）；
//   ② 消费面投影键 ⊆ 实现面条目：face get 返回形状每个键都在 ExpertEntry 上在场
//      （reasoning 位等同步字段被此向覆盖——单侧加/删/改键即 tsc 编译错，
//      lint:types / lint:test-types 门红）。
// 机械断言（type-only 直引两包源码，零依赖边、零运行时装配——两包互不依赖，不加依赖边）。
import type { ExpertsServiceFace } from '../../packages/plugin-forge/src/faces.js'
import type { ExpertEntry, ExpertsService } from '../../packages/plugins/expert-squad/src/registry.js'
import { describe, expect, it } from 'vitest'

/** ① 实现面可赋给消费面（漂移即编译错）——表达式位 satisfies（type-alias RHS 位 oxc 不解析） */
const expertsServiceSatisfiesFace = null as unknown as ExpertsService satisfies ExpertsServiceFace
export type ExpertsServiceSatisfiesFace = typeof expertsServiceSatisfiesFace

/** face get 返回投影形状（消费面窄化面） */
export type FaceProjection = ReturnType<ExpertsServiceFace['get']>

/** ② face 投影键都在实现面条目上在场（漂移即编译错） */
export type FaceProjectionKeysOnEntry = keyof FaceProjection extends keyof ExpertEntry ? true : false

/** face 投影键面机械枚举（字面量受 satisfies 约束——face 删键即编译错；内容由 it 断言给红面） */
export const FACE_PROJECTION_KEYS = [
  'name',
  'title',
  'personaMd',
  'tools',
  'model',
  'provider',
  'reasoning',
] as const satisfies readonly (keyof FaceProjection)[]

describe('experts 服务双源契约对齐（plugin-forge ExpertsServiceFace ↔ expert-squad ExpertsService）', () => {
  it('face 投影键面 = 七员（reasoning 位在覆盖内——任一侧漂移先编译错，本断言给运行期红面）', () => {
    expect([...FACE_PROJECTION_KEYS]).toEqual([
      'name',
      'title',
      'personaMd',
      'tools',
      'model',
      'provider',
      'reasoning',
    ])
  })

  it('编译期对齐断言在位（恒真位占位——漂移时 tsc 先红；satisfies 类型被本文件消费不落死代码）', () => {
    const svcSatisfiesFace = expertsServiceSatisfiesFace
    const keysOnEntry: FaceProjectionKeysOnEntry = true
    expect([svcSatisfiesFace, keysOnEntry]).toBeDefined()
  })
})
