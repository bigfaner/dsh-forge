# M3 S5/S6 spike：预设基座 + 技能供给（dev + packaged 双形态）

结论与落点见 `docs/proposals/dsh-forge-m3-bootstrap-presets/spikes/{s5-preset-base,s6-skill-provisioning}.md`（本目录 = 可执行工件）。

## 工件

- `probe-env/`——`@dsh-m3/probe-env` 插件（inject `['tools']`）：注册 `m3_probe` 工具，dump 会话身份面 + 本组合可见工具名全集到 `M3_DUMP_FILE`（JSONL）。**spike 工件，不得演化为产品结构**（沿 s1/S8 纪律）。
- `skill-roots/`——三个探针技能：`forge-core/m3-probe`（custom 根 rank 300）/ `forge-spec/m3-spec-probe`（仅远征挂载——L1 判定物）/ `user-dup/m3-probe`（user 根 rank 400 同名败者方）。
- `overlay.mjs`——叠层生成器：远征/突击双预设（standard 全量镜像 + plugin-forge 增量 + customSkillDirs 形态化）+ registry default 覆写 + dogfood 模型 + 探针插件行。四形态：`dev`（!!js 表达式）/ `dev-tf`（+toolFilter deny）/ `packaged-js`（负对照）/ `packaged-abs`（宿主物化绝对路径）。
- `m3.spec.ts` + `pw.config.ts`——playwright 走查（testDir = 本目录，不进仓 e2e 池）：注册夹具工作区 → developerTools 门控（设置存储预播种 + UI 兜底）→ hero chips → blank select + blank 锁 → 双模式技能目录（L1/rank/标准模式 M2 疑点）→ worker 组合继承 + AGENTS.md → toolFilter（dev-tf）。

## 运行（从任意终端；harness 会话内须绕 node.cmd shim——见 S8 备忘）

```powershell
# 0️⃣ 前置：~/.dsh/.credentials.yaml 在场（dogfood 凭据，缺席 = 抛错）；
#    零其它 dsh-forge 实例（单实例纪律——本机 DSH Desktop 不冲突，app id 不同）；
#    packaged 形态试验床在场：
#    Z:\project\dsh\dsh-forge\.forge\worktrees\fix-projects-register-handler\release\installer\win-unpacked\dsh-forge.exe

# 1️⃣ dev 形态（S5 + S6 两用例；叠层用 !!js 表达式——§5.6 底稿形制实跑）
$env:M3_FORM = 'dev'
& 'D:\developer\nodejs\node.exe' 'node_modules\.pnpm\playwright@1.63.0\node_modules\playwright\cli.js' test -c 'spikes\m3-s5-s6-presets\pw.config.ts'

# 2️⃣ toolFilter 二期（deny 名取自 1️⃣ 的 dumps.jsonl toolNames——先看 evidence.json / env-s5/dumps.jsonl）
$env:M3_FORM = 'dev-tf'; $env:M3_TF_DENY = 'web'   # ← 换成 1️⃣ dump 里真实存在的工具名
& 'D:\developer\nodejs\node.exe' 'node_modules\.pnpm\playwright@1.63.0\node_modules\playwright\cli.js' test -c 'spikes\m3-s5-s6-presets\pw.config.ts'

# 3️⃣ packaged 负对照（!!js 在打包形态——预期预设 broken / 技能不可见）
$env:M3_FORM = 'packaged-js'; Remove-Item Env:M3_TF_DENY -ErrorAction SilentlyContinue
& 'D:\developer\nodejs\node.exe' 'node_modules\.pnpm\playwright@1.63.0\node_modules\playwright\cli.js' test -c 'spikes\m3-s5-s6-presets\pw.config.ts'

# 4️⃣ packaged 正面（宿主物化绝对路径——预期全绿）
$env:M3_FORM = 'packaged-abs'
& 'D:\developer\nodejs\node.exe' 'node_modules\.pnpm\playwright@1.63.0\node_modules\playwright\cli.js' test -c 'spikes\m3-s5-s6-presets\pw.config.ts'
```

探针插件拷贝（dev → `apps/host/profile.dev/node_modules/@dsh-m3/`；packaged → release `runtime/node_modules/@dsh-m3/`）与清理由 spec 自动完成。叠层文件生成到 scratch `generated/`（临时态，非仓内）。

## 证据面（全落盘，spike 判读只读文件）

- `Z:\project\dsh\tmp-redesign\m3-s5-s6\<form>\evidence.json`——结构化事实流水（chips 状态 / 事件行 / 目录转录 / dump / 判定检查）
- `...\shots\*.png`——关键步与失败截图
- `...\env-<tag>\dumps.jsonl`——m3_probe dump（会话 id / 工具名全集）
- 会话日志检索——`agent-preset/selected` 事件行（blank 锁机械面）

## M3 3.9 复跑件（真实装配面——实施期首任务）

一版工件（上节）的预设行已退役：3.7 起远征/突击双预设、registry default、ui-settings 开关全部归产品（`apps/host/src/profile/presets/` 三底稿 + `renderBootOverlay` 物化 + 首启预置）。3.9 复跑（`overlay-m3.mjs` + `m3-rerun.spec.ts`，env `M3R_FORM`）叠层只注 dogfood 模型行 + m3_probe 探针插件；四用例：

- **P**（`m3-packaged`）：打包产物首启 → boot-overlay.yml 物化 resources 绝对路径 + registry default=远征 + ui-settings 首启预置 + hero 座位自现 + 目录转录（spec/core 技能名）。
- **N**（`m3-packaged-js`）：负对照——外部叠层重述产品远征行、仅 customSkillDirs[core] 换 §5.6 `!!js` 表达式 → 预期行 broken（!!js 死刑判决确认）。
- **D**（`m3-dev`）：dev 形态物化 repo 绝对路径（dev-abs）+ L1 物理边界（真实突击预设物理不含 spec 技能）。
- **W**（`m3-dev`）：真实 `dispatchTask` 派发 doc + test-run 双夹具任务 → worker dump deny 收窄（dev-tf 落位=3.4 真实 deriveWorkerToolFilter）/ worker 会话文件解码（首条=dispatchPrompt 对账 digest、AGENTS.md 到达、run-tests 按需加载 test 有 doc 无）——SC2 按需加载断言通道（5.2 e2e 消费面）。

前置：packaged 形态须先重建 `pnpm dist:win`（release 陈旧 = 伪装回归）；其余同一版（凭据/单实例）。证据根 `Z:\project\dsh\tmp-redesign\m3-3-9\<form>\`（evidence.json / shots / dumps.jsonl / report）。结论与证据归档见 `VERIFICATION-3.9.md`。

```powershell
# 复跑（一键一形态；dev 形态 D+W 两用例）
$env:M3R_FORM = 'm3-dev'      # 或 'm3-packaged' / 'm3-packaged-js'
& 'D:\developer\nodejs\node.exe' 'node_modules\.pnpm\playwright@1.63.0\node_modules\playwright\cli.js' test -c 'spikes\m3-s5-s6-presets\pw.config.ts' m3-rerun
```


## 已知迭代点（跑挂时先看这里）

1. **developerTools 存储预播种**：格式/位置由 boot#1 后扫描发现（spec 自举）——若候选文件为非 JSON 或 schema 不符，自动落 UI 兜底（设置 → 显示代码工作视图）；两者皆失败时看 `shots/devtools-ui-*.png` 人工定位锚点后迭代选择器。
2. **preset 行内 `!!js` 的 baseUrl 语义**：§5.6 形制假定解析基可达 profile node_modules——dev 形态若预设行 broken（chips 缺席 + `chips-visible` 截图为证），即为 S5 否定发现（记录，不修 spec）。
3. **packaged-js 预期负对照**：预设 broken 属预期（负对照）；若 `m3-probe` 仍可见则 3.4 负结论在预设语境不成立——spec 会显式抛错提示重判。
4. UI 锚点（新会话按钮 / 设置入口）未知锚 → spec 多选择器 + 截图留痕，失败迭代成本低。
