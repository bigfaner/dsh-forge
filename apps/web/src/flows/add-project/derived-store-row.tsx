// 注册表单任务清单派生行组件（定位：业务——UF-4 升级 Build 半身，3.11）。
// 数据纪律（tech-design Interface 5 单源 + Integration #1 + PRD UF-4）：
//   - Hard Rule：本组件禁自算路径——dir 值与错误载荷恒由 props 注入（RPC
//     forge:projects/deriveTaskStoreDir 下发；单源 = core derive-dir.ts deriveTaskStoreDir；
//     form-model 前端自算已废除——4.3 本件替换 RegisterForm 原派生行）。
//   - 三态（AC2）：loading（RPC 在途——骨架占位）/ ready（全路径值逐字呈现——AC1 禁截断
//     省略，ui-design v12 文件路径纪律 white-space normal + word-break break-all，样式在
//     form.css）/ suspected-move（ERR_SUSPECTED_MOVE → ErrorBar 错误条 + 手工指引文案
//     留场——guidance 单源 core SuspectedMoveData，本件零拼装零重试钮；恢复径 = 表单
//     「重新选择」重选目录复检，PRD UF-4 第 4 步，接线归 4.3）/ error（未映射失败 →
//     通用错误条兜底——4.3 接线增态：tech-design Propagation「未映射码 → 通用错误条」
//     永无裸 code 泄漏；非阻断确认位，注册闭包复检恒权威）。
// 错误文案复用 ErrorBar 形制（components/ErrorBar——onRetry 缺席 = 纯呈现面）；
// 骨架复用 SkeletonRows（单行）。样式归 form.css（dswf-dsr-* 域节——本域零样式散置）。
import type { ReactNode } from 'react'
import type { SuspectedMoveData } from '@dsh-forge/contracts'
import { ErrorBar, SkeletonRows } from '../../components/index.js'
import './form.css'

/**
 * 派生行相位（props 驱动——4.3 装配侧将 forge:projects/deriveTaskStoreDir RPC 结果经
 * derive-source fetchDerivePhase 喂入：成功 → ready(dir)；RpcClientError{code:
 * ERR_SUSPECTED_MOVE, data} → suspected-move(data)；在途/换选目录复检中 → loading；
 * 未映射失败（preload 缺席/服务未注册/畸形载荷）→ error(message) 通用兜底）。
 */
export type DerivedTaskStorePhase =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly dir: string }
  | { readonly state: 'suspected-move'; readonly data: SuspectedMoveData }
  | { readonly state: 'error'; readonly message: string }

export interface DerivedTaskStoreRowProps {
  /** 三态相位（单一数据源——本组件零本地推导零本地态） */
  readonly phase: DerivedTaskStorePhase
}

/** 行标签（沿 RegisterForm 既有派生行文案——全相位恒在场） */
const ROW_LABEL = '任务清单与记录（自动派生 · 无需填写）'

/**
 * 派生行纯渲染（相位互斥）：值/错误全部来自 props——全路径逐字呈现（AC1）与
 * 疑似移动手工指引留场（AC2）均为呈现面，无交互无重试（拒绝零副作用）；error 兜底 =
 * 通用错误条（前缀语本件拼好——ErrorBar 形制约定）。
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
      ) : phase.state === 'suspected-move' ? (
        <ErrorBar
          className="dswf-dsr-error"
          message={phase.data.guidance}
          retryClassName="dswf-dsr-retry"
          anchor="data-dswf-dsr-error"
          textClassName="dswf-dsr-error-text"
        />
      ) : (
        <ErrorBar
          className="dswf-dsr-error"
          message={`任务清单路径获取失败：${phase.message}`}
          retryClassName="dswf-dsr-retry"
          anchor="data-dswf-dsr-error"
          textClassName="dswf-dsr-error-text"
        />
      )}
    </div>
  )
}
