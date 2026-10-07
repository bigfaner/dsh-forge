// 3.5 单测 —— tool 返回面双友好模板（裁决⑨）：formatOk（✓ 首行 + 键值行）/
// formatErr（✗ code + 人话 + 违规清单逐行）+ typed error 判别与违规行派生
//（contracts 结构化 data 载荷逐码：unmet/cycle/AC 清单/疑似移动指引）+
// callToolFace 分流（typed → 失败 DTO；无 code → 原样重抛 fail-loud）。
import { describe, expect, it } from 'vitest'
import {
  callToolFace,
  errorCodeOf,
  forgeToolFailureOf,
  formatFailure,
  formatOk,
  isForgeToolFailure,
  withFailureVariant,
} from './format.js'

/** core typed error 形状桩（跨 IPC 后以 code/data 承载——不依赖 core 类） */
function typedError(code: string, message: string, data?: unknown): Error {
  const e = new Error(message) as Error & { code: string; data?: unknown }
  e.code = code
  if (data !== undefined) e.data = data
  return e
}

describe('errorCodeOf（typed 判别——code ∈ ERROR_CODES）', () => {
  it('code 在册 → 判别命中；data 形状不限', () => {
    expect(errorCodeOf(typedError('ERR_TASK_NOT_FOUND', 'x'))).toBe('ERR_TASK_NOT_FOUND')
    expect(errorCodeOf(typedError('ERR_TEST_EVIDENCE_REQUIRED', 'x', { acceptanceCriteria: [] }))).toBe(
      'ERR_TEST_EVIDENCE_REQUIRED',
    )
  })

  it('无 code / code 不在册 / 非对象 → undefined（意外错误不吞）', () => {
    expect(errorCodeOf(new Error('plain'))).toBeUndefined()
    expect(errorCodeOf(typedError('ERR_NOT_A_REAL_CODE', 'x'))).toBeUndefined()
    expect(errorCodeOf('string')).toBeUndefined()
    expect(errorCodeOf(null)).toBeUndefined()
  })
})

describe('forgeToolFailureOf（违规清单逐码派生）', () => {
  it('ERR_DEPENDENCIES_UNMET → 前置未满足逐行（自然键 + 状态）', () => {
    const f = forgeToolFailureOf(
      typedError('ERR_DEPENDENCIES_UNMET', '前置依赖未满足：f1/2.1 pending——满足集 {completed, skipped}', {
        unmet: [
          { slug: 'f1', localId: '2.1', taskStatus: 'pending' },
          { slug: 'f1', localId: '2.3', taskStatus: 'blocked' },
        ],
      }),
    )
    expect(f.violations).toEqual(['unmet prerequisite: f1/2.1 [pending]', 'unmet prerequisite: f1/2.3 [blocked]'])
  })

  it('ERR_CYCLE_DETECTED → 环路径单行；ERR_TEST_EVIDENCE_REQUIRED → AC 清单逐行', () => {
    expect(
      forgeToolFailureOf(typedError('ERR_CYCLE_DETECTED', '环', { cycle: ['f/2.2', 'f/T', 'f/2.4', 'f/2.2'] })).violations,
    ).toEqual(['cycle: f/2.2 → f/T → f/2.4 → f/2.2'])
    expect(
      forgeToolFailureOf(
        typedError('ERR_TEST_EVIDENCE_REQUIRED', 'submitTask 缺测试证据：……', { acceptanceCriteria: ['AC1 全绿', 'AC2 快照'] }),
      ).violations,
    ).toEqual(['missing evidence for AC: AC1 全绿', 'missing evidence for AC: AC2 快照'])
  })

  it('ERR_SUSPECTED_MOVE → 孤儿目录/推导目录/手工指引三行', () => {
    const f = forgeToolFailureOf(
      typedError('ERR_SUSPECTED_MOVE', '注册碰撞同主体异 hash8', {
        existingDir: 'Z:\\tasks\\demo@aabbccdd',
        derivedDir: 'Z:\\tasks\\demo@11223344',
        guidance: '删除孤儿目录或改回原名',
      }),
    )
    expect(f.violations).toEqual([
      'existing orphan dir: Z:\\tasks\\demo@aabbccdd',
      'derived dir: Z:\\tasks\\demo@11223344',
      'guidance: 删除孤儿目录或改回原名',
    ])
  })

  it('无结构化载荷 → violations 空数组（键恒在场）', () => {
    const f = forgeToolFailureOf(typedError('ERR_PROPOSAL_NOT_FOUND', '未命中'))
    expect(f).toEqual({ ok: false, code: 'ERR_PROPOSAL_NOT_FOUND', message: '未命中', violations: [] })
  })

  it('非 typed 错误入参 → TypeError（fail-loud——调用方先经 errorCodeOf 判别）', () => {
    expect(() => forgeToolFailureOf(new Error('plain'))).toThrow(TypeError)
  })
})

describe('callToolFace（typed → 失败 DTO；意外错误原样重抛）', () => {
  it('成功值透传', async () => {
    await expect(callToolFace(async () => 42)).resolves.toBe(42)
  })

  it('typed 服务错误 → 失败 DTO（不抛）；重抛分支零触达', async () => {
    const out = await callToolFace(async () => {
      throw typedError('ERR_TASK_EXISTS', 'UNIQUE(slug, local_id) 冲突')
    })
    expect(isForgeToolFailure(out)).toBe(true)
    if (isForgeToolFailure(out)) expect(out.code).toBe('ERR_TASK_EXISTS')
  })

  it('无 code 意外错误 → 原样重抛（装配 bug 不静默转写）', async () => {
    const boom = new Error('assembly bug')
    await expect(callToolFace(async () => Promise.reject(boom))).rejects.toBe(boom)
  })
})

describe('formatOk / formatFailure（双友好文本形制）', () => {
  it('formatOk：首行 ✓ 动词结果 + 键值行', () => {
    expect(formatOk('Task f1/3.9 added', ['- taskId: t-1'])).toEqual([
      { type: 'text', text: '✓ Task f1/3.9 added\n- taskId: t-1' },
    ])
  })

  it('formatFailure：首行 ✗ code — 人话 + 违规清单逐行', () => {
    const text = formatFailure({
      ok: false,
      code: 'ERR_DEPENDENCIES_UNMET',
      message: '前置依赖未满足：f1/2.1 pending',
      violations: ['unmet prerequisite: f1/2.1 [pending]'],
    })[0]?.text
    expect(text).toBe('✗ ERR_DEPENDENCIES_UNMET — 前置依赖未满足：f1/2.1 pending\nunmet prerequisite: f1/2.1 [pending]')
  })

  it('formatFailure：多段消息整段保留（首段上首行，余段成行）', () => {
    const text = formatFailure({
      ok: false,
      code: 'ERR_TEST_EVIDENCE_REQUIRED',
      message: 'submitTask 缺测试证据：验收清单（逐条补证据后重新提交）：\n- AC1\n- AC2',
      violations: ['missing evidence for AC: AC1'],
    })[0]?.text
    expect(text).toBe(
      '✗ ERR_TEST_EVIDENCE_REQUIRED — submitTask 缺测试证据：验收清单（逐条补证据后重新提交）：\n- AC1\n- AC2\nmissing evidence for AC: AC1',
    )
  })
})

describe('withFailureVariant（注册面输出 schema 双支）', () => {
  it('成功 schema → oneOf [成功, 失败]（失败支四键 required）', () => {
    const success = { type: 'object' as const, properties: { taskId: { type: 'string' as const } }, required: ['taskId'] }
    const schema = withFailureVariant(success)
    expect(schema.oneOf[0]).toBe(success)
    expect(schema.oneOf[1].required).toEqual(['ok', 'code', 'message', 'violations'])
  })
})

describe('isForgeToolFailure（render 分支判别）', () => {
  it('ok:false + code/message 串 → 命中；其余形态拒', () => {
    expect(isForgeToolFailure({ ok: false, code: 'ERR_TASK_NOT_FOUND', message: 'x', violations: [] })).toBe(true)
    expect(isForgeToolFailure({ taskId: 't-1' })).toBe(false)
    expect(isForgeToolFailure({ ok: true, code: 'ERR_TASK_NOT_FOUND', message: 'x' })).toBe(false)
    expect(isForgeToolFailure(null)).toBe(false)
  })
})


// ─────────────────────────── 3.4 callToolFace onTypedError 钩子 ───────────────────────────

describe('callToolFace onTypedError（tool-error 发射唯一挂点）', () => {
  it('typed 错误 → 回调一次（失败 DTO）→ 返回 DTO；无 code 错误不回调；回调异常不影响返回面', async () => {
    const seen: string[] = []
    const typed = Object.assign(new Error('m'), { code: 'ERR_TASK_NOT_FOUND' })
    const out1 = await callToolFace(
      async () => {
        throw typed
      },
      (f) => seen.push(f.code),
    )
    expect(out1).toMatchObject({ ok: false, code: 'ERR_TASK_NOT_FOUND' })
    expect(seen).toEqual(['ERR_TASK_NOT_FOUND'])
    // 无 code：原样重抛（fail-loud），零回调
    await expect(
      callToolFace(
        async () => {
          throw new Error('plain')
        },
        (f) => seen.push(f.code),
      ),
    ).rejects.toThrow(/plain/)
    // 回调自身异常：吞没——失败 DTO 照常返回
    const out2 = await callToolFace(
      async () => {
        throw typed
      },
      () => {
        throw new Error('emit broken')
      },
    )
    expect(out2).toMatchObject({ ok: false, code: 'ERR_TASK_NOT_FOUND' })
  })

  it('成功路径零回调', async () => {
    const seen: string[] = []
    const out = await callToolFace(async () => 'ok', (f) => seen.push(f.code))
    expect(out).toBe('ok')
    expect(seen).toEqual([])
  })
})
