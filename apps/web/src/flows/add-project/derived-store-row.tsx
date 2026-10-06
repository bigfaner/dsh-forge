// 注册表单任务清单派生行组件（定位：业务——UF-4 升级 Build 半身，3.11）。
// 数据纪律（tech-design Interface 5 单源 + Integration #1 + PRD UF-4）：
//   - Hard Rule：本组件禁自算路径——dir 值与错误载荷恒由 props 注入（RPC
//     forge:projects/deriveTaskStoreDir 下发；单源 = core derive-dir.ts deriveTaskStoreDir，
//     form-model 前端自算 4.3 起废除——本件为替换件，RegisterForm L219-223 行替换归 4.3）。
//   - 三态（AC2）：loading（RPC 在途——骨架占位）/ ready（全路径值逐字呈现——AC1 禁截断
//     省略，ui-design v12 文件路径纪律 white-space normal + word-break break-all，样式在
//     form.css）/ suspected-move（ERR_SUSPECTED_MOVE → ErrorBar 错误条 + 手工指引文案
//     留场——guidance 单源 core SuspectedMoveData，本件零拼装零重试钮；恢复径 = 表单
//     「重新选择」重选目录复检，PRD UF-4 第 4 步，接线归 4.3）。
// 错误文案复用 ErrorBar 形制（components/ErrorBar——onRetry 缺席 = 纯呈现面）；
// 骨架复用 SkeletonRows（单行）。样式归 form.css（dswf-dsr-* 域节——本域零样式散置）。
import type { ReactNode } from 'react'
import type { SuspectedMoveData } from '@dsh-forge/contracts'
import { ErrorBar, SkeletonRows } from '../../components/index.js'
import './form.css'

/**
 * 派生行三态相位（props 驱动——4.3 装配侧将 forge:projects/deriveTaskStoreDir RPC
 * 结果喂入：成功 → ready(dir)；RpcClientError{code: ERR_SUSPECTED_MOVE, data} →
 * suspected-move(data)；在途/换选目录复检中 → loading）。
 */
export type DerivedTaskStorePhase =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly dir: string }
  | { readonly state: 'suspected-move'; readonly data: SuspectedMoveData }

export interface DerivedTaskStoreRowProps {
  /** 三态相位（单一数据源——本组件零本地推导零本地态） */
  readonly phase: DerivedTaskStorePhase
}

/** 行标签（沿 RegisterForm 既有派生行文案——三态恒在场） */
const ROW_LABEL = '任务清单与记录（自动派生 · 无需填写）'

/**
 * 派生行纯渲染（三态互斥）：值/错误全部来自 props——全路径逐字呈现（AC1）与
 * 疑似移动手工指引留场（AC2）均为呈现面，无交互无重试（拒绝零副作用）。
 */
export function DerivedTaskStoreRow({ phase }: DerivedTaskStoreRowProps): ReactNode {
  return (
    <div className="dswf-dsr" data-dswf-dsr={phase.state}>
      <div className="dswf-dsr-label">{ROW_LABEL}</div>
      {phase.state === 'loading' ? (
        <SkeletonRows
          className="dswf-dsr-skeleton"
          rowClassName="dswf-dsr-skeleton-row"
          rows={1}
          anchor="data-dswf-dsr-skeleton"
        />
      ) : phase.state === 'ready' ? (
        <div className="dswf-dsr-value" data-dswf-dsr-dir="">
          {phase.dir}
        </div>
      ) : (
        <ErrorBar
          className="dswf-dsr-error"
          message={phase.data.guidance}
          retryClassName="dswf-dsr-retry"
          anchor="data-dswf-dsr-error"
          textClassName="dswf-dsr-error-text"
        />
      )}
    </div>
  )
}
