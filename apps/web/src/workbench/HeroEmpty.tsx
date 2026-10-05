// UF-2 首用 hero 空态（定位：装配——项目数 = 0 时中区引导相位，纯渲染件）。
// Hard Rule：hero 仅由项目数驱动（单一条件）——呈现判据在装配层 sessionZonePhase
// （正零才 hero；错误/在途 ≠ 0），本组件零判据；注册成功即永久让位（P1 无项目删除、
// archived 随行计数——计数不回落 0）。
// 官方件复用：CTA = 官方 Button（primary）；价值一句话 = 总纲产品定位（以知识资产为核心的
// 研发工作台）。data-dswf-hero / data-dswf-cta = e2e 与走查锚。
// 「鲸游书海」hero 插画沉底（docs/brand/whale-book-sea-bg.svg 母版 → public/brand/
// whale-hero-bg.svg 零改拷贝）：装饰性（alt 空 + aria-hidden 不进无障碍树、
// pointer-events:none 不截 CTA 命中）；文本靠顶 + 顶部遮罩渐隐刻度见 workbench.css
// .dswf-hero-bg（原型零遮挡验证构图）。
import type { ReactNode } from 'react'
import { Button, IconProjectAddOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import './workbench.css'

export interface HeroEmptyProps {
  /** 「添加项目」CTA（打开 UF-3 两段流程——openAddProjectFlow 缝；缺席 = 无动作） */
  readonly onAddProject?: () => void
}

/** hero 相位：价值一句话 + 「添加项目」CTA（文本靠顶 + 插画沉底——原型 hero 同构，
 * 视觉官方令牌；fix-17：文本前缀 ％＋ 改官方 icon 位 = IconProjectAddOutlineRegular——
 * 侧栏 ＋ 钮同款官方件，口径对齐；锚 data-dswf-cta 不动） */
export function HeroEmpty({ onAddProject }: HeroEmptyProps): ReactNode {
  return (
    <div className="dswf-hero" data-dswf-hero="">
      <h1 className="dswf-hero-title">以知识资产为核心的研发工作台</h1>
      <p className="dswf-hero-sub">
        注册你的代码项目，开始真实 dsh 会话——知识随会话沉淀、召回、复用。
      </p>
      <div className="dswf-hero-actions">
        <Button
          variant="primary"
          size="md"
          className="dswf-hero-cta"
          icon={<IconProjectAddOutlineRegular />}
          data-dswf-cta="add-project"
          onClick={onAddProject}
        >
          添加项目
        </Button>
      </div>
      <img className="dswf-hero-bg" src="/brand/whale-hero-bg.svg" alt="" aria-hidden="true" />
    </div>
  )
}
