// mermaid 主题变量（1.13 主题终版——B₁ 柔蓝 + 亮蓝字，提案 §主题调优 + 附录 H，
// 用户裁决 2026-10-13 多轮实渲染评审收敛：walkthrough/theme-design-review.html）。
/**
 * mermaid 主题变量（1.8 方案 A——Codex 式内联观感，用户裁决 2026-10-11；1.11 调优；1.13 终版 B₁）。
 * 取值策略（证据驱动，mermaid 12.1.0 实证 + 2026-10-12 fresh 票据定性）：主题变量经 theme-base
 * calculate() → updateColors 的 khroma 色彩派生——**色彩槽位传 var() 即抛
 * 「Unsupported color format」整图回退**（实机复现 + headless 隔离复现双重实证；
 * fontFamily/fontSize 非色彩径，var() 纯透传安全）。故色彩族全部取官方静态令牌实值镜像
 * （--dsw-static-neutral-bluish-* / --dsw-static-brand-deepseek-* / alias 静态实值，
 * dsh-client-ui-theme 实值唯一来源，dsw-raw 注记豁免；light 主题实值——主文档面）
 * ——与 primaryColor 族既有镜像策略同口径。
 * 1.13 终版（B₁ 柔蓝）：节点白底浮起（bluish-00）+ deepseek 品牌蓝描边/亮蓝文字
 * （deepseek-400 描边、deepseek-450 文字——边浅字亮同族两阶）+ 灰阶边线
 * （bluish-400）与簇底/簇边（bluish-50/200）层次；其余文字灰层级不变；
 * 浅主题先行，深主题跟随属后续面（回退语义不因取值降级）。
 * 令牌实值来源：dsh-client-ui-theme/lib/client.js 实测提取（2026-10-13）。
 */
export const MERMAID_THEME_VARIABLES = {
  /** 透明背景（图即内容——不自带底色，1.8 AC） */
  background: 'transparent',
  /** 字体栈同源官方（--dsw-font-family 主题包实定义；inherit 回退同官方 css$7 var(--dsw-font,inherit) 形） */
  fontFamily: 'var(--dsw-font-family, inherit)',
  /** 字号对齐官方 14px 正文刻度（--dsw-font-s-14-font-size 实值 14px——CSS 纯透传，核心渲染零 JS 数值消费） */
  fontSize: 'var(--dsw-font-s-14-font-size)',
  // ── khroma 派生输入族（concrete 镜像官方静态调色板——var() 会破坏 updateColors 派生）──
  primaryColor: '#ffffff', // dsw-raw 官方 --dsw-static-neutral-bluish-00 实值（主节点底——白底浮起，B₁）
  secondaryColor: '#f5f6f7', // dsw-raw 官方 --dsw-static-neutral-bluish-60 实值（次级底）
  tertiaryColor: '#f9fafb', // dsw-raw 官方 --dsw-static-neutral-bluish-50 实值（簇底——最浅档）
  noteBkgColor: '#f9fafb', // dsw-raw 官方 --dsw-static-neutral-bluish-50 实值（便签底——出厂黄退役）
  primaryTextColor: '#5686fe', // dsw-raw 官方 --dsw-static-brand-deepseek-450 实值（节点内文字——亮蓝，边浅字亮同族两阶）
  // ── 显示面色彩族（khroma 消费——var() 禁入；官方静态令牌 light 实值镜像，主题联动由
  //    SVG <style> 内联值承载——暗主题跟随属后续面，失败回退语义不因取值降级）──
  textColor: '#5686fe', // dsw-raw 官方 --dsw-static-brand-deepseek-450 实值（页面文字——亮蓝）
  secondaryTextColor: '#61666b', // dsw-raw 官方 --dsw-alias-label-secondary 实值（= neutral-bluish-700）
  tertiaryTextColor: '#81858c', // dsw-raw 官方 --dsw-alias-label-tertiary 实值（= neutral-bluish-600）
  primaryBorderColor: '#7aaaff', // dsw-raw 官方 --dsw-static-brand-deepseek-400 实值（主描边——品牌蓝，B₁）
  secondaryBorderColor: '#adb2b8', // dsw-raw 官方 --dsw-static-neutral-bluish-400 实值（次级边框——灰阶）
  tertiaryBorderColor: '#e1e5ee', // dsw-raw 官方 --dsw-static-neutral-bluish-200 实值（簇边）
  noteBorderColor: '#e1e5ee', // dsw-raw 官方 --dsw-static-neutral-bluish-200 实值（便签边——与簇边同源）
  lineColor: '#adb2b8', // dsw-raw 官方 --dsw-static-neutral-bluish-400 实值（连线——灰阶）
  arrowheadColor: '#adb2b8', // dsw-raw 官方 --dsw-static-neutral-bluish-400 实值（与连线同源）
  edgeLabelBackground: '#ffffff', // dsw-raw 官方 --dsw-static-neutral-bluish-00 实值（边标签底——白净，B₁）
  labelBackgroundColor: '#ffffff', // dsw-raw 官方 --dsw-static-neutral-bluish-00 实值（标签底——白净）
  clusterBkg: '#f9fafb', // dsw-raw 官方 --dsw-static-neutral-bluish-50 实值（簇底，B₁）
  clusterBorder: '#e1e5ee', // dsw-raw 官方 --dsw-static-neutral-bluish-200 实值（簇边，B₁）
  activationBorderColor: '#cfd3d6', // dsw-raw 官方 --dsw-static-neutral-bluish-300 实值（激活描边——保持 1.11 档）
  sequenceNumberColor: '#61666b', // dsw-raw 官方 --dsw-static-neutral-bluish-700 实值（khroma 派生禁 var()——回退缺陷定性 fix-8）
  loopTextColor: '#61666b', // dsw-raw 官方 --dsw-static-neutral-bluish-700 实值（同上）
} as const
