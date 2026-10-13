---
created: "2026-10-12"
author: "faner"
status: "Draft"
intent: "enhancement"
---

# Proposal: worker 执行基础设施加固——证据落盘 + 就绪门 + 断点续跑 + e2e 去模型化（worker-exec-evidence-replay）

> **定位**：worker 长任务执行基础设施与验证管线的增强（worker-lean-execution 的自然后续——
> 该提案优化 worker 跑得多快，本提案解决 worker 跑得**可信、可续、可复验**）。
> **直接诱因**：worker-lean-execution/fix-10 一次 5.3 小时的执行解剖（2026-10-12）——
> 三次意外中断 + 一轮环境白跑 + 每轮全量 e2e 1.5–2h，有效执行仅约 4h，且关键失败轮无取证可考。

## Problem

四个病灶（fix-10 执行解剖实测 + 代码证据）：

1. **跑批证据被覆盖，失败轮不可考**：worker 跑批脚本每轮覆盖写同一批日志文件
   （`fix10-final/m2.log` 等只留最后一轮）。15:33 白跑轮（四 journey 各 6–8 秒 exit=1）
   的具体报错文本已物理不可考——triage 只能靠猜。证据散在
   `.forge/docs/proposals/<slug>/` 下靠 worker 自觉，无统一路径约定。
2. **环境未就绪不设防，白跑整轮**：跑批前置（dev 环境存活 + 构建产物就位）失败时
   journey 仍然起跑并全灭。`just probe` 就绪探测机制存在（justfile:86，判据 =
   dev PID 存活 + `apps/web/dist` 落位），但只是技能建议层——worker 跑批脚本绕过
   probe 直接进 journey 无人拦截。约束：**未来将退役 just**，门不得锚定 just 配方。
3. **重入零上下文，断点不续**：进程重启/子代理崩溃后幂等重入会重新综合 brief
   重跑，已落盘的进度证据（跑批日志、已修簇记录）不自动回到新 worker 视野——
   fix-10 重入后"从头再想一遍"。三次进程重启 + 一次子代理崩溃（当日 fix-9/fix-10
   records 实录）每次都付出整任务重启代价。幂等重入与 spawn guard（1/3）防线本身
   工作正常，缺的是**断点状态可见性**。
4. **e2e 真实模型链是验证管线的成本黑洞**：48 个 spec（m2 16 / m3 18 / p1mvp 10 /
   blitz 4）中 dogfood 型用例走真实模型派发链（SC-M2 门、SC5、krf flywheel 等），
   单 journey 20–50 分钟、全量一轮 1.5–2h。并发已封顶 2 个 electron 实例
   （playwright.config.ts，fix-7 血泪裁决），物理成本压无可压。真实成本落点：
   fix 链任务每修一簇就要整轮回归（1.5–2h/轮），fix-10 五轮跑批 5.3h 的大头。

### Evidence

- fix-10 执行解剖（`.forge/docs/proposals/worker-lean-execution/fix10-final/summary.txt`）：
  五轮跑批时间线（15:33 白跑轮四 journey 合计 <30s 全 exit=1；15:43/17:33/18:48 三轮
  有效回归各 69–84 分钟；20:19 第四轮被停止打断），失败收敛 20→9→4 但每轮残留触发再跑。
- 覆盖写证据：`fix10-final/` 各 journey 日志 LastWriteTime 逐轮刷新，仅存末轮内容。
- 重入代价证据：fix-10 records 六条（claim→interrupted→claim→claim→interrupted），
  fix-9 records 八条（同型三连）。
- e2e 形态：`e2e/playwright.config.ts`（`_electron` 真实产品链、workers 封顶 2、
  trace retain-on-failure）；dogfood 用例真实模型链 = journey 时长实测
  （m2 51.6m / p1mvp 38.4m，2026-10-12 串行跑批实录）。
- 参照物：`Z:\project\ai\pm-work-tracker\tests`——纯机械确定性验证
  （vitest/playwright 打真实应用面，链路零模型参与，单用例秒级）。

## Solution

四项交付，用户可见行为不变（执行基础设施与验证管线增强）：

1. **跑批证据统一落盘面**：全 worker 统一证据路径规则
   `{工作区派生目录}\logs\{slug}\{task-local-id}\{NNN-issue-key}\`
   （示例 `...\forge-workspaces\Z-project-dsh-dsh-forge@dadf6b04\logs\worker-lean-execution\fix-10\001-worker-aborted`），
   按轮追加命名、永不覆盖；规则写入 worker 系统提示词约束块（全 worker 硬约定，
   不靠任务书/技能各自携带）。
2. **跑批就绪硬门**：跑批编排强制"就绪探测通过才进 journey"——探测判据覆盖
   journey 实际前置（环境进程存活、构建产物形态、端口/锁残留），未过即 fail-fast
   明确报错终止。命令载体不限 just（just 退役后由替代载体承载），门本身是跑批纪律。
3. **重入证据指针透传**：worker 执行中把"已完成轮次/已清零簇/证据目录指针"持续
   写入第 1 项的证据位；重入派发时 brief 自动携带指针，新 worker 从最后落盘点续跑
   （轻形态——不做会话快照/进程迁移）。
4. **e2e 全面去模型化**：录制/回放机制落地；现有 dogfood 用例**改造成回放版**
   （保用例的应用链断言结构——会话落盘、files_json、面板呈现等，只把"模型"变量
   换成录制夹具）；新用例由 agent 参与编写（从走查 trace/错误现场推导 spec，
   人审入库）；执行退化为机械验证（pm-work-tracker 形态）。真实模型链退为按需
   手跑冒烟清单（如 krf flywheel），**不挡提交门**。

去模型化后 Q3（定向验收 vs 全量放行门）前提消解：全量一轮压至分钟级，
fix 链任务可每轮全量清零，无需分权。

## Alternatives

- **方案 A（选定）**：上述四项组合——证据面、硬门、轻续跑、去模型化各治一个病灶，
  互不依赖可分期。
- **方案 B（重续跑形态）**：序列化 worker 会话中间态，重入即恢复对话——恢复率高
  但跨进程/跨模型快照可靠性风险大、机械重；证据指针已覆盖 80% 场景。不选。
- **方案 C（最小止血）**：只做 1+2（留痕 + 就绪门），验收口径与续跑留给任务自觉——
  fix-10 证明"自觉"不可靠，且 4 的成本收益（2h/轮 → 分钟级）远超其余项。不选。
- **方案 D（什么都不做）**：接受现状——每轮全量 2h、意外即整任务重来、失败轮无取证。
  随 fix 链与 dogfood 用例继续增多，成本单调恶化。不选。

## Scope

**收编**：

1. worker 证据路径约定（约束块 + 落盘面）；
2. 跑批就绪硬门（编排纪律 + 探测判据，载体无关）；
3. 重入证据指针透传（进行中进度落盘 + brief 携带）；
4. e2e 去模型化（录制/回放机制 + 存量 dogfood 用例回放化改造 + 新用例 agent
   参与编写惯例 + 真实模型按需手跑冒烟清单）。

**出界（明确不做）**：

- worker 上下文快照 / 进程迁移级续跑；
- 真实模型行为 A/B 对比、模型漂移的自动化监测；
- e2e 并发上限调优（封顶 2 实例为 fix-9 既定裁决）；
- 存量用例集推翻重写（只做回放化改造）；
- just 退役本身的迁移（独立事项，本提案仅要求载体无关）。

## Risks

1. **回放夹具漂移**：应用协议/事件形状演进使夹具批量失效——缓解：夹具带版本锚 +
   漂移时随改随录（fix-10 已有"夹具随跑重录"先例），漂移修复计入改动任务验收。
2. **去模型化弱化覆盖**：模型行为漂移类回归失去常备拦截——缓解：保留按需手跑冒烟
   清单（krf flywheel 等）作为发布前人工动作；接受此覆盖缺口为已裁决代价（用户确认）。
3. **录制机制复杂度**：模型流式响应捕获/回放的保真度（工具调用序列、非确定性）——
   缓解：录制面收窄到"模型输出"单一变量（应用链真实照跑）；技术选型留 tech-design。
4. **约束块容量**：证据路径规则再加一行挤压 worker 提示词预算（AGENTS.md maxBytes
   65536 上限同型约束）——缓解：规则压成单行路径模板，细则外链到证据目录内 README。
5. **证据无界增长**：每轮追加 + 每 issue 目录膨胀磁盘——缓解：按容器结算态定保留
   策略（终态容器证据压缩归档，具体期限留 tech-design）。

## Success Criteria

1. **留痕**：任意一轮跑批后，该轮日志在
   `logs/{slug}/{task-local-id}/{NNN-issue-key}/` 下按轮可考（抽查：构造一次失败轮，
   其报错文本在盘可查，且前轮日志未被覆盖）。
2. **就绪门**：环境未就绪时跑批在探测步终止（秒级 fail-fast + 明确报错），
   零 journey 白跑轮（验收：人为破坏前置后跑批，journey 零起跑）。
3. **续跑**：重入后 worker 首步即读证据指针、从最后落盘点续跑
   （验收：fix 链走查——中断重入的任务不再零上下文重述，brief 含指针证据）。
4. **去模型化**：全量 e2e 一轮墙钟 ≤ 15 分钟；常规跑批零真实模型调用
   （证据：跑批全程无模型配置依赖）；存量 dogfood 用例全部回放版且断言结构保留。
5. **门职责干净**：真实模型冒烟以按需手跑清单形式存在，不进任何自动提交门
   （验收：提交门清单核对，清单内无真实模型项）。

### Consistency Check

- SC1 ← 范围 1（落盘面）；SC2 ← 范围 2（就绪门）；SC3 ← 范围 3（指针透传）；
  SC4 ← 范围 4（去模型化）；SC5 ← 范围 4 的冒烟清单边界——每条 SC 有收编项承载，
  每个收编项至少喂养一条 SC，无 SC 相互矛盾。**检查通过（2026-10-12，会话内走查）**。

## 附录：录制回放技术探索（2026-10-12 会话摸底——tech-design/拆解输入）

### 现状资产（仓内已有，5.1/5.4 落地）

- `e2e/support/replay/dogfood-record.ts` —— 录制器：真实 dogfood 跑后三源合并
  （审计记录 + 提交全文 + 事件流）→ JSONL 夹具；fail-loud 完整性门（digest 指纹
  失配拒绝落盘——录制源不可带伤）。
- `e2e/support/replay/executor.ts` —— 回放执行器：按夹具序列重放 verb 写入行
  （observed/event 观测行跳过），fail-fast 步骤定位。
- `b5-anchors.spec.ts` —— 回放消费面先例（录制期 projectId 绑定 → "同机构造
  hand 夹具"裁决）。
- **结论**：管线状态层（任务链/门/文件）的录制回放已建成；dogfood 用例贵的部分
  是它不覆盖的两块——worker 模型回合（agent loop）与会话面 UI。

### 可行性硬约束

LLM 栈在上游官方包（`@deepseek-ai/dsh-llm-deepseek` 等，runtime-packages.ts 精确
pin `0.2.0-rc.2`）——**改上游不可行**；可用 seam 必须在仓内。仓内理想注入点：
`packages/plugin-forge/src/spawn/in-process-driver.ts`（派发驱动器抽象——worker
子会话唯一启动面）。

### 四条实现路径与判定

| 路径 | 切面 | 保真度 | 成本 | 判定 |
|---|---|---|---|---|
| A. verb 回放扩展 | 管线状态（已有） | 管线断言全保真；agent loop 不经过 | 近零（扩夹具） | ✅ 主干 |
| B. 回放驱动器 | 仓内 in-process-driver 注入"录制驱动器"：不走模型，按（dispatch digest, 步序号）键回放录制的 assistant 动作序列 | agent loop 语义保真（工具调用序列/fix 链重试/中断恢复）；失配 fail-loud | 中（唯一需新建的机制） | ✅ dogfood 型用例主力改造面 |
| C. HTTP 层 VCR 代理 | LLM 请求/响应 | 对请求体漂移极脆；客户端在上游不可动 | 高且脆 | ❌ 出局 |
| D. 会话转录播种 | 录制事件流预置 dsh-home，UI 面（转录/挂接/面板）机械走查 | UI 渲染保真；管线不经过 | 低（session-files.ts 夹具定位已备；m3 worker-face 已有禁真实模型承载面先例） | ✅ 会话面 UI 用例 |

### 推荐组合

**A + B + D 分层**——按"断言什么"选切面：管线链断言走 A（扩夹具）、agent 行为
语义走 B（回放驱动器）、会话 UI 走 D（播种）。

**B 的核心难点与对冲**：录制回放的键稳定性——briefing 文案漂移致步序错位。
对冲：键用 dispatch digest（任务结算已产）而非 briefing 全文；失配即 fail-loud
指出 diverge 步（与 dogfood-record 完整性门同哲学）。

## Challenge Override 记档

- Q1 范围：推荐收三项舍韧性项 → 用户裁决**全收四项**（Reason: 未陈述）。
- Q2 韧性形态：三选一 → 用户裁决**证据指针透传轻形态**，落盘统一
  `{工作区派生目录}\logs\` 树，规则入 worker 系统提示词（Reason: 与 worker 长任务
  错误日志交接惯例同构）。
- Q4 去模型化：真实模型链退按需手跑、不挡提交门的覆盖代价 → 用户**接受**；
  存量 dogfood 用例**改造成回放版**（非废弃重写）。
- Q3 定向/全量分权：被 Q4 消解（全量降至分钟级，每轮全量可负担），无需裁决。
- 约束补遗：**未来退役 just**——就绪门表述为载体无关的跑批纪律。
