// 随包内置专家档案注册行（experts.registerRoot 装配面——builtin-redistribution）：
// 在场注册（真实随包 experts/ 目录 + 本包包名）/ 服务缺席 fail-soft + internal/service
// 迟到补偿 / 反射抛错 fail-soft。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { KNOWLEDGE_PACKAGE_NAME, registerBuiltinExpertsRoot } from '../host/index.js'

const expertsDir = fileURLToPath(new URL('../experts/', import.meta.url))

interface Registration {
  dir: string
  pluginName: string | undefined
}

function makeCtx(calls: Registration[], opts?: { brokenReflect?: boolean }) {
  return {
    reflect: {
      get(name: string): unknown {
        if (opts?.brokenReflect) throw new Error('boom')
        if (name !== 'experts') return undefined
        return {
          registerRoot(_ctx: unknown, dir: string, pluginName?: string): void {
            calls.push({ dir, pluginName })
          },
        }
      },
    },
  } as never
}

describe('registerBuiltinExpertsRoot（experts.registerRoot 装配行）', () => {
  it('experts 在场：以真实随包 experts/ 目录 + 本包包名注册一次', () => {
    const calls: Registration[] = []
    registerBuiltinExpertsRoot(makeCtx(calls))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.pluginName).toBe(KNOWLEDGE_PACKAGE_NAME)
    expect(existsSync(calls[0]!.dir)).toBe(true)
    expect(calls[0]!.dir).toBe(expertsDir)
  })

  it('experts 服务缺席（reflect.get 返回 undefined）：fail-soft 不抛', () => {
    expect(() =>
      registerBuiltinExpertsRoot({ reflect: { get: () => undefined } } as never),
    ).not.toThrow()
  })

  it('迟到补偿：experts 服务上场（internal/service 事件）→ 幂等补注册一次 + 监听摘除', () => {
    const calls: Registration[] = []
    const events: Array<{ level: string; message: string }> = []
    let listener: ((...args: unknown[]) => unknown) | undefined
    let expertsOnline = false
    const ctx = {
      reflect: {
        get(name: string): unknown {
          if (name !== 'experts' || !expertsOnline) return undefined
          return {
            registerRoot(_c: unknown, dir: string, pluginName?: string): void {
              calls.push({ dir, pluginName })
            },
          }
        },
      },
      on: (_event: string, cb: (...args: unknown[]) => unknown) => {
        listener = cb
        return () => {
          listener = undefined
        }
      },
      effect: () => {},
    }
    registerBuiltinExpertsRoot(ctx as never, (payload) =>
      events.push(payload as { level: string; message: string }),
    )
    expect(calls).toHaveLength(0) // apply 期缺席零注册
    expertsOnline = true
    listener?.('experts') // 服务上场事件
    expect(calls).toHaveLength(1)
    expect(calls[0]!.pluginName).toBe(KNOWLEDGE_PACKAGE_NAME)
    expect(existsSync(calls[0]!.dir)).toBe(true)
    listener?.('experts') // 二次事件零重复注册（幂等）
    listener?.('other-service') // 非 experts 服务零动作
    expect(calls).toHaveLength(1)
    expect(listener).toBeUndefined() // 补偿完成监听已摘除
    // 诊断面：缺席 warn 留痕 + 补偿注册 info 里程碑（AGENTS §7）
    expect(events.some((e) => e.level === 'warn' && e.message.includes('experts 服务缺席'))).toBe(true)
    expect(events.some((e) => e.level === 'info' && e.message.includes('迟到补偿'))).toBe(true)
  })

  it('reflect.get 抛错：fail-soft 不抛、零注册', () => {
    const calls: Registration[] = []
    expect(() => registerBuiltinExpertsRoot(makeCtx(calls, { brokenReflect: true }), () => {})).not.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('registerRoot 调用抛错：fail-soft 不抛', () => {
    expect(() =>
      registerBuiltinExpertsRoot(
        { reflect: { get: () => ({ registerRoot: () => { throw new Error('boom') } }) } } as never,
        () => {},
      ),
    ).not.toThrow()
  })

  it('reflect 面整体缺席：fail-soft 不抛', () => {
    expect(() => registerBuiltinExpertsRoot({} as never)).not.toThrow()
  })

  it('迟到补偿机械 pin（裁决①）：官方 cordis internal/service 事件核销落款在注册面注释', () => {
    const source = readFileSync(fileURLToPath(new URL('../host/index.ts', import.meta.url)), 'utf8')
    expect(source).toContain('internal/service')
    expect(source).toContain('补偿态（已注册/已终止布尔）是装配事实可缓存')
  })
})
