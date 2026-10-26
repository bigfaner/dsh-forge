// panel/styles —— 专家卡片网格样式（ui-design F1 已批原型 · DESIGN.md 令牌消费）。
// 经典 script 装载无 CSS 管道——ensurePanelStyles 以 <style data-dswf-expert-squad>
// 单例注入（幂等）。纪律：色/字/距零裸值，一律 var(--dsw-*) 令牌；刻度取官方排版
// 行高与圆角标尺（原型 10/14px → 最近令牌，先例 dispatch-panel.css 注记口径）。

/** 令牌刻度别名（读性——原型值 → 官方最近令牌映射的唯一注记点）。 */
const T = {
  gap8: "var(--dsw-radius-sm)", // 8
  pad12: "var(--dsw-radius-md)", // 12（原型 14 → 最近令牌）
  pad16: "var(--dsw-radius-lg)", // 16
  pad20: "var(--dsw-font-xs-13-line-height)", // 20
  lh14: "var(--dsw-font-xxxs-11-line-height)", // 14
  lh18: "var(--dsw-font-xxs-12-line-height)", // 18
  lh20: "var(--dsw-font-xs-13-line-height)", // 20
  r8: "var(--dsw-radius-sm)",
  r12: "var(--dsw-radius-md)",
  pill: "999px", // dsw-raw 官方 Tag 胶囊刻度同值
} as const;

/** 面板样式表（.dswf-* 自绘面前缀；双主题经 --dsw-alias 令牌自动切换）。 */
export const PANEL_CSS = `
.dswf-expert-panel { display: flex; flex-direction: column; min-height: 0; height: 100%; color: var(--dsw-alias-label-primary); }
.dswf-panel-header { display: flex; align-items: center; flex-wrap: wrap; gap: ${T.gap8}; padding: ${T.pad12} ${T.pad16}; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.dswf-panel-title { margin: 0; font: var(--dsw-font-l-20); font-weight: 500; }
.dswf-search { font: var(--dsw-font-xs-13); padding: 0 ${T.pad20}; height: ${T.lh20}; width: 170px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; }
.dswf-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dswf-search:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
/* 状态筛选 select（native select 基座 + dswf 令牌包装——官方 primitives 无同语义 Select） */
.dswf-status-select { font: var(--dsw-font-xs-13); padding: 0 ${T.gap8}; height: ${T.lh20}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); cursor: var(--dsh-cursor-pointer, pointer); outline: none; }
.dswf-status-select:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.dswf-btn { font: var(--dsw-font-xs-13); font-weight: 500; padding: 0 ${T.pad20}; height: ${T.lh20}; border: none; border-radius: ${T.r8}; cursor: var(--dsh-cursor-pointer, pointer); }
.dswf-btn-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-bg-base); }
.dswf-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.dswf-btn-ghost { background: transparent; color: var(--dsw-alias-label-secondary); border: 0.5px solid var(--dsw-alias-border-l2); }
.dswf-btn-ghost:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* 召唤钮独占右侧（用户裁决 2026-10-25：与状态筛选空间分离） */
.dswf-summon-btn { margin-left: auto; }
.dswf-card-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: ${T.pad12}; padding: ${T.pad12}; align-content: start; overflow: auto; min-height: 0; }
.dswf-xcard { display: flex; flex-direction: column; gap: ${T.gap8}; padding: ${T.pad12} ${T.pad16}; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r12}; cursor: var(--dsh-cursor-pointer, pointer); transition: box-shadow 0.2s var(--ds-ease-in-out); }
.dswf-xcard:hover { box-shadow: var(--dsw-elevation-soft); }
.dswf-xcard.off { opacity: 0.55; } /* dsw-raw 原型禁用卡降透明刻度 */
.xc-head { display: flex; align-items: center; gap: ${T.gap8}; }
.xc-name { font-size: var(--dsw-font-s-14-font-size); line-height: var(--dsw-font-s-14-line-height); font-weight: 500; }
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; } /* dsw-raw 原型状态灯点径刻度 */
.dot.on { background: var(--dsw-alias-state-success-primary); }
.dot.off { background: var(--dsw-alias-label-caption); }
.xc-title { font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); padding-left: 15px; } /* dsw-raw 灯后文本对齐缩进 */
.xc-creed { font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.xc-seg { font: var(--dsw-font-xxxs-11); line-height: ${T.lh14}; color: var(--dsw-alias-label-caption); }
.xc-tags { display: flex; gap: 6px; flex-wrap: wrap; } /* dsw-raw 原型 chips 间距刻度 */
.chip { font: var(--dsw-font-xxs-12); line-height: ${T.lh18}; height: 20px; padding: 0 ${T.pad20}; border-radius: ${T.pill}; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-interactive-bg-hover); }
.chip.tool { font-family: var(--ds-font-family-code); font-size: var(--dsw-font-xxs-12-font-size); }
.xc-foot { display: flex; justify-content: space-between; align-items: center; padding-top: ${T.gap8}; margin-top: 2px; border-top: 0.5px solid var(--dsw-alias-border-l2); font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-caption); }
.dswf-panel-footer { padding: ${T.gap8} ${T.pad16}; border-top: 0.5px solid var(--dsw-alias-border-l2); font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); }
.dswf-skeleton-card { height: 108px; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r12}; background: linear-gradient(90deg, transparent, var(--dsw-alias-interactive-bg-hover), transparent); background-size: 200% 100%; animation: dswf-xcard-sk 1.2s infinite; }
@keyframes dswf-xcard-sk { to { background-position: -200% 0; } }
.dswf-empty { grid-column: 1 / -1; text-align: center; padding: 56px 20px; color: var(--dsw-alias-label-secondary); }
.dswf-empty b { display: block; color: var(--dsw-alias-label-primary); font-size: var(--dsw-font-m-18-font-size); line-height: var(--dsw-font-m-18-line-height); font-weight: 500; margin-bottom: 6px; }
.dswf-errorbar { grid-column: 1 / -1; display: flex; align-items: center; gap: ${T.pad20}; padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r8}; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-state-error-primary); font: var(--dsw-font-xs-13); }
/* 详情 Dialog（ui-design F2：radius-lg 16 / lv3 阴影 / 宽 680 / max-height 88%） */
.dswf-dlg-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-mask, rgba(0,0,0,0.4)); z-index: 100; }
.dswf-dlg { position: relative; display: flex; flex-direction: column; width: 680px; max-width: calc(100vw - 32px); max-height: 88%; background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r12}; box-shadow: var(--dsw-elevation-strong, var(--dsw-elevation-soft)); color: var(--dsw-alias-label-primary); }
.dswf-dlg-head { display: flex; align-items: center; gap: ${T.gap8}; padding: ${T.pad16}; border-bottom: 0.5px solid var(--dsw-alias-border-l2); }
.dswf-dlg-name { font-size: var(--dsw-font-m-18-font-size); line-height: var(--dsw-font-m-18-line-height); font-weight: 500; }
.dswf-dlg-head-actions { margin-left: auto; display: flex; gap: ${T.gap8}; }
.dswf-dlg-body { flex: 1; overflow: auto; padding: ${T.pad16}; display: flex; flex-direction: column; gap: ${T.gap8}; min-height: 0; }
.dswf-dlg-meta { font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary); }
.dswf-dlg-seg { font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); margin-top: ${T.gap8}; }
.dswf-dlg-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.dswf-dlg-md { font: var(--dsw-font-s-14); line-height: var(--dsw-font-s-14-line-height); color: var(--dsw-alias-label-primary); }
.dswf-dlg-md ul { margin: 2px 0 2px 18px; padding: 0; }
.dswf-dlg-md-h { display: block; margin-top: ${T.gap8}; font-weight: 500; }
.dswf-dlg-md code { font-family: var(--ds-font-family-code); font-size: var(--dsw-font-xxs-12-font-size); background: var(--dsw-alias-interactive-bg-hover); border-radius: 4px; padding: 0 4px; }
.dswf-dlg-field { display: flex; flex-direction: column; gap: 6px; }
.dswf-dlg-field > label { font: var(--dsw-font-xxs-12); line-height: ${T.lh18}; color: var(--dsw-alias-label-caption); }
.dswf-dlg-input { font: var(--dsw-font-s-14); padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; }
.dswf-dlg-input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.dswf-dlg-textarea { font: var(--dsw-font-s-14); line-height: ${T.lh20}; padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; resize: none; overflow-y: auto; }
.dswf-dlg-textarea:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.dswf-dlg-err { font: var(--dsw-font-xxs-12); color: var(--dsw-alias-state-error-primary); }
.dswf-msel { position: relative; }
.dswf-msel-box { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-height: 32px; padding: 4px ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); cursor: var(--dsh-cursor-pointer, pointer); }
.dswf-msel-placeholder { font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-tertiary); }
.dswf-msel-caret { margin-left: auto; font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-tertiary); }
.dswf-msel-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10; max-height: 220px; overflow: auto; padding: ${T.gap8}; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r8}; background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-soft); }
.dswf-msel-row { display: flex; align-items: center; gap: ${T.gap8}; font: var(--dsw-font-xs-13); padding: 4px 0; cursor: var(--dsh-cursor-pointer, pointer); }
.dswf-msel-add input { width: 100%; font: var(--dsw-font-xs-13); padding: ${T.gap8}; margin-top: ${T.gap8}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; }
.dswf-toast { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); padding: ${T.gap8} ${T.pad16}; border-radius: ${T.r8}; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-2); font: var(--dsw-font-xs-13); white-space: nowrap; }
/* [召唤] 降级引导条（HR 预设被拒/会话打开失败/工作区锚缺席——明确引导，不炸面板） */
.dswf-summon-notice { margin: ${T.gap8} 0 0; padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary)); font: var(--dsw-font-xs-13); line-height: ${T.lh20}; }
/* ── 同键全层聚组（1.60 用户裁决：组容器 + 生效标 + 来源角标 + 差异对比） ── */
.dswf-xgroup { display: flex; flex-direction: column; gap: ${T.gap8}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r12}; padding: ${T.pad12}; }
.dswf-xgroup.multi { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 35%, transparent); }
.xg-head { display: flex; align-items: center; gap: ${T.gap8}; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); }
.xg-name { font: var(--dsw-font-xxs-12); font-weight: 500; color: var(--dsw-alias-label-secondary); font-family: var(--ds-font-family-code); }
.xg-spread { margin-left: auto; border: none; background: transparent; color: var(--dsw-alias-state-business-primary); font: var(--dsw-font-xxs-12); cursor: var(--dsh-cursor-pointer, pointer); padding: 0; }
.xg-spread:hover { text-decoration: underline; }
/* 来源角标（三态文案 项目/用户/内置；语义 alias 点色，色底经 color-mix 降饱和） */
.origin-badge { font: var(--dsw-font-xxxs-11); line-height: ${T.lh14}; padding: 0 6px; border-radius: 4px; margin-left: auto; white-space: nowrap; }
.origin-badge.origin-project { color: var(--dsw-alias-state-business-primary); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); }
.origin-badge.origin-user { color: var(--dsw-alias-state-warn-label); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); }
.origin-badge.origin-plugin { color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-interactive-bg-hover); }
/* 生效标（遮蔽胜出层——取用/编辑/启停语义附丽点） */
.eff-badge { font: var(--dsw-font-xxxs-11); line-height: ${T.lh14}; padding: 0 6px; border-radius: 4px; white-space: nowrap; color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); }
/* 被遮蔽卡折叠摘要行（只读——点击展开对比） */
.dswf-xshadow { display: flex; align-items: center; gap: ${T.gap8}; width: 100%; padding: ${T.gap8} ${T.pad12}; border: 0.5px dashed var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: transparent; color: var(--dsw-alias-label-secondary); font: var(--dsw-font-xxs-12); cursor: var(--dsh-cursor-pointer, pointer); text-align: left; }
.dswf-xshadow:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dswf-xshadow .origin-badge { margin-left: 0; }
.dswf-xshadow .xs-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dswf-xshadow .xs-updated { color: var(--dsw-alias-label-caption); flex: none; }
.dswf-xshadow .xs-mark { margin-left: auto; color: var(--dsw-alias-label-caption); flex: none; }
/* 展开对比视图（字段对齐表——差异格 warn 高亮） */
.dswf-xcompare { display: flex; flex-direction: column; gap: ${T.gap8}; padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); }
.cmp-table { width: 100%; border-collapse: collapse; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary); }
.cmp-table th, .cmp-table td { padding: 4px ${T.gap8}; border-bottom: 0.5px solid var(--dsw-alias-border-l2); text-align: left; vertical-align: top; }
.cmp-table th { font-weight: 400; color: var(--dsw-alias-label-caption); white-space: nowrap; }
.cmp-table td .chip { margin-right: 4px; }
.cmp-table td.diff { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); box-shadow: inset 2px 0 0 var(--dsw-alias-state-warn-primary); }
.cmp-note { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-caption); }
`;

/** 已注入标记（模块级单例——classic script 装载一次）。 */
let injected = false;

/**
 * 幂等注入面板样式（document 缺席 = 静默跳过——SSR/Node 测试面）。
 * 重复调用零副作用；卸载不回收（经典 script 插件生命周期 = 宿主页生命周期）。
 */
export function ensurePanelStyles(doc: Document | undefined = globalThis.document): void {
  if (injected || doc === undefined) return;
  const style = doc.createElement("style");
  style.setAttribute("data-dswf-expert-squad", "");
  style.textContent = PANEL_CSS;
  doc.head.appendChild(style);
  injected = true;
}
