// mermaid 主题变量（自 apps/web/src/views/docs/mermaid-diagram.tsx 原样迁入，调优归 1.11）。
/**
 * mermaid 主题变量（1.8 方案 A——Codex 式内联观感，用户裁决 2026-10-11）。
 * 取值策略（证据驱动，mermaid 12.1.0 实证 + 2026-10-12 fresh 票据定性）：主题变量经 theme-base
 * calculate() → updateColors 的 khroma 色彩派生——**色彩槽位传 var() 即抛
 * 「Unsupported color format」整图回退**（实机复现 + headless 隔离复现双重实证；
 * fontFamily/fontSize 非色彩径，var() 纯透传安全）。故色彩族全部取官方静态令牌实值镜像
 * （--dsw-static-neutral-bluish-* / alias 静态实值，dsh-client-ui-theme 实值唯一来源，
 * dsw-raw 注记豁免；light 主题实值——主文档面）——与 primaryColor 族既有镜像策略同口径。
 * 中性灰阶低饱和 = 中性基色 × mermaid 自身派生数学。
 */
export const MERMAID_THEME_VARIABLES = {
  /** 透明背景（图即内容——不自带底色，1.8 AC） */
  background: 'transparent',
  /** 字体栈同源官方（--dsw-font-family 主题包实定义；inherit 回退同官方 css$7 var(--dsw-font,inherit) 形） */
  fontFamily: 'var(--dsw-font-family, inherit)',
  /** 字号对齐官方 14px 正文刻度（--dsw-font-s-14-font-size 实值 14px——CSS 纯透传，核心渲染零 JS 数值消费） */
  fontSize: 'var(--dsw-font-s-14-font-size)',
  // ── khroma 派生输入族（concrete 镜像官方静态调色板——var() 会破坏 updateColors 派生）──
  primaryColor: '#f1f3f5', // dsw-raw 官方 --dsw-static-neutral-bluish-75 实值（节点底/派生基色）
  secondaryColor: '#e9ecf2', // dsw-raw 官方 --dsw-static-neutral-bluish-150 实值（次级底）
  tertiaryColor: '#f9fafb', // dsw-raw 官方 --dsw-static-neutral-bluish-50 实值（簇底）
  noteBkgColor: '#f9fafb', // dsw-raw 官方 --dsw-static-neutral-bluish-50 实值（便签底——出厂黄退役）
  primaryTextColor: '#0f1115', // dsw-raw 官方 --dsw-static-neutral-bluish-1000 实值（节点内文字——落 concrete 亮底，双主题可读）
  // ── 显示面色彩族（khroma 消费——var() 禁入；官方 alias 令牌 light 实值镜像，主题联动由
  //    SVG <style> 内联值承载——暗主题跟随属后续面，失败回退语义不因取值降级）──
  textColor: '#0f1115', // dsw-raw 官方 --dsw-alias-label-primary 实值（= neutral-bluish-1000）
  secondaryTextColor: '#61666b', // dsw-raw 官方 --dsw-alias-label-secondary 实值（= neutral-bluish-700）
  tertiaryTextColor: '#81858c', // dsw-raw 官方 --dsw-alias-label-tertiary 实值（= neutral-bluish-600）
  primaryBorderColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  secondaryBorderColor: '#0000001a', // dsw-raw 官方 --dsw-alias-border-l2 实值
  tertiaryBorderColor: '#0000001a', // dsw-raw 官方 --dsw-alias-border-l2 实值
  noteBorderColor: '#0000001a', // dsw-raw 官方 --dsw-alias-border-l2 实值
  lineColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  arrowheadColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  edgeLabelBackground: '#2631480f', // dsw-raw 官方 --dsw-alias-interactive-bg-hover 实值
  labelBackgroundColor: '#ffffff', // dsw-raw 官方 --dsw-alias-bg-base 实值（= neutral-bluish-00）
  activationBorderColor: '#0000001f', // dsw-raw 官方 --dsw-alias-border-l3 实值
  sequenceNumberColor: '#61666b', // dsw-raw 官方 --dsw-static-neutral-bluish-700 实值（khroma 派生禁 var()——回退缺陷定性 fix-8）
  loopTextColor: '#61666b', // dsw-raw 官方 --dsw-static-neutral-bluish-700 实值（同上）
} as const
