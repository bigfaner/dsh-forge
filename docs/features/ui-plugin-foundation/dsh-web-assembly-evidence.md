---
created: "2026-09-22"
author: "task 3 (ui-plugin-foundation)"
status: archived-evidence
---

# 官方 dsh web 装配验证与撞键实证记录(任务 3 证据归档)

> 供任务 5 spike 报告引用(任务 5 的 Reference Files 之一)。本文全部结论为
> **2026-09-22 本机实测**(live 链路,非源码推断);复现步骤按场景逐条给出。
> 隐私口径:会话内容属用户数据,证据只采集插件自身标记与报错文本,不截图、
> 不归档会话标题/正文。

## 0. 环境与链路(第三方视角)

| 项 | 值 |
|---|---|
| launcher | `npx -y @deepseek-ai/dsh@0.1.6-alpha.2`(npm 官方 CLI;**exact 版本** —— dist-tag 陷阱:`latest` 停在 `0.1.5-rc.2`,`alpha` 才是 `0.1.6-alpha.2`) |
| DSH_HOME | 真实 `~/.dsh`(多装共存口径:home 为 CLI/官方桌面/壳共享,本任务只做加法写 `profiles/web`,结束后还原) |
| profile | `web`(官方模板:`dsh-base` + `dsh-web-app`;执行前为初始态,dependencies 为空) |
| 包管理 | `dsh plugin --profile web add/remove <tarball>` → profile 目录内 pnpm(11.0.9,launcher 自带) |
| 插件形态 | `pnpm pack` 产物 tarball(第三方用户拿到分发物后的自装形态;`file:<绝对路径>` spec) |
| 探针 | `scripts/acceptance/dsh-web-probe.mjs`(Playwright → loopback;boot roster / pageerror / `[data-dsh-forge-plugin]` 标记 / 面板文本) |
| 版本对齐 | 插件 peers exact `0.1.6-alpha.2` ≡ launcher `0.1.6-alpha.2` ≡ `vendor/upstream.lock.json` `desktopHostVersion`(三处一致) |

两锚(技术方向文档 §5):

- **锚① 安装锚(宿主侧)**:`inject` 目标与 react/cordis/dsh-client-store 等模块表基线由宿主 boot graph 提供 —— `__DSH_BOOT__`(rev `63dab6c9ea1f`,59 entries)含全部 `dsh-client-locale/ui-chat/ui-renderer`(hello-world 声明的最小稳定子集全部在场);client 半身经 `http://127.0.0.1:<port>/plugins/??<id>/client.js,...` 批量端点下发。
- **锚② profile 锚(用户侧)**:插件自身代码物化在 `~/.dsh/profiles/web/node_modules/@dsh-forge/<pkg>`(tarball 解包,内容 = files[] 清单:`lib/index.js`、`lib/client.js`、`lib/types/**`、`cordis.patch.yml`、`package.json`)。

**安装期 peer 行为**(两锚设计的直接后果,任务 5 ③ 的输入):profile 的
pnpm `autoInstallPeers: false` → 安装时 peers 报 **WARN 不阻断**
(`pnpm peers check` 列出 cordis 4.0.2 与五个 dsh-client-* 0.1.6-alpha.2
"missing" —— 它们不在 profile 工作区内,运行时从锚①解析)。实测两次
`plugin add` 均 exit 0、reconcile 正常激活 bundle。

## 1. AC1:hello-world 以 profile 自装注入官方 dsh web(场景 S0)

**复现步骤**

```bash
cd packages/plugins/hello-world && pnpm build && pnpm pack --pack-destination <tmp>
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 plugin --profile web add <tmp>/dsh-forge-plugin-hello-world-0.1.0.tgz
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 web --no-open     # 记下 loopback URL+token
node scripts/acceptance/dsh-web-probe.mjs --url "<URL>" --label S0 --open-session
```

**观察到的结果(2026-09-22 01:27 本机)**

1. `plugin add` 后 profile manifest 被 reconcile 追加第三层:
   `dsh.profile.bundles = [dsh-base, dsh-web-app, @dsh-forge/plugin-hello-world]`
   (依赖记为 `file:...tgz`)——`dsh plugin add` = pnpm-in-profile + 自动激活
   bundle,与内置形态同机制(上游 operations.ts reconcile 语义,零改动)。
2. boot graph(浏览器内 `__DSH_BOOT__.entries`,59 条)包含
   `@dsh-forge/plugin-hello-world` —— 自装插件进入宿主推送的注册图。
3. 打开历史会话后,完成 assistant 轮次尾部渲染出插件面板:
   标记 `[data-dsh-forge-plugin="hello-world"]`,文本
   「你好,世界 — 来自 dsh-forge hello-world 插件的面板 / 打个招呼 / 招呼数:0 /
   默认内容:第三方插件可注入此子槽位」——消费向(注入 ui-chat 核心槽)与
   贡献向(自有子槽位默认内容)同时可见,locale 走用户中文环境。
4. 0 pageerror / 0 console-error。

**结论**:AC1 PASS —— 第三方视角(零 vendored 引用、零壳修改)在官方
`dsh web` 注入成功;DSH Studio 声称的双形态分发链路(外部证据)在本机复现。

## 2. AC5:两锚解析与版本对齐验证记录

- **两锚解析**:见 §0 两锚表 —— 锚① boot graph 供给 inject 目标与模块表基线
  (锚定 launcher 安装树),锚② profile node_modules 供给插件自身物化;
  插件 bundle 内只有 `react/jsx-runtime` + `@deepseek-ai/dsh-client-store`
  两个外部 require(均为模块表基线词),插件包内不携带 cordis/ui-*。
- **版本对齐**:launcher `@deepseek-ai/dsh@0.1.6-alpha.2`(exact)≡ 插件
  peers exact `0.1.6-alpha.2` ≡ `vendor/upstream.lock.json`
  `desktopHostVersion: 0.1.6-alpha.2`;cordis `4.0.2` 独立版本线未参与比对。
  裸 `npx @deepseek-ai/dsh` 会拿到 `latest=0.1.5-rc.2`(dist-tag 陷阱在
  launcher 侧同样成立 —— 官方 web 验证必须 exact 指定 launcher 版本)。
- **移交任务 5**:① 本侧 `plugin add` 走的是**官方 profile 目录**(`~/.dsh/profiles/web`),
  壳自有 profile 目录(userData 下)的行为仍属 spike 未验证项①,由任务 5 单独落档;
  ② 本侧插件物化形态为 **tarball(prod 形态)**,`link:` dev 形态与 out-of-tree
  解析细节由任务 5 分述;③ 最小稳定子集 inject(locale/ui-chat/ui-renderer)
  在官方 web boot graph 内**全部解析成功**(3 边合法运行,对照 ui-goal 7 边
  全集的等价性结论由任务 5 落档)。

## 3. AC2:撞键复制品 fixture(第二自装插件)

**交付物**:`packages/plugins/hello-world-collision`
(`@dsh-forge/plugin-hello-world-collision`,与 hello-world 同版本纪律:
peers exact `0.1.6-alpha.2`、cordis 4.0.2 单列、零 vendored 引用、ui-goal 形态、
`dsh.bundle.patch` + root insert row)。hello-world 的结构复制品:同一目标槽
`conversation.chat.assistant-actions`,同一五股注册结构(children + store 席位 +
locale + 面板),build-time `MODE` 常量(`src/client/mode.ts`)四档:

| MODE | children 键 | entry id | priority | 探测机制 |
|---|---|---|---|---|
| `replica`(默认提交档) | `hello-world.panel`(与 hello-world 同名) | `hello-world-replica` | 默认 0 | 声明撞键 |
| `coexist` | `collision-replica.panel`(自有) | `hello-world-replica` | 默认 0 | 无撞键对照 |
| `shadow` | `collision-replica.panel` | `hello-world`(同格) | **-1** | 分层接管 |
| `tie` | `collision-replica.panel` | `hello-world`(同格) | **0** | 同格同级 |

**独立装配运行实证(场景 S1,2026-09-22 01:31)**:profile web 移除
hello-world、单独安装 fixture(replica 档)后启动官方 web —— boot graph 含
`@dsh-forge/plugin-hello-world-collision`(唯一 @dsh-forge 条目),历史会话
轮尾渲染复制品面板:「撞键复制品 — 来自 hello-world-collision fixture 的第二块面板 /
复制品招呼 / 复制品招呼数:0 / 复制品子槽位默认内容」;0 pageerror。
**AC2 PASS**:同名键在 hello-world 缺席时由 fixture 首声明,合法独跑。

## 4. AC3:撞键行为实测矩阵(三型归档)

通用复现(每个场景仅三处变量:fixture 的 MODE 档、profile 里两插件的装/卸、
重启动):

```bash
# 1. 切档: 编辑 packages/plugins/hello-world-collision/src/client/mode.ts 的 MODE 常量
cd packages/plugins/hello-world-collision && pnpm build && pnpm pack --pack-destination <tmp>
# 2. 换装(remove+add 强制重物化):
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 plugin --profile web remove @dsh-forge/plugin-hello-world-collision
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 plugin --profile web add <tmp>/dsh-forge-plugin-hello-world-collision-0.1.0.tgz
# 3. 重启 + 观察:
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 web --no-open
node scripts/acceptance/dsh-web-probe.mjs --url "<URL>" --label S<n> --open-session
```

### S2 声明撞键(核心实验:同名 `hello-world.panel`)→ **型③ 启动期显式报错**

装配:hello-world + fixture(replica)同时安装;profile bundles 顺序 =
`[base, web-app, collision, hello-world]`(reconcile 按依赖装入序追加,后装者殿后)。

观察(2026-09-22 01:32):

- 启动期 **pageerror**(浏览器未捕获错误,devtools 可见):
  `Error: slot "hello-world.panel" is already declared (by an entry in "conversation.chat.assistant-actions" (hello-world-collision))`
  —— 报错**点名先声明者**(registrant 标签),后加载的 hello-world 的
  register 调用抛出、其面板不渲染。
- 先声明者(fixture)面板正常渲染;boot graph 两插件都在;应用**未崩溃**,
  其余 UI 正常(1 pageerror / 0 console-error,会话可开)。
- 顺序可复现且确定:bundle 顺序决定先声明者;单测(slots.spec.ts)验证
  反序时抛错方对调(fixture 先装 → hello-world 抛)。

**归档**:型③(启动期显式报错,声明形式)。非静默:后到者显式抛错、先到者
确定保留、报错文本可观察可复现;宿主对该错误的处理 = webview pageerror +
插件贡献缺席,**不阻断整树启动**(JetBrains extension points 成例的对应物:
声明合并显式化 + 冲突启动期可见)。

### S5 同格同级(cell tie)→ **型③ 启动期显式报错(同格形式)**

装配:hello-world + fixture(tie)(同 id `hello-world`,同 priority 0)。

观察(2026-09-22 01:34):启动期 pageerror:
`Error: list slot "conversation.chat.assistant-actions" already has an entry with id "hello-world" at priority 0 (registered by lc) — register at a different priority to shadow it (lowest renders)`
—— 报错点名占用者、同级数,并**内联补救提示**(换 priority 即分层);
先占用者(hello-world)面板照常渲染,fixture 面板缺席;应用不崩溃。
注:`(registered by lc)` 为运行时 Service 包装层盖的调用方 fiber 名
(hello-world 未显式传 registrant)。

**归档**:型③(同格形式)。

### S4 同格异级(cell shadow)→ **型② 分层覆盖**

装配:hello-world(priority 0)+ fixture(shadow:同 id,priority **-1**)。

观察(2026-09-22 01:33):

- 0 pageerror / 0 console-error(**分层不抛错** —— 与 S5 的本质差异)。
- 渲染面**确定性翻转**:轮尾只剩 `[data-dsh-forge-plugin="hello-world-collision"]`
  面板,hello-world 面板消失(升序 priority,最低者渲染,fixture -1 胜出)。
- 双方都在 boot graph;败者仍在台账(单测证据:`SlotCore.entries` 保留双条,
  `entriesOfSlot` 投影出唯一胜者;现场可观察面 = DOM 翻转 + roster 双在场)。

**归档**:型②(分层覆盖)—— 规则确定(数值 priority 定序)、胜者可观察
(DOM)、败者可观察(roster + 台账),非静默。

### S3 异 id 异键(coexist)→ **型① 合并共存**

装配:hello-world + fixture(coexist:自有键 `collision-replica.panel`,
id `hello-world-replica`)。

观察(2026-09-22 01:32):0 pageerror;同一轮尾**两块面板并存**:
`["hello-world", "hello-world-collision"]`,各自子槽位默认内容各自渲染
(`hello-world.panel` 与 `collision-replica.panel` 两键同时声明、互不垄断)。

**归档**:型①(合并共存)—— list 槽多插件按 id 合格共存,正是 SC6
「第三方插件与工作台插件槽位冲突」风险行想要的共存面证据。

### 三型总表

| 场景 | 撞键轴 | 结果 | 归档型 | 静默? |
|---|---|---|---|---|
| S2 | 同声明键(同名子槽位) | 后到者启动期抛错点名先声明者,先到者保留,应用不断 | **③ 启动期显式报错** | 否 |
| S5 | 同格(id)同 priority | 后到者抛错 + 补救提示,先占者保留 | **③(同格形式)** | 否 |
| S4 | 同格异 priority | 确定性分层接管,胜者渲染翻转,败者留台账 | **② 分层覆盖** | 否 |
| S3 | 异 id 异键 | 两面板合并共存 | **① 合并共存** | 否 |

**Hard Rule 核查**:四场景结论全部落档三型之一、附复现步骤与观察到的 UI
结果;任何场景都不存在「静默后者覆盖且不可观察」—— S2/S5 后到者显式抛错,
S4 覆盖有确定规则且胜败双方皆可观察,S3 无覆盖。

## 5. M2 移交语(SC6 → M2 真实工作台槽位设计)

- ui-slots 撞键语义 = **CSS 级联式显式分层 + 启动期 fail-loud**:声明键撞键
  与同格同级一律启动期抛错(点名对方),同格异级按 priority 数值分层,
  异格合并 —— 工作台自有槽位设计可直接继承该语义,无需发明新机制。
- 宿主对插件注册抛错的现实行为 = **webview pageerror + 该插件贡献缺席,
  不阻断整树** —— M2 若要求「必备插件缺失即启动失败」,需在壳侧另行
  加门(本任务未涉及,仅记录现状)。
- profile bundles 顺序 = 声明先后的确定序源(reconcile 按装入序追加);
  M2 槽位文档应写明该顺序语义。

## 6. 现场还原记录

实验结束后(2026-09-22 01:35):profile web 移除两插件,manifest 恢复
`bundles = [dsh-base, dsh-web-app]`(与快照语义等价:dependencies 空对象被
pnpm 顺手清键;`@dsh-forge` 空 scope 目录残留为 pnpm 标准行为,已手工清除);
fixture 源码 MODE 常量还原 `replica` 并重构建。`~/.dsh/profiles/node_modules`
模块回退链接未受 npx launcher 启动影响(仍指向本地 checkout,由下次任一
launcher 运行自行维护)。探针与全部场景日志(boot-s*.log / S*-probe.log)
留档于执行会话临时目录,载荷行已内联本文。
