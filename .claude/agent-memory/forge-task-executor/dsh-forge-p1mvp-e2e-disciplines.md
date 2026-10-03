---
name: dsh-forge-p1mvp-e2e-disciplines
description: p1-mvp e2e 生成纪律——dismiss 毒化(单 boot)、零结果窗卡死缺陷信号、CJK 拼接边界、转录等值陷阱、菜单快照轮询 + fix-11 冒烟深水区五坑（openSession 错接/select-session 右栏/活体计时/召回 tab 遗留/链口径 soft 红为设计）
metadata:
  type: project
---

p1-mvp 契约 e2e（e2e/specs/p1mvp/，T-test-gen-scripts 产物）落地实测纪律：

1. **dismiss 毒化（最重要）**：官方首启「添加一个 API Key」弹窗的任何收起动作（点击「稍后配置」/Esc）写 dsh 侧客户态，之后同 userData 的下一 boot 存在产品工作台挂载竞态（官方壳/loader=live 正常、产品插件静默不激活，7/7 复现且非确定性与时序相关；探针对照：welcome 未确认 → API-key 弹窗不挂载 → 复启正常）。**对策 = 全部测试单 boot 形态**：前置经 RPC 落地（弹窗在场不阻塞 evaluate/RPC，仅拦指针）、状态转移经 WAL 活写（better-sqlite3 busy_timeout=5000，自 packages/core 依赖闭包解析）、模态收起置于链路末段。installer 套件同理：首启/冷重启测试零 UI（不收弹窗），面板走查放末位。
2. **kb UI 零结果窗卡死（缺陷信号）**：知识浏览 qz9 等零命中关键词触发后，UI 过滤态清场卡死（input 空 + 域选择复位「全部域」+ cards=0 呈空库引导且不再收敛），RPC 面健康返回全量——疑 use-knowledge-browse projectId 锚抖动触发 clear-filters 竞态（use-knowledge-browse.ts:271-274）。测试以 expect.soft 记账，转正 = 竞态修复。
3. **dirRow 边界**：「已注册」标记与目录名零空白拼接（行文本 = "comp-a已注册"）——`(?:^|\s)name(?:\s|$)` 尾界失配；用 `(?:^|\s)name(?=\s|$|[^\w.-])`。
4. **转录等值断言陷阱**：官方 composer 占位/草稿文案随输入态显隐 → before/after textContent 等值不可用；空提交拦截断言改走账本级（解码 session jsonl.zstd，非 system/message 的 message/tool 事件 = 0）。**fix-11 扩展**：等值断言还要求回合已收尾——官方运行态计时「用时 N秒」持续漂移，且账本级 tool/call 在场 ≠ 回合完成；先静置（计时归一后 1s 两读等值，90s 界）再比，长活体降级 containment。
5. **杂项**：工作区芯片菜单 = 开启瞬间的账本快照（注册实体传播滞后 → 重开轮询）；注册 dsh-home 父目录（= userData 本体）实体不进官方菜单（用独立 fixture 目录）；NSIS beforeAll 分钟级 → hook 内首行 `test.setTimeout(900_000)`；kb 空态元素常驻 DOM 且 CSS 隐藏 → 卡片/空态联合选择器 `.first()` 钉死在隐藏空态上。

**fix-11 冒烟深水区（簇①修复后 sw/flywheel 冒烟首次实跑到尾暴露的四缺陷 + 一个设计红，全部 2026-10-03 修复/裁决）**：

6. **openSession 错接（真缺陷，已修）**：client-plugin 把会话行打开接到 `ctx.sessions.open` ——Session Controller 的 sessions 服务**无 open 方法**（只有 retain/using/create/fork/…），行点击即 TypeError、会话切换/恢复全链哑（sw Step4/5、flywheel 8b 从未实跑过所以从未暴露）。**正确官方面 = `uiWorkspace.openSession(target)`**（「Select a Session and show its Conversation as one UI navigation action」——内部 retain(source:'mainView')+selection 一体）。插件 inject 面增 'uiWorkspace'。
7. **select-session 右栏不恢复（真缺陷，已修）**：view-state 的 select-session 只切 center 不恢复 rightDock——知识视图隐藏后会话行切回（回会话视图主路径）右栏钉死收起。修 = 与 show-session 同径 `rightDock: rightDockPreference ?? false`。
8. **恢复/切换后转录断言须轮询**：会话切换 → 官方面历史分页装载异步（骨架/空白瞬态），单发 textContent 恒取空白态；sw Step4/探针② 均改 expect.poll containment（60s 窗）。
9. **Step7 遗留召回 tab 激活**：keep-alive 面板态跨视图往返保留（AC-4 设计行为）→ 8b 发送前必须点回「对话」tab，否则 composer 在 hidden pane 里不可见 30s 超时。
10. **flywheel 冒烟的链口径 soft 红 = 设计态（勿修勿绕）**：`[链口径·缺陷信号]` 组 soft（召回次数 1 vs shipped per-call 2+/热度 +N）故意失败以携带核心计数口径缺陷信号（见 [[dsh-forge-p1-mvp-contract-fact-tensions]] #1）；expect.soft 不中断但**测试终态仍 failed**——簇①修复后冒烟跑到尾即呈此形态，属预期红非回归；转正 = core 链口径裁决（M5+）。

**Why**: T-test-gen-scripts 生成六个旅程套件时逐条实证（探针 1-7 对照）；复启竞态根因未完全定位（缓存清理/进程等待均无效），单 boot 形态是规避而非修复。
**How to apply**: 后续 e2e（M5+ 或 p1-mvp 增量）沿用单 boot 纪律与上述选择器口径；复启需求出现时先修毒化根因再解禁。关联 [[env-node24-rmsync-cjk-crash]]（CJK 目录单文件删除静默失败——unlinkSync）。

**2026-10-03 T-test-run 全量首跑（46 例：32 过/6 败/8 留痕 skip）**：六失败三簇已并入 fix-11（T-test-run 被 block）——①轨迹 tab 恒空态=WorkbenchPanel 装配从未传 transcript（已修：useConversation kit 钩子→TranscriptAnchor→transcriptOfChatSnapshot wire 映射）；②知识段注入=packages/knowledge 无条件注册 vs spec 断 UNKNOWN 口径另一侧（已裁决 B 侧无条件注入，见 [[dsh-forge-p1-mvp-contract-fact-tensions]] #6/#7）；③sw Step1c hero CTA 偶发 hidden ≥10s（2/5 样本，模态/CSS/occlusion 已探针排除；fix-11 当日 11 连 boot 未复现——Step1c 已内嵌失败取证（祖先 display/visibility/几何链倾倒+截图），复现即钉根因）。跑测环境红线见 [[dsh-forge-p1mvp-e2e-tmp-env]]；**并发纪律：dogfood e2e 跑测期间禁跑 tsc -b/lint 等重负载（曾致 firstWindow 30s 超时整片假红）**。
