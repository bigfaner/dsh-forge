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
- `ErrorBar.tsx` —— 错误条共享件（fix-36 收敛）：`role=alert` 文案行 + 可选重试文本钮的
  近同构四域（sidebar/浏览器/知识/召回）单一 JSX 来源；class/data 锚/文案全参数化注入
  （令牌与刻度归各域 CSS——本件零样式持有）。
- `SkeletonRows.tsx` —— 骨架行容器共享件（fix-36 收敛）：N 行占位 + `aria-hidden` 的
  近同构四域单一 JSX 来源；行数/class/域前缀 data 锚注入（锚名与 className 同域对齐口径）。
- `time-label.ts` —— 相对时间标签单一来源（fix-36 收敛）：官方 `relativeTime` 桶化 →
  zh 文案的切换源（`timeLabelZh` 毫秒面 / `isoTimeLabelZh` ISO 面）；sidebar/knowledge/
  recall 三域模型委托，文案口径唯一权威（P1 单语，多语归 M 系列主题化）。
