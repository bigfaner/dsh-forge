---
created: "2026-10-07"
related: "../proposal.md#constraints--dependencies"
status: "executed（dev 形态全绿 2026-10-07；四未跑形态已裁决转 M3 实施期首任务补验——用户裁决 2026-10-07）"
---

# S5 spike：预设基座实跑（insert + registry default + select 接线 + hero 门控，dev + packaged 双形态）

> 排程锚：提案 Constraints「S5/S6 = PRD 前 spike」。可执行工件 = [`spikes/m3-s5-s6-presets/`](../../../../spikes/m3-s5-s6-presets/)（overlay 生成器 + m3_probe 探针插件 + playwright spec；dogfood 真实模型 glm-5.3-flash）。packaged 试验床 = release win-unpacked `dsh-forge.exe`（fix-projects-register-handler 工作树）。

## 方法

- **叠层注入**（`DSH_FORGE_PATCH_FILES`，用户层与 boot overlay 之后应用——双形态同语义）：`overlay.mjs` 生成远征/突击双预设声明行（= 上游 `standard.patch.yml` 全量镜像 + plugin-forge 增量行 + customSkillDirs 形态化）+ registry default 覆写（`agent-preset-registry` 行 `default: expedition`）+ dogfood 模型行 + `m3_probe` 插件行。
- **developerTools 门控**：hero chips 受 `ui-settings` 命名空间偏好门控（默认 false）。spec 先 boot#1 让设置存储落盘 → 扫描 dshHome 内含 `ui-settings` 的 JSON → 预播种 `enabled: true` → 重启；失败落 UI 兜底（设置 → 显示代码工作视图）。**该路径本身就是 M3「门控前置」产品形态候选（a）的机制验证**。
- **blank select 与锁**：blank 会话点选「突击模式」chip → 首回合（m3_probe 真模型调用）→ 会话日志检索 `agent-preset/selected` 事件 → 首回合后再点「远征模式」→ 断言事件数不增（平台 blank 锁的机械面）。
- **双形态**：dev = `launchHost`（devProfile）+ customSkillDirs 绝对路径；packaged-js = 同叠层上 release exe（**负对照**——预期 `!!js` 在 {userData} profile 链不可解析，3.4 结论复核）；packaged-abs = 宿主物化绝对路径叠层（**正面**）。

> **实跑修正（相对本节原稿）**：① `!!js createRequire(baseUrl).resolve(...)` 形态在 **dev 形态即死**（ESM-only exports 无 `./package.json` 子路径 → ERR_PACKAGE_PATH_NOT_EXPORTED），dev spec 已改用字面绝对路径（repo `packages/` 路径）——§5.6 底稿形制在所有形态均不可用，packaged-js 负对照降级为确认性验证；② developerTools 门控实测：`ui-settings` 为**单字段命名空间行**（config `{enabled: volatile boolean}`），持久化走 profile 补丁行而非 dshHome JSON（原「扫描 dshHome 预播种」路径不成立），最终形态 = 叠层 `ui-settings` 行 `enabled: true` 工厂开启；③ 会话日志运行期不落 dshHome、closeApp 后 flush 亦未检索到 `agent-preset/selected`，S5-2/S5-5 断言口径改为 **UI 投影面**（座位标签 + m3_probe 工具面 + 目录），日志事件降为证据级。

## 判定物

| # | 问题 | 绿判据 |
|---|------|--------|
| S5-1 | 预设 insert + registry default patch 实跑 | hero chips 出现「远征模式/突击模式」（自带中文 name 直出，order 1/2）；fresh 会话初始默认 = 远征 |
| S5-2 | blank select 接线 | 点击 chip → 首回合后会话日志含 `agent-preset/selected`（值 = blitz） |
| S5-3 | blank 锁 | 首回合后再 select：事件数不增（平台锁生效；UI 拒绝形态记录为证据） |
| S5-4 | preset 行内 `!!js`（baseUrl 形制） | dev 形态预设行可激活（chips 在场即证）；packaged-js 形态预设行 broken（负对照） |
| S5-5 | 宿主物化绝对路径形态 | packaged-abs：chips + select + 事件全绿 |
| S5-6 | developerTools 存储预播种 | 播种后重启 chips 可见（= M3 门控前置产品形态候选 (a) 机制成立） |
| S5-7 | 重启投影重建 | 重启后 `agent-preset/selected` 事件保持、会话文件在场（证据级） |

## 结果（dev 形态实跑，2026-10-07；evidence.json 100 条，全程 form=dev）

- **dev：全绿（S5-1/2/3/6/7 + S5-4 判决反转）**
  - S5-1 ✅ 首启座位在场（`[data-slot="conversation.hero.agentPreset"]` 菜单按钮），折叠标签 = 远征模式（registry default `expedition` 生效），菜单含远征/突击两项（中文 name 直出、order 正确）。
  - S5-2 ✅（口径改 UI 投影面）点选突击 → 标签变「突击模式」→ 首回合 m3_probe dump `main-blitz`（会话 id `session-2d2c…`，host 面 9 工具）——select→组合 投影链闭合；日志事件证据级（见实跑修正③）。
  - S5-3 ✅（口径改 UI 层）首回合后座位按钮**卸载**（再点 = click timeout）——平台 blank 锁的 UI 面；fresh 会话默认回到远征模式。
  - S5-4 ✅（**判决反转**）`!!js` 形态 dev 即死（ERR_PACKAGE_PATH_NOT_EXPORTED，根因 = ESM exports 无 `./package.json` 子路径）→ 预设行装配**必须**字面/物化绝对路径，所有形态同判。
  - S5-6 ✅（机制成立）叠层 `ui-settings` 行 `enabled: true` → hero chips 工厂开启（候选 (a) 实证）；**UI 开关保存被拒**（overlay 占有行期间「保存失败，请重试」）→ M3 需定义行所有权规则。
  - S5-7 ✅ 重启后座位/默认/菜单全复绿。
  - 附带发现：**镜像行必须重述必填配置**——`tool-fs-search` 缺 `sampleOverCapResults: false` 会导致预设行 schema 拒绝 → 整预设 broken → 不上菜单（诊断面 = 设置 → Agent 预设 roster 显示「加载失败」）；座位标签 healthy 时显 display name、broken 时回退 id。
- **dev-abs / dev-tf / packaged-js / packaged-abs：未跑**——环境故障阻塞（见下「环境注记」）；**已裁决（用户 2026-10-07）：转 M3 实施期首任务补验**（dev 证据已覆盖全部 PRD 判定，四形态为确认性质）。

### 环境注记（阻塞四形态的原因）

2026-10-07 凌晨起本机所有**新建** Electron 启动（dev 二进制与 packaged exe、`_electron.launch` 与手动 spawn+CDP attach 两法）renderer 均在 `dsh-forge://app/` 得到**空文档**（无 #root、无 ModuleLoader、零 console 报错），主进程全程健康（webserver 起、壳窗口就绪、profile 物化 created=4）。长时间马拉松实跑后机器状态漂移，成因未定（疑似 GPU/缓存/窗口态层）。此前多轮全绿证明工件本身正确。

### 实跑方法论沉淀（工件内已固化）

- 隔离双锚：`DSH_HOME` + `DSH_FORGE_DSH_HOME` 双 pin（环境泄漏会击穿隔离）；手动 spawn dev 二进制**必须**带 `DSH_FORGE_DEV_PROFILE=dev`，否则静默进入 packaged 形态（repo 根 node_modules 无 @dsh-forge，4/4 import 失败）。
- 完成检测用**副产物信号**（子代理末动作 = 第二次 m3_probe why=`<tag>-done`），不用文本标记——prompt 含字面 DONE 会假命中；UI 技能卡片 `name | desc` 格式会破坏管道计数启发。

## 结论与落点（dev 证据版）

- 提案回填点：①方案① spike 条款**结论化**（insert + registry default + select + 锁 全链机械面成立，dev 实证）；②packaged 装配形态裁决——`!!js` 全形态死刑 → M3 装配 = **宿主物化绝对路径**（或首启模板烘焙），packaged-js 负对照仅存确认价值；③「PRD 定形态」项：hero 门控 = `ui-settings` 行 config（候选 (a) 机制实证成立，**推荐**；附带所有权规则需求：overlay 占有行期间 UI 保存被拒）。
- PRD 落点：SC1 断言口径修正为 **UI 投影面四断言**（座位在场/默认标签/选择投影/锁定卸载），会话日志事件降为证据级；Constraints 记录「镜像行配置重述义务」（tool-fs-search 教训）与「@dsh-forge 包 exports 须暴露 `./package.json` 或一律物化路径」。
- 残余（已裁决转 M3 实施期首任务补验）：packaged 双形态 + dev-abs 实跑；环境故障本身。
