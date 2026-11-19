import { describe, expect, it } from 'vitest'
import { defineStateMachine } from '../src/index.js'
import type { StateMachineConfig } from '../src/index.js'

// 测试机形态沿 status-machine.md §5 泛型机单测锚：直喂配置，零 db。
interface TestStates {
  draft: unknown
  reviewing: unknown
  done: unknown
}

const TEST_CONFIG: StateMachineConfig<keyof TestStates> = {
  initial: 'draft',
  states: {
    draft: {
      targets: ['reviewing', 'done'],
      edges: { done: { humanOnly: true }, reviewing: { noteRequired: true } },
    },
    reviewing: { targets: ['draft', 'done'], edges: { done: { humanOnly: true } } },
    done: { targets: [] },
  },
}

describe('defineStateMachine 三 API', () => {
  const machine = defineStateMachine(TEST_CONFIG)

  describe('availableTransitions', () => {
    it('合法出口清单直读边表', () => {
      expect(machine.availableTransitions('draft')).toEqual(['reviewing', 'done'])
      expect(machine.availableTransitions('done')).toEqual([])
    })
  })

  describe('canTransition 四分支', () => {
    it('合法边 ok:true + meta 透传', () => {
      expect(machine.canTransition('draft', 'done')).toEqual({
        ok: true,
        meta: { humanOnly: true },
      })
      expect(machine.canTransition('draft', 'reviewing')).toEqual({
        ok: true,
        meta: { noteRequired: true },
      })
      expect(machine.canTransition('reviewing', 'draft')).toEqual({ ok: true })
    })

    it('非法边 ILLEGAL_EDGE（非终态源、目标已定义但不在边表）', () => {
      expect(machine.canTransition('reviewing', 'reviewing')).toEqual({
        ok: false,
        reason: 'ILLEGAL_EDGE',
      })
    })

    it('未知目标 UNKNOWN_TARGET', () => {
      expect(machine.canTransition('draft', 'nonexistent' as keyof TestStates)).toEqual({
        ok: false,
        reason: 'UNKNOWN_TARGET',
      })
    })

    it('终态源 TERMINAL_SOURCE（completed 出口空，优先于非法边判定）', () => {
      expect(machine.canTransition('done', 'draft')).toEqual({
        ok: false,
        reason: 'TERMINAL_SOURCE',
      })
      expect(machine.canTransition('done', 'done')).toEqual({
        ok: false,
        reason: 'TERMINAL_SOURCE',
      })
    })
  })

  describe('assertTransition', () => {
    it('合法边不抛', () => {
      expect(() => machine.assertTransition('draft', 'done')).not.toThrow()
    })

    it('非法边抛 typed Error 携 reason 与 from/to', () => {
      expect(() => machine.assertTransition('reviewing', 'reviewing')).toThrowError(
        /illegal transition reviewing -> reviewing \(ILLEGAL_EDGE\)/,
      )
    })
  })

  describe('edgeMeta', () => {
    it('humanOnly 分支', () => {
      expect(machine.edgeMeta('reviewing', 'done')).toEqual({ humanOnly: true })
    })

    it('noteRequired 分支', () => {
      expect(machine.edgeMeta('draft', 'reviewing')).toEqual({ noteRequired: true })
    })

    it('无边元数据返回 undefined', () => {
      expect(machine.edgeMeta('reviewing', 'draft')).toBeUndefined()
    })
  })

  describe('status 状态对象方法集', () => {
    it('status(name) 返回具名状态对象', () => {
      const done = machine.status('done')
      expect(done.name).toBe('done')
      expect(done.targets).toEqual([])
    })

    it('canTransitionTo 真值表', () => {
      const draft = machine.status('draft')
      expect(draft.canTransitionTo('done')).toBe(true)
      expect(draft.canTransitionTo('nonexistent' as keyof TestStates)).toBe(false)
    })

    it('isTerminal 真值表', () => {
      expect(machine.status('done').isTerminal()).toBe(true)
      expect(machine.status('draft').isTerminal()).toBe(false)
    })

    it('isHumanOnlyExit 真值表（全部出口边 humanOnly）', () => {
      expect(machine.status('done').isHumanOnlyExit()).toBe(false) // 终态无出口
      expect(machine.status('reviewing').isHumanOnlyExit()).toBe(false) // 仅部分出口 humanOnly
      const humanOnlyMachine = defineStateMachine({
        initial: 'awaiting',
        states: {
          awaiting: { targets: ['done'], edges: { done: { humanOnly: true } } },
          done: { targets: [] },
        },
      })
      expect(humanOnlyMachine.status('awaiting').isHumanOnlyExit()).toBe(true)
    })

    it('availableTransitions 与机函数同义', () => {
      expect(machine.status('draft').availableTransitions()).toEqual(
        machine.availableTransitions('draft'),
      )
    })
  })

  describe('工厂悬空引用 fail-fast', () => {
    it('targets 指向未定义态 → 构建期抛错', () => {
      expect(() =>
        defineStateMachine({
          initial: 'a',
          states: { a: { targets: ['ghost' as 'a'] } },
        }),
      ).toThrowError(/ghost/)
    })

    it('initial 未在 states 中 → 构建期抛错', () => {
      expect(() =>
        defineStateMachine({
          initial: 'ghost' as 'a',
          states: { a: { targets: [] } },
        }),
      ).toThrowError(/initial/)
    })
  })
})
