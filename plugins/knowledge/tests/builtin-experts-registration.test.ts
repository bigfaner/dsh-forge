// 随包内置专家档案注册行（experts.registerRoot 装配面——builtin-redistribution）：
// 在场注册（真实随包 experts/ 目录 + 本包包名）/ 服务缺席 fail-soft / 反射抛错 fail-soft。
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
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
})
