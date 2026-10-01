# components/

定位：**基础** —— 领域无关组件：吃 `--dsw-*` 令牌、零业务逻辑、不发起 RPC（props 原始形状）。
填充：2.6。边界：禁 import `views/`、`flows/`（依赖铁律①）与 `rpc/`、`@dsh-forge/contracts`
（零业务语义，tests/structure/web-shell.test.ts 机械 pin）。

- `MarkdownDoc.tsx` —— **Markdown 渲染唯一包装入口**（Hard Rule 渲染纪律：产品内禁直用官方
  `MarkdownText` 裸渲染器——结构 pin 机械执行）。职责：剥离开头 frontmatter 块（正文与元数据
  分离，UF-6「正文区不含 frontmatter 字段」）+ 供默认 labels（模块级冻结常量，引用稳定）+
  variant 透传（`body` 详情抽屉正文 / `compact` M4 嵌入预览预留——官方原生双形态）。
- `StateChip.tsx` —— 状态徽章：官方 `Tag`（neutral tone）复用不自绘；P1 仅承载展示，
  阈值配色 M4/M5 在包装内扩展（消费方零改动）。
- `HeatBadge.tsx` —— 热度徽章：热度 = 事件计数原样展示（UF-6 断言「热度数字 = 使用事件计数」）；
  官方 `Tag`（quiet tone）复用；可见性策略归消费方。
- `EmptyState.tsx` + `components.css` —— 统一空态简版（P1；M8 打磨）：标题 + 可选描述 +
  引导插槽（action ReactNode——CTA / 清除过滤入口由消费方注入）。官方无空态件，自绘限此一件
  且全令牌（间距刻度取官方排版行高令牌，不引入平行体系）。
