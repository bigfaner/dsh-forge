---
name: dsh-forge-p1-dogfood-tool-hang
description: 4.2 dogfood 工具挂起已修复（fix-1 child 形态落地）；顺带修出三处潜在缺陷（session v4 文件名/查询掌舵/浏览面激活重拉）；dogfood 环境坑仍有效
metadata:
  type: project
---

dsh-forge P1 4.2 dogfood 工具挂起——**fix-1 已修复（2026-10-02，flywheel e2e 连续两绿 18.8s/18.7s，896 单测全绿）**：

**修复本体（boot child 形态）**：direct-in-main 内 agent 工具派发恒挂起（模型往返正常、任意工具 3min+ 不返回）的根因 = 宿主形态——官方 Desktop 用 child 形态。落地为 boot/ 三件：
- `apps/host/src/boot/child.ts` = 子进程入口（ELECTRON_RUN_AS_NODE=1 --expose-internals，argv[2] 收 BootDshOptions JSON；loadProfileDirectory→overlay→runProfile 原路径平移；ready/rpc/shutdown 消息面）
- `apps/host/src/boot/bridge.ts` = 桥协议纯逻辑（消息守卫/Map wire 信封 `__dshForgeMap__`（heatByEntry 唯一 Map 返回体）/argv 解析/子侧 dispatchRpc/主侧方法白名单代理；单测 21 断言锚定）
- `apps/host/src/boot/run.ts` = spawn 编排（pending 表按 id 结算、close 全量拒、有界关停 6s kill 兜底）；DshHostHandle 面不变 → main.ts 零改动（91 行纪律保持）

**顺带修出的三处潜在缺陷（child 形态修复后 e2e 才走到暴露）**：
1. 会话文件版本漂移：上游 SESSION_FORMAT_VERSION=4（现行写 `session.v4.jsonl.zstd`），flywheel.spec 曾硬编码 v3 恒漏检——已改版本无关解析（`bestSessionLog`：session.jsonl[.zstd]/session.vN.jsonl[.zstd] 取最高代）。
2. agent 查询掌舵：rankEntries 是 keywords AND + text 整段子串——agent 自然语言长查询合法零命中（dogfood 方差来源）。掌舵面 = search tool 描述/参数说明（单一来源机械渲染进 schema+系统提示词）+ 零命中提示「try a shorter query」+ prompt 流程指引第 2 步。语义本身（AND/子串）不动（单测 pin，M5/M6 才动）。
3. 浏览面激活重拉：knowledge 视图 keep-alive 常挂载、mount 期拉取后 nav 激活不重拉 → 热度徽章陈旧（AC3 三方一致破）。修 = RecallTab AC4 同型：`useKnowledgeBrowse(projectId, client, active)` 隐藏期 hold、激活翻转 epoch 进 fullKey 全量重拉；WorkbenchPanel 注入 `active={view.center === 'knowledge'}`。

**dogfood 环境坑（仍有效，复用）**：凭据面 = `~/.dsh/.credentials.yaml` 的 `refs.ZAI_CODING_CN_API_KEY`（apiKeyEnv 引用 refs，非进程 env——拷贝进隔离 DSH_HOME 即解析）；临时 profile 目录不可行（realpath 判层）→ DSH_FORGE_PATCH_FILES 外部叠层；welcomeNoticeVersion=2026-09-28.1 预确认免遮罩；会话 id 从目录名取（blank 期不显示）；新会话需点 composer 工作区芯片选夹具工作区。e2e 单实例纪律：跑前 tasklist 查 electron/dsh-forge 残留。

**4.2 收尾增量（2026-10-02，任务完成轮）——fresh userData 首启模态遮罩（host 集成转正的必然后果）**：child 形态下官方设置面可达 → fresh userData 首窗必弹「预览版说明」（~+7s 挂载，mask 拦截一切指针——locator 可解析但 click 30s 超时）。**点「继续」成功但模态不退**（隔离环境确认写回不可依赖的再实证——只能叠层预确认预免，运行期收不掉；**根因已于 fix-12 定性 = dev 形态宿主 dsh-app-boot 模块二象性，预确认载体已改产品 boot overlay 内置，见 [[dsh-forge-p1-welcome-ack-fix12]]**）；随后第二弹「添加一个 API Key」可点「稍后配置」本地收起。smoke-skeleton/knowledge-integration 已装 `writeAckOverlay()`（ui-settings-general 预确认）+「稍后配置」fallback 轮询（15s 窗口）。另修 knowledge-integration 组二探测门：在场判定只认 "No handler" 拒绝——`__probe__` projectId 触发域层 bare Error（requireProject fail-loud 不入信封、invoke 拒绝上抛）曾被误读为通道缺席致恒 skip。验证：全量 e2e 10/10（flywheel 4 连绿 18.8/18.7/18.9/21.3s）、SMOKE-LEDGER §5 两缺口记转正。

**Why**: 修复路径 = 先 child 形态（阻塞根因），后三缺陷各需一次 e2e 实跑才暴露——「修一处跑一次」比攒齐再跑省时；工具挂起无日志无报错，插桩排除法多轮才收敛到形态假设。
**How to apply**: 任何触 boot/桥接/会话持久化断言/knowledge UI 的任务先读本条；改插件 src 后必须 tsc -b（profile.dev junction 消费 dist）；dogfood e2e 现稳定 ~19s，可作常规回归面。
