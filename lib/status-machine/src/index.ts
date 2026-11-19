// lib/status-machine —— 通用泛型状态机核心逻辑层（status-machine.md §1）。
// 纯逻辑：零 db import、零第三方状态机库、零运行时依赖。

/** 边元数据：守卫通用化的数据面。 */
export interface TransitionMeta {
  /** 完成确认边（completed 入边）标记——终审/验收动词单点守卫的数据源。 */
  humanOnly?: boolean
  /** 驳回/退回边标记——note 必填守卫的数据源。 */
  noteRequired?: boolean
}

/** 状态定义（工厂入参形状，const 断言友好；含逐边元数据）。 */
export interface StateDef<S extends string> {
  /** 可转变目标状态集合（声明式边表）。 */
  targets: readonly S[]
  /** 逐边元数据（按 target 声明 humanOnly/noteRequired）。 */
  edges?: Partial<Record<S, TransitionMeta>>
}

export interface StateMachineConfig<S extends string> {
  initial: S
  /** 判别键即属性键——编译期键封闭。 */
  states: { readonly [K in S]: StateDef<S> }
}

/** 状态对象（OO 面）：名 + 出口集合 + 方法。 */
export interface Status<S extends string> {
  /** 判别键（Discriminated union 判别面）。 */
  readonly name: S
  /** 可转变目标状态集合（属性即文档——边表可被测试直接对读）。 */
  readonly targets: readonly S[]
  /** 需求②的 OO 面直译。 */
  canTransitionTo(target: S): boolean
  /** 需求① OO 面直译（与机函数同义，双面并存因消费语境分立）。 */
  availableTransitions(): readonly S[]
  /** targets 空即终态。 */
  isTerminal(): boolean
  /** 全部出口边 humanOnly 且有出口。 */
  isHumanOnlyExit(): boolean
}

/** canTransition 出参：显式失败原因（不吞、不魔法值）。 */
export type TransitionCheck =
  | { ok: true; meta?: TransitionMeta }
  | { ok: false; reason: 'UNKNOWN_TARGET' | 'ILLEGAL_EDGE' | 'TERMINAL_SOURCE' }

/** 机函数（查询面，三 API 直译需求）。 */
export interface StateMachine<S extends string> {
  readonly initial: S
  /** 状态对象获取面（goalBoard 徽标消费）。 */
  status(name: S): Status<S>
  /** 需求①：当前态合法出口清单。 */
  availableTransitions(current: S): readonly S[]
  /** 需求②：含失败原因。 */
  canTransition(current: S, target: S): TransitionCheck
  /** 守卫取元数据面。 */
  edgeMeta(current: S, target: S): TransitionMeta | undefined
  /** 断言形态（抛 typed Error，替代 assertXxx 族）。 */
  assertTransition(current: S, target: S): void
}

/** 工厂：一次定义，构建期 fail-fast 校验，运行时 `Record + includes` 直查。 */
export function defineStateMachine<S extends string>(
  config: StateMachineConfig<S>,
): StateMachine<S> {
  const { initial, states } = config

  // 构建期一次性校验：states 键集 ⊇ 所有 targets 引用（悬空引用 → 工厂抛错，fail-fast）。
  for (const [name, def] of Object.entries(states) as [S, StateDef<S>][]) {
    for (const target of def.targets) {
      if (!(target in states)) {
        throw new Error(
          `status-machine: dangling target "${String(target)}" in state "${String(name)}" (state not defined)`,
        )
      }
    }
  }
  if (!(initial in states)) {
    throw new Error(`status-machine: initial "${String(initial)}" is not a defined state`)
  }

  // 每个 Status 实例为纯数据闭包（无状态、可安全共享/冻结）。
  const statuses = {} as { -readonly [K in S]: Status<S> }
  for (const [name, def] of Object.entries(states) as [S, StateDef<S>][]) {
    const { targets, edges } = def
    statuses[name] = Object.freeze({
      name,
      targets,
      canTransitionTo: (target: S): boolean => targets.includes(target),
      availableTransitions: (): readonly S[] => targets,
      isTerminal: (): boolean => targets.length === 0,
      isHumanOnlyExit: (): boolean =>
        targets.length > 0 && targets.every((t) => edges?.[t]?.humanOnly === true),
    })
  }

  const checkEdge = (current: S, target: S): TransitionCheck => {
    const source = statuses[current]
    if (source.targets.length === 0) return { ok: false, reason: 'TERMINAL_SOURCE' }
    if (!(target in states)) return { ok: false, reason: 'UNKNOWN_TARGET' }
    if (!source.targets.includes(target)) return { ok: false, reason: 'ILLEGAL_EDGE' }
    return { ok: true, meta: states[current].edges?.[target] }
  }

  return Object.freeze({
    initial,
    status: (name: S): Status<S> => statuses[name],
    availableTransitions: (current: S): readonly S[] => statuses[current].targets,
    canTransition: checkEdge,
    edgeMeta: (current: S, target: S): TransitionMeta | undefined =>
      states[current].edges?.[target],
    assertTransition: (current: S, target: S): void => {
      const check = checkEdge(current, target)
      if (!check.ok) {
        throw new Error(
          `status-machine: illegal transition ${String(current)} -> ${String(target)} (${check.reason})`,
        )
      }
    },
  })
}
