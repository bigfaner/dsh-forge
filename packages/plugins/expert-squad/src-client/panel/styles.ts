// panel/styles —— 专家卡片网格样式（ui-design F1 已批原型 · DESIGN.md 令牌消费）。
// 经典 script 装载无 CSS 管道——ensurePanelStyles 以 <style data-dswf-expert-squad>
// 单例注入（幂等）。纪律：色/字/距零裸值，一律 var(--dsw-*) 令牌；刻度取官方排版
// 行高与圆角标尺（原型 10/14px → 最近令牌，先例 dispatch-panel.css 注记口径）。

import { MSEL_MENU_MAX_PX } from "./detail-logic.js";

/** 令牌刻度别名（读性——原型值 → 官方最近令牌映射的唯一注记点）。
 *  口径注记（bug 13f807c4④）：行高刻度（20/22/24/28px）为 DESIGN.md 间距纪律明文
 *  （「纵向刻度取排版令牌行高，不自创平行体系」）；间距语义（gap/pad 前缀）映射到
 *  圆角令牌（8/12/16px）为本插件既定实践（先例 dispatch-panel.css 注记口径）——
 *  DESIGN.md 未明文圆角间距刻度，官方主题无间距标尺令牌，不引入平行间距体系。 */
const T = {
  gap8: "var(--dsw-radius-sm)", // 间距 8（圆角令牌承担标尺）
  pad12: "var(--dsw-radius-md)", // 间距 12（原型 14 → 最近令牌）
  pad16: "var(--dsw-radius-lg)", // 间距 16
  pad20: "var(--dsw-font-xs-13-line-height)", // 间距 20（行高令牌承担标尺）
  lh14: "var(--dsw-font-xxxs-11-line-height)", // 行高 14
  lh18: "var(--dsw-font-xxs-12-line-height)", // 行高 18
  lh20: "var(--dsw-font-xs-13-line-height)", // 行高 20（与 pad20 同令牌：一为行高一为间距/控件高度，语义分名）
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
/* 筛选单选下拉（native select 退役——面板内 msel 视觉词汇统一承载，风格统一裁决 2026-10-26；
   交互四加固复用 msel 单点：先测量隐藏 / 视口封顶 / 等值短路 / 锚定跟随） */
.dswf-select { position: relative; }
.dswf-select-box { font: var(--dsw-font-xs-13); display: inline-flex; align-items: center; gap: 6px; padding: 0 ${T.gap8}; height: ${T.lh20}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); cursor: var(--dsh-cursor-pointer, pointer); outline: none; }
.dswf-select-box:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
.dswf-select-caret { font-size: 10px; color: var(--dsw-alias-label-caption); }
.dswf-select-menu { position: fixed; z-index: 30; display: flex; flex-direction: column; padding: 4px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-soft); overflow: auto; } /* 宽度由 placement 内联注入（= 触发框宽）——fixed 下 min-width:100% 相对视口解析会把菜单撑满整窗（缺陷退役） */
.dswf-select-option { font: var(--dsw-font-xs-13); text-align: left; padding: 4px ${T.gap8}; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-primary); cursor: var(--dsh-cursor-pointer, pointer); white-space: nowrap; }
.dswf-select-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dswf-select-option.sel { color: var(--dsw-alias-state-business-primary); font-weight: 500; }
/* dswf-tip 悬浮全文提示（DESIGN Tooltip 令牌——深色气泡；原生 title 退役，风格统一裁决 2026-10-26） */
.dswf-tip { position: relative; }
.dswf-tip::after { content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); display: none; padding: 4px ${T.gap8}; border-radius: 6px; background: var(--dsw-alias-tooltip-bg); color: #fff; font: var(--dsw-font-xxxs-11); line-height: ${T.lh14}; white-space: nowrap; pointer-events: none; z-index: 40; }
.dswf-tip:hover::after { display: block; }
.dswf-btn { font: var(--dsw-font-xs-13); font-weight: 500; padding: 0 ${T.pad20}; height: ${T.lh20}; border: none; border-radius: ${T.r8}; cursor: var(--dsh-cursor-pointer, pointer); }
.dswf-btn-primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-bg-base); }
.dswf-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.dswf-btn-ghost { background: transparent; color: var(--dsw-alias-label-secondary); border: 0.5px solid var(--dsw-alias-border-l2); }
.dswf-btn-ghost:hover { background: var(--dsw-alias-interactive-bg-hover); }
/* 召唤钮独占右侧（用户裁决 2026-10-25：与状态筛选空间分离） */
.dswf-summon-btn { margin-left: auto; }
/* 筛选 select label（1.68 裁决④：「状态」「来源」左置，与搜索框同行排布） */
.dswf-filter-label { font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary); }
.dswf-card-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: ${T.pad12}; padding: ${T.pad12}; align-content: start; overflow: auto; min-height: 0; }
.dswf-xcard { display: flex; flex-direction: column; gap: ${T.gap8}; padding: ${T.pad12} ${T.pad16}; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r12}; cursor: var(--dsh-cursor-pointer, pointer); transition: box-shadow 0.2s var(--ds-ease-in-out); }
.dswf-xcard:hover { box-shadow: var(--dsw-elevation-soft); }
.dswf-xcard.off { opacity: 0.55; } /* dsw-raw 原型禁用卡降透明刻度 */
.xc-head { display: flex; align-items: center; gap: ${T.gap8}; }
.xc-name { font-size: var(--dsw-font-s-14-font-size); line-height: var(--dsw-font-s-14-line-height); font-weight: 500; white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; } /* 1.68 裁决：主标识单行——不换行 + 截断省略 */
.xc-head .chip.tool { white-space: nowrap; min-width: 0; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; } /* 可收缩：超长键截断不顶破卡面 */
.dot { width: 7px; height: 7px; border-radius: 50%; flex: none; } /* dsw-raw 原型状态灯点径刻度 */
.dot.on { background: var(--dsw-alias-state-success-primary); }
.dot.off { background: var(--dsw-alias-label-caption); }
.xc-title { font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); padding-left: 15px; } /* dsw-raw 灯后文本对齐缩进 */
/* 卡头右侧组（对比钮 + 来源 chip，间距 10px、统一靠右）；来源下拉（chip 向下扩展列全来源） */
.xc-head-right { margin-left: auto; display: flex; align-items: center; gap: 10px; flex: none; position: relative; }
.xc-head-right > .origin-badge { margin-left: 0; }
/* 单/多来源同款：按钮元素默认 chrome 复位，样式 = 静态 origin-badge（差异仅 multi 的 caret） */
.xc-head-right > button.origin-badge { border: none; padding: 0 6px; line-height: ${T.lh14}; white-space: nowrap; cursor: var(--dsh-cursor-pointer, pointer); }
.xc-cmp-btn { flex: none; font: var(--dsw-font-xxs-12); padding: 2px ${T.gap8}; }
.xc-origin-caret { font-size: 10px; margin-left: 2px; }
.xc-origin-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 30; min-width: 240px; padding: 4px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-soft); display: flex; flex-direction: column; gap: 2px; } /* chip 原地向下展开（锚 = xc-head-right）；溢出视口下缘时组件侧 scrollIntoView nearest 最小滚动带入 */
.xc-origin-opt { display: flex; align-items: center; gap: ${T.gap8}; padding: 4px ${T.gap8}; border: none; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-secondary); font: var(--dsw-font-xxs-12); cursor: var(--dsh-cursor-pointer, pointer); text-align: left; }
.xc-origin-opt:hover { background: var(--dsw-alias-interactive-bg-hover); }
.xc-origin-opt.sel { color: var(--dsw-alias-state-business-primary); font-weight: 500; }
.xc-origin-opt .origin-badge { margin-left: 0; flex: none; }
.xc-origin-opt-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xc-origin-opt-date { margin-left: auto; color: var(--dsw-alias-label-caption); font: var(--dsw-font-xxxs-11); flex: none; }
.xc-title-row { display: flex; align-items: center; gap: ${T.gap8}; }
.xc-title-row > .xc-title { flex: 1; }
.xc-title-row > .chip { flex: none; }
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
/* 详情 Dialog（ui-design F2：radius-lg 16 / lv3 阴影 / 宽 860 / max-height 92%）；
   可拖动（头部 pointer 拖拽，位移落 transform）+ 可拉伸（CSS resize both——右下角手柄，
   宽高上下限钳制；overflow 非 visible 为 resize 生效前提，内部滚动由 body 承担） */
.dswf-dlg-overlay { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-mask, rgba(0,0,0,0.4)); z-index: 100; }
.dswf-dlg { position: relative; display: flex; flex-direction: column; width: 860px; min-width: 480px; max-width: calc(100vw - 32px); height: auto; min-height: 320px; max-height: 92%; resize: both; overflow: auto; background: var(--dsw-alias-bg-layer-2); border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r12}; box-shadow: var(--dsw-elevation-strong, var(--dsw-elevation-soft)); color: var(--dsw-alias-label-primary); }
/* 头部（1.67 裁决：列布局——标识行 + 来源行；唯一分隔线在头部容器底，无双线）；
   拖拽把手（pointer 事件在组件侧——按钮区命中不启动拖拽，光标 move 提示可拖） */
.dswf-dlg-head { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: ${T.pad16}; border-bottom: 0.5px solid var(--dsw-alias-border-l2); cursor: move; touch-action: none; user-select: none; } /* dsw-raw 原型行距刻度（与 .xc-tags 6px 同值同形制） */
.dswf-dlg-head-row { display: flex; align-items: center; gap: ${T.gap8}; }
.dswf-dlg-name { font-size: var(--dsw-font-m-18-font-size); line-height: var(--dsw-font-m-18-line-height); font-weight: 500; }
.dswf-dlg-head-actions { margin-left: auto; display: flex; gap: ${T.gap8}; }
/* 派发路由 chips（详情态右上角——provider·model 双 chip / 继承父Agent 弱化 chip） */
/* body 首行（岗位 meta 居左 + 派发路由 chips 靠右） */
.dswf-dlg-lead { display: flex; align-items: center; gap: ${T.gap8}; }
.dswf-dlg-lead > .dswf-dlg-meta { flex: 1; }
.dswf-dlg-route-chips { display: flex; gap: 6px; align-items: center; flex: none; }
.dswf-chip-muted { color: var(--dsw-alias-label-caption); }
.dswf-dlg-body { flex: 1; overflow: auto; padding: ${T.pad16}; display: flex; flex-direction: column; gap: ${T.gap8}; min-height: 0; }
.dswf-dlg-meta { font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary); white-space: pre-wrap; } /* 简介/归一后可含真实换行（bug b29f77e7） */
.dswf-dlg-seg { font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); margin-top: ${T.gap8}; }
.dswf-dlg-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.dswf-dlg-md { font: var(--dsw-font-s-14); line-height: var(--dsw-font-s-14-line-height); color: var(--dsw-alias-label-primary); }
.dswf-dlg-md ul { margin: 2px 0 2px 18px; padding: 0; }
.dswf-dlg-md-h { display: block; margin-top: ${T.gap8}; font-weight: 500; }
/* 人设 GFM 管道表格（官方语义：th 弱化色 + 单元格行分隔线 + 行内代码底） */
/* 人设 GFM 管道表格——经典 md 表格风格（GitHub 同款）：全文浅格线、表头加粗同文色、
   无底色填充——与正文一体，不做 UI 数据表形态 */
.dswf-dlg-md .md-table-wrap { margin: ${T.gap8} 0; }
/* 尽量不换行 = 表格收敛内容宽（短内容零折行、居中）；超出容器宽（max-width 封顶）
   才自然折行——永不出现横向滚动条 */
.dswf-dlg-md .md-table { width: auto; max-width: 100%; border-collapse: collapse; font: var(--dsw-font-s-14); line-height: ${T.lh20}; color: var(--dsw-alias-label-primary); margin: 0 auto; display: table; }
.dswf-dlg-md .md-table th, .dswf-dlg-md .md-table td { padding: 6px 13px; border: 0.5px solid var(--dsw-alias-border-l2); text-align: left; vertical-align: top; }
.dswf-dlg-md .md-table th { font-weight: 500; white-space: nowrap; } /* 表头短语不折行（长度有限，无横滚风险） */
.dswf-dlg-md .md-table thead tr { background: var(--dsw-alias-interactive-bg-hover); }
.dswf-dlg-md .md-table code { font-family: var(--ds-font-family-code); font-size: var(--dsw-font-xxs-12-font-size); background: var(--dsw-alias-interactive-bg-hover); border-radius: 4px; padding: 0 4px; }
.dswf-dlg-md code { font-family: var(--ds-font-family-code); font-size: var(--dsw-font-xxs-12-font-size); background: var(--dsw-alias-interactive-bg-hover); border-radius: 4px; padding: 0 4px; }
/* 围栏代码块（官方 .md-code-block 结构镜像——bug b29f77e7；mermaid fence 由全局增强器出图后隐藏原块，figure 样式随包 docs.css .dswf-doc-mermaid 族） */
.dswf-dlg-md .md-code-block { margin: ${T.gap8} 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); overflow: hidden; }
.dswf-dlg-md .md-code-block pre { margin: 0; padding: ${T.gap8} ${T.pad12}; overflow-x: auto; font-family: var(--ds-font-family-code); font-size: var(--dsw-font-xxs-12-font-size); line-height: ${T.lh18}; }
.dswf-dlg-md .md-code-block pre code { background: none; padding: 0; border-radius: 0; font-size: inherit; }
.dswf-dlg-field { display: flex; flex-direction: column; gap: 6px; }
/* 同行双列（provider/model 成对编辑——各占一半） */
.dswf-dlg-row { display: flex; gap: ${T.gap8}; }
.dswf-dlg-row > .dswf-dlg-field { flex: 1; min-width: 0; }
/* Dialog 内单选下拉（FilterSelect 复用——box 对齐 .dswf-dlg-input 刻度：通宽 + 同字号/内距/描边） */
.dswf-dlg-field .dswf-select-box { width: 100%; justify-content: space-between; font: var(--dsw-font-s-14); height: auto; padding: ${T.gap8} ${T.pad12}; }
.dswf-dlg-field .dswf-select-value { font: var(--dsw-font-s-14); }
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
/* 菜单 position:fixed 视口锚定（坐标由 mselMenuPlacement 内联注入）——脱离 .dswf-dlg-body
   overflow:auto 裁切上下文，允许溢出 Dialog 视觉范围（真机回归修正） */
.dswf-msel-menu { position: fixed; z-index: 10; max-height: ${MSEL_MENU_MAX_PX}px; overflow: auto; padding: ${T.gap8}; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: ${T.r8}; background: var(--dsw-alias-bg-layer-2); box-shadow: var(--dsw-elevation-soft); }
.dswf-msel-row { display: flex; align-items: center; gap: ${T.gap8}; font: var(--dsw-font-xs-13); padding: 4px 0; cursor: var(--dsh-cursor-pointer, pointer); }
.dswf-msel-add input { width: 100%; font: var(--dsw-font-xs-13); padding: ${T.gap8}; margin-top: ${T.gap8}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; }
.dswf-toast { position: absolute; left: 50%; bottom: 56px; transform: translateX(-50%); padding: ${T.gap8} ${T.pad16}; border-radius: ${T.r8}; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-2); font: var(--dsw-font-xs-13); white-space: nowrap; }
/* [召唤] 降级引导条（HR 预设被拒/会话打开失败/工作区锚缺席——明确引导，不炸面板） */
.dswf-summon-notice { margin: ${T.gap8} 0 0; padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary)); font: var(--dsw-font-xs-13); line-height: ${T.lh20}; }
/* delegate 装配降级提示条（run-state 读口 degraded——委派不可用可见提示，同召唤引导条形制） */
.dswf-delegate-notice { margin: ${T.gap8} 0 0; padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary, var(--dsw-alias-label-primary)); font: var(--dsw-font-xs-13); line-height: ${T.lh20}; }
/* ── 同键全层聚组（1.60 用户裁决 + 1.68 裁决：去组外层边框——同名卡相邻排列，
   组头信息不承载边框容器；保留组头行承载来源数与对比入口） ── */
.dswf-xgroup { display: flex; flex-direction: column; gap: ${T.gap8}; }
.xg-head { display: flex; align-items: center; gap: ${T.gap8}; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); }
.xg-name { font: var(--dsw-font-xxs-12); font-weight: 500; color: var(--dsw-alias-label-secondary); font-family: var(--ds-font-family-code); }
/* 来源角标（三态文案 项目/用户/内置；语义 alias 点色，色底经 color-mix 降饱和） */
.origin-badge { font: var(--dsw-font-xxxs-11); line-height: ${T.lh14}; padding: 0 6px; border-radius: 4px; margin-left: auto; white-space: nowrap; }
.origin-badge.origin-project { color: var(--dsw-alias-state-business-primary); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); }
.origin-badge.origin-user { color: var(--dsw-alias-state-warn-label); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); }
.origin-badge.origin-plugin { color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-interactive-bg-hover); }
/* 生效标（展开对比表生效列锚——1.68 裁决：卡片「生效」徽标已移除，对比表内保留） */
.eff-badge { font: var(--dsw-font-xxxs-11); line-height: ${T.lh14}; padding: 0 6px; border-radius: 4px; white-space: nowrap; color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); }
/* 对比表（唯一消费面 = 详情 Dialog 对比态——外框退役，Dialog body 已有容器框架） */
.dswf-xcompare { display: flex; flex-direction: column; gap: ${T.gap8}; }
.cmp-table { width: 100%; border-collapse: collapse; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary); }
.cmp-table th, .cmp-table td { padding: 4px ${T.gap8}; border-bottom: 0.5px solid var(--dsw-alias-border-l2); text-align: left; vertical-align: top; }
.cmp-table th { font-weight: 400; color: var(--dsw-alias-label-caption); white-space: nowrap; }
.cmp-table td .chip { margin-right: 4px; }
/* 差异格高亮增强（warn 底 + 左指示条 + 主标签色文字——差异点一眼可辨） */
.cmp-table td.diff { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent); box-shadow: inset 2px 0 0 var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-label-primary); }
.cmp-note { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-caption); }
/* ── 来源行降位（1.61 ① + 1.67 裁决：去生效标、入头部弱化、? tooltip）── */
.dswf-dlg.wide { width: 1080px; } /* ⑥ 对比态宽体：宽于详情 Dialog 860px 刻度（视觉稿正本） */
.dswf-dlg-origin-bar { display: flex; align-items: center; gap: ${T.gap8}; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-secondary); } /* 次级色弱化令牌 */
.dswf-dlg-origin-bar .origin-badge { margin-left: 0; }
.dswf-dlg-origin-lead { color: var(--dsw-alias-label-caption); }
.dswf-dlg-origin-help { flex: none; width: 14px; height: 14px; line-height: 14px; text-align: center; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 50%; color: var(--dsw-alias-label-caption); font: var(--dsw-font-xxxs-11); cursor: var(--dsh-cursor-help, help); }
.dswf-dlg-origin-masked { margin-left: auto; color: var(--dsw-alias-label-caption); font: var(--dsw-font-xxxs-11); }
.dswf-cmp-pick-head { display: flex; align-items: baseline; gap: ${T.gap8}; font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary); }
.dswf-cmp-pick-head > b { color: var(--dsw-alias-label-primary); }
.dswf-cmp-pick-list { display: flex; flex-direction: column; gap: ${T.gap8}; font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-secondary); }
.dswf-cmp-opt { display: flex; align-items: center; gap: ${T.gap8}; padding: ${T.gap8} ${T.pad12}; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: ${T.r8}; background: transparent; color: var(--dsw-alias-label-secondary); font: var(--dsw-font-xs-13); cursor: var(--dsh-cursor-pointer, pointer); text-align: left; }
.dswf-cmp-opt:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dswf-cmp-opt.sel { border-color: var(--dsw-alias-state-business-primary); }
.dswf-cmp-opt .origin-badge { margin-left: 0; }
.dswf-cmp-opt-updated { margin-left: auto; color: var(--dsw-alias-label-caption); font: var(--dsw-font-xxs-12); }
.dswf-cmp-toggle-row { display: flex; align-items: center; gap: ${T.pad12}; font: var(--dsw-font-xxs-12); color: var(--dsw-alias-label-caption); }
.dswf-cmp-toggle { border: none; background: transparent; color: var(--dsw-alias-state-business-primary); font: var(--dsw-font-xxs-12); cursor: var(--dsh-cursor-pointer, pointer); padding: 0; }
.dswf-cmp-toggle:hover { text-decoration: underline; }
.dswf-cmp-empty { padding: ${T.pad20}; text-align: center; font: var(--dsw-font-xs-13); color: var(--dsw-alias-label-caption); }
.xg-hidden { font: var(--dsw-font-xxxs-11); color: var(--dsw-alias-label-caption); }
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
