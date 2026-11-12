// panel/expert-icon —— 专家个体图标（提案 expert-squad-forge-2 §2.2-9 用户裁决方案 D）：
// 官方 IconUserOutlineRegular + 官方 IconSparkleRegular 品牌蓝角标的双官方件组合
// （零自绘、零内联 SVG——DESIGN.md 图标纪律）。行内 16px 档 Sparkle 缩 8px 悬右肩；
// <14px 场景角标缩至不可辨即降级纯 User glyph。User 沿 currentColor 主题自适应，
// Sparkle 固定品牌蓝（--dsw-alias-state-business-primary 语义令牌，亮/暗双主题自适应）。
import type { ReactNode } from "react";
import { IconSparkleRegular, IconUserOutlineRegular } from "@deepseek-ai/dsh-client-ui-primitives";

/** Sparkle 角标呈现下界（<14px 降级纯 User glyph）。 */
const SPARKLE_BADGE_MIN_PX = 14;
/** Sparkle 角标尺寸（16px 行内档缩 8px）。 */
const SPARKLE_BADGE_SIZE_PX = 8;

/** 专家个体图标（User + Sparkle 双官方件组合；消费点 = 专家卡片头像位 / 详情 Dialog 标题）。 */
export function ExpertIcon({ size = 16 }: { readonly size?: number }): ReactNode {
  const px = size;
  if (px < SPARKLE_BADGE_MIN_PX) {
    return <IconUserOutlineRegular size={px} />;
  }
  return (
    <span
      data-dswf-expert-icon=""
      style={{ position: "relative", display: "inline-flex", width: px, height: px, flex: "none" }}
    >
      <IconUserOutlineRegular size={px} />
      <span
        data-dswf-expert-icon-sparkle=""
        aria-hidden={true}
        style={{
          position: "absolute",
          right: -(SPARKLE_BADGE_SIZE_PX / 2 + 1),
          top: -(SPARKLE_BADGE_SIZE_PX / 2 + 1),
          display: "inline-flex",
          lineHeight: 0,
          color: "var(--dsw-alias-state-business-primary)",
        }}
      >
        <IconSparkleRegular size={SPARKLE_BADGE_SIZE_PX} />
      </span>
    </span>
  );
}
