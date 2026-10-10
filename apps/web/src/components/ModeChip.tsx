// ModeChip —— 模式溯源 chip（定位：基础——M3 UF-1 三态：远征（蓝点+「远征」）/ 突击（琥珀点+
// 「突击」）/ 未标记（中性不可点 + 悬停「扫描吸收的旧提案无溯源」））。有溯源且回调在场 =
// 可点快捷入口（同 ⋯ 菜单唯一正门不分叉——打开模式更改对话框 ProposalModeDialog）；
// 回调缺席 = 只读呈现（UF-4 feature 行「恒远征」只读消费面）。官方件无 mode chip 对应件
// ——自绘（行语言对齐 M2 自绘 chips；点色走 --dsw-alias 语义令牌：蓝 = business-primary /
// 琥珀 = warn-primary，ui-design M3 令牌映射表）。
// 纪律：components 零业务语义（tests/structure/web-shell pin：禁 RPC / contracts 引入）
// ——模式双值与标签本地字面量声明（与 contracts MODES 同词汇，结构兼容直喂 proposals.mode）。
import type { ReactNode } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'

/** 模式双值（contracts MODES 同词汇——基础层零 contracts 引入 pin 的本地声明面） */
export type ModeChipMode = 'expedition' | 'blitz'

/** 模式中文标签（mode chip 紧凑面：远征/突击；带说明版选项归 ProposalModeDialog） */
export const MODE_CHIP_LABELS: Readonly<Record<ModeChipMode, string>> = {
  expedition: '远征',
  blitz: '突击',
}

/** 未标记缺省占位文案（扫描吸收旧行 = proposals.mode NULL 键缺席） */
export const MODE_CHIP_UNMARKED_LABEL = '未标记'

/** 未标记悬停说明（ui-design UF-1 States「mode 缺省」行） */
export const MODE_CHIP_UNMARKED_TITLE = '扫描吸收的旧提案无溯源'

/** 可点态悬停说明（唯一正门不因快捷方式分叉——ui-design UF-1 mode chip 形态注记） */
export const MODE_CHIP_OPEN_TITLE = '打开模式更改对话框（同 ⋯ 菜单唯一正门）'

export interface ModeChipProps {
  /** 模式溯源（undefined = 未标记缺省占位——不可点 + 悬停说明） */
  readonly mode: ModeChipMode | undefined
  /** 模式更改快捷入口（在场且 mode 有值 = 可点；缺席 = 只读呈现） */
  readonly onOpenChangeMode?: () => void
  /** 布局类名（透传） */
  readonly className?: string
}

/** 模式溯源 chip（三态：远征蓝点 / 突击琥珀点 / 未标记中性不可点） */
export function ModeChip({ mode, onOpenChangeMode, className }: ModeChipProps): ReactNode {
  const unmarked = mode === undefined
  const clickable = !unmarked && onOpenChangeMode !== undefined
  const cls = ['dswf-mode-chip', unmarked ? 'is-unset' : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    // D30：原生 title 退役——悬停说明走官方 Tooltip（禁用态锚定 = dswf-tipwrap 包裹 span）
    <Tooltip
      label={
        unmarked
          ? MODE_CHIP_UNMARKED_TITLE
          : clickable
            ? MODE_CHIP_OPEN_TITLE
            : `模式溯源：${MODE_CHIP_LABELS[mode]}`
      }
      portal
    >
      <span className="dswf-tipwrap">
        <button
          type="button"
          className={cls}
          data-dswf-mode-chip={mode ?? 'unmarked'}
          disabled={!clickable}
          onClick={clickable ? onOpenChangeMode : undefined}
        >
          {unmarked ? null : <span className="dswf-mode-chip-dot" data-mode={mode} aria-hidden="true" />}
          <span className="dswf-mode-chip-label">
            {unmarked ? MODE_CHIP_UNMARKED_LABEL : MODE_CHIP_LABELS[mode]}
          </span>
        </button>
      </span>
    </Tooltip>
  )
}
