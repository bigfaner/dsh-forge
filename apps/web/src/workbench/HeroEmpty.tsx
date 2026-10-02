// UF-2 首用 hero 空态（定位：装配——项目数 = 0 时中区引导相位，纯渲染件）。
// Hard Rule：hero 仅由项目数驱动（单一条件）——呈现判据在装配层 sessionZonePhase
// （正零才 hero；错误/在途 ≠ 0），本组件零判据；注册成功即永久让位（P1 无项目删除、
// archived 随行计数——计数不回落 0）。
// 官方件复用：CTA = 官方 Button（primary）；价值一句话 = 总纲产品定位（以知识资产为核心的
// 研发工作台）。data-dswf-hero / data-dswf-cta = e2e 与走查锚。
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import './workbench.css'

export interface HeroEmptyProps {
  /** 「＋添加项目」CTA（打开 UF-3 两段流程——openAddProjectFlow 缝；缺席 = 无动作） */
  readonly onAddProject?: () => void
}

/** hero 相位：价值一句话 + 「＋添加项目」CTA（中区居中——原型 hero 同构，视觉官方令牌） */
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
          data-dswf-cta="add-project"
          onClick={onAddProject}
        >
          ＋ 添加项目
        </Button>
      </div>
    </div>
  )
}
