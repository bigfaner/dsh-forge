// 视图态机 React 绑定（定位：基础）——zones 容器与壳视图态机的对接面（2.5）：
// useReducer 包装 view-state 纯转移表。装配（2.12）经本 hook 取态渲染 WorkbenchZones、
// 域事件经 dispatch 驱动（不直接改态——转移表语义 pin 于 view-state.test）。
import { useReducer } from 'react'
import {
  createShellViewState,
  dispatchShellView,
  type ShellViewEvent,
  type ShellViewState,
} from './view-state.js'

/** 视图事件分发面（转移表唯一入口） */
export type ShellViewDispatch = (event: ShellViewEvent) => void

/** 壳视图态 hook：[态, 分发]（初始态 = createShellViewState；派发语义见 view-state.ts 转移表） */
export function useShellView(): readonly [ShellViewState, ShellViewDispatch] {
  const [state, dispatch] = useReducer(dispatchShellView, undefined, () => createShellViewState())
  return [state, dispatch] as const
}
