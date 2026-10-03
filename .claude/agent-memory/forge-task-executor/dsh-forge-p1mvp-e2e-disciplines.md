---
name: dsh-forge-p1mvp-e2e-disciplines
description: p1-mvp e2e 生成纪律五条——dismiss 毒化(单 boot 形态)、零结果窗 UI 卡死缺陷信号、CJK 拼接边界、转录等值断言陷阱、菜单快照轮询
metadata:
  type: project
---

p1-mvp 契约 e2e（e2e/specs/p1mvp/，T-test-gen-scripts 产物）落地实测纪律：

1. **dismiss 毒化（最重要）**：官方首启「添加一个 API Key」弹窗的任何收起动作（点击「稍后配置」/Esc）写 dsh 侧客户态，之后同 userData 的下一 boot 存在产品工作台挂载竞态（官方壳/loader=live 正常、产品插件静默不激活，7/7 复现且非确定性与时序相关；探针对照：welcome 未确认 → API-key 弹窗不挂载 → 复启正常）。**对策 = 全部测试单 boot 形态**：前置经 RPC 落地（弹窗在场不阻塞 evaluate/RPC，仅拦指针）、状态转移经 WAL 活写（better-sqlite3 busy_timeout=5000，自 packages/core 依赖闭包解析）、模态收起置于链路末段。installer 套件同理：首启/冷重启测试零 UI（不收弹窗），面板走查放末位。
2. **kb UI 零结果窗卡死（缺陷信号）**：知识浏览 qz9 等零命中关键词触发后，UI 过滤态清场卡死（input 空 + 域选择复位「全部域」+ cards=0 呈空库引导且不再收敛），RPC 面健康返回全量——疑 use-knowledge-browse projectId 锚抖动触发 clear-filters 竞态（use-knowledge-browse.ts:271-274）。测试以 expect.soft 记账，转正 = 竞态修复。
3. **dirRow 边界**：「已注册」标记与目录名零空白拼接（行文本 = "comp-a已注册"）——`(?:^|\s)name(?:\s|$)` 尾界失配；用 `(?:^|\s)name(?=\s|$|[^\w.-])`。
4. **转录等值断言陷阱**：官方 composer 占位/草稿文案随输入态显隐 → before/after textContent 等值不可用；空提交拦截断言改走账本级（解码 session jsonl.zstd，非 system/message 的 message/tool 事件 = 0）。
5. **杂项**：工作区芯片菜单 = 开启瞬间的账本快照（注册实体传播滞后 → 重开轮询）；注册 dsh-home 父目录（= userData 本体）实体不进官方菜单（用独立 fixture 目录）；NSIS beforeAll 分钟级 → hook 内首行 `test.setTimeout(900_000)`；kb 空态元素常驻 DOM 且 CSS 隐藏 → 卡片/空态联合选择器 `.first()` 钉死在隐藏空态上。

**Why**: T-test-gen-scripts 生成六个旅程套件时逐条实证（探针 1-7 对照）；复启竞态根因未完全定位（缓存清理/进程等待均无效），单 boot 形态是规避而非修复。
**How to apply**: 后续 e2e（M5+ 或 p1-mvp 增量）沿用单 boot 纪律与上述选择器口径；复启需求出现时先修毒化根因再解禁。关联 [[env-node24-rmsync-cjk-crash]]（CJK 目录单文件删除静默失败——unlinkSync）。
