# dsh 客户端插件工程模板(template-plugin)

从本模板出发,你可以为一个 dsh 宿主(官方 `dsh web`,或任何按同一机制装配 profile 的宿主)写一个自己的客户端插件。模板内置了经过实测的标准姿势:

- **消费(consume)**:注入一个既有稳定核心槽位(`ui-chat` 的 `conversation.chat.assistant-actions`,即聊天消息尾部的动作条),拿到类型安全的组合 props(runtime 份额、store 席位、locale `t` 席位、renderSlot 份额);
- **贡献(contribute)**:在同一注册调用里声明一个**自有子槽位**(`template.panel`)+ 一个**store 席位**——其他第三方插件可以注册进你的子槽位来扩展你;
- **dsh UI 复用约定**:客户端 bundle 只能 require 模块表基线内的包(见 `tsdown.config.ts` 注释:react 家族、cordis、`dsh-client-store` / `dsh-client-ui-slots` / `dsh-client-ui-primitives` / `dsh-client-ui-dockkit`),其余一律内联;界面样式优先用宿主的 `--dsh-*` CSS 变量与 `dsh-client-ui-primitives` 组件,不自建第二套组件体系。

本模板与 npm 上的 `@deepseek-ai/dsh-client-*` 契约族协同工作,**全程不需要任何 dsh 源码仓或 vendored 树**——依赖全部来自 npm registry。

## 0. 前置条件

| 项 | 要求 |
|---|---|
| Node | 22.19+ 或 24+ |
| 包管理 | pnpm(插件自己的目录内使用;npm/yarn 亦可,但下文命令以 pnpm 为准) |
| dsh 启动器 | `npx -y @deepseek-ai/dsh@0.1.6-alpha.2`(**必须 exact 指定版本**,原因见 §1 的 dist-tag 陷阱) |

## 1. 第一步:获取模板并安装依赖

本模板的产出方式为**文档化参照 + 可复制目录**:把整个模板目录复制到你自己的工作区(重命名为你的插件名),不依赖任何脚手架服务。仓公共化之后也可以用 degit 拉取子目录(`npx degit <this-repo>/packages/templates/plugin my-plugin`),但「复制目录」永远是可用形态。

```bash
# 复制模板目录为你的插件包(来源:你获取本模板的任意渠道)
cp -r template-plugin/ my-plugin/ && cd my-plugin
pnpm install
```

**依赖声明的铁律(为什么 peerDependencies 长这样)**:

- 所有 `@deepseek-ai/dsh-client-*` 依赖(宿主契约族)**必须 exact 且与宿主版本一致**(当前对齐线:`0.1.6-alpha.2`)。**禁止裸包名、禁止 `^`/`~`/范围**——npm 的 dist-tag `latest` 停在远古版本(如 `0.0.1-rc.1`),现行版本只在 `alpha` tag 下;裸装或 `^` 会**静默拿到旧契约**,错误在运行期才暴露。
- **禁止把 monorepo 工作区写法照抄出来**:模板内不得出现 `workspace:^` / `workspace:*` / 仓内 `file:` 引用——它们离开原仓库即坏。本模板的 peer/dev 声明全部是 npm registry 形态,照抄即安全。
- `@deepseek-ai/cordis` 是**独立版本线**(当前 `4.0.2`),只要求 exact 锁定,不与宿主版本对齐。
- `dsh-client-store` 的发布产物在 Node 上下文需要 `zustand`/`immer`,故 devDependencies 里单列 exact 锁定。

安装时不会有 peer 告警(peers 同时以 devDependencies 在场,供本地 typecheck/build);**装进宿主时**的 peer "missing" 告警则是设计内行为(见 §3)。

## 2. 改名与定制

按 `src/client/index.ts` 顶部注释的改名表,把模板标识换成你自己的:

| 模板占位 | 换成 | 出现位置 |
|---|---|---|
| `@dsh-forge/template-plugin` | 你的包名 | `package.json`、`tsdown.config.ts`、`cordis.patch.yml` |
| `template.panel` | `<your-plugin>.panel` | `contract.ts`、`client/index.ts`、`TemplatePanel.tsx` |
| `template`(locale 命名空间) | 你的命名空间 | `client/index.ts`、`contract.ts` |
| `template-demo`(entry id) | 你的 entry id | `client/index.ts`、`cordis.patch.yml` |
| `TemplatePanel` / 文案 | 你的面板与文案 | `TemplatePanel.tsx`、`locales.ts` |

改完跑 `pnpm typecheck && pnpm build`——能过即说明声明合并(SlotMap / LocaleNamespaceMap)与契约面一致。

**槽位撞键语义(实测结论)**:同名子槽位声明或同格同级(priority 相同)会在启动期**显式报错**并点名先声明者;同格不同 priority 按数值分层(最低者渲染);不同 id 不同键合并共存。给 entry 挑一个独有的 id 与 priority,就不与既有插件冲突。

## 3. 第二步:装进宿主(engines 式版本兼容声明)

`package.json` 里的

```json
"engines": { "@deepseek-ai/dsh": "0.1.6-alpha.2" }
```

是**宿主版本兼容声明**(VS Code `engines.vscode` 的对应物):声明本插件面向的 dsh 宿主版本线,与 peer 对齐线同源同值。上游还在 0.1.x alpha 快速演进期,因此**用 exact 而不是范围**;宿主升级时把 peer 声明、engines 声明一起 bump 到新的 exact 版本。

构建、打包、安装、运行:

```bash
pnpm build && pnpm pack --pack-destination /tmp
# 装进你的 profile(以官方 web 模板 profile 为例;launcher 版本必须 exact)
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 plugin --profile web add /tmp/<your-plugin>-0.1.0.tgz
# 启动官方 web(不自动开浏览器),用输出的 loopback URL+token 访问
npx -y @deepseek-ai/dsh@0.1.6-alpha.2 web --no-open
```

- `plugin add` = 在 profile 目录内 pnpm 安装 tarball + 自动把包追加进 `dsh.profile.bundles`(与宿主内置插件同机制,无需改宿主任何代码)。
- 安装期 peers 报 "missing" **WARN 不阻断是设计内行为**:profile 的 pnpm 配置 `autoInstallPeers: false`,peers 在运行时从宿主 boot graph 解析——这正是 peer 声明的意义(你的包内不携带 cordis/ui-*,与宿主共享同一实例)。
- 换装同版本 tarball 用 remove + add 强制重物化:`... plugin --profile web remove <your-plugin>` 再 add。
- 新建一个全新 profile 也可以:`npx -y @deepseek-ai/dsh@0.1.6-alpha.2 <profile-name> --from-default-profile web` 会从官方 web 模板初始化后再启动。

**面板在哪能看到**:模板消费的槽位只在**已完成的 assistant 轮次尾部**渲染——打开一个**已有历史的会话**(不要点新建会话),消息尾部即出现你的面板;点击按钮计数增长,证明是运行链路而非静态注入;面板右侧的默认内容就是你的自有子槽位,等其他插件注册。

## 4. 版本戳(version-stamp.json)与升级纪律

模板随包携带一个 `version-stamp.json`(模板维护方从其对齐基线派生的确定性记录:目标宿主版本、cordis 线、上游 SHA)。对第三方使用者,它是**来源凭证**——标明这份模板快照面向哪条版本线。上游版本演进时:模板维护方在同一 diff 内 bump peer 声明、engines 声明、版本戳;你自己的插件则把 peer 与 engines 一起 bump 到新 exact 版本后重新构建。

## 5. 常见问题

- **面板不出现**:① 当前会话是新建空会话(无完成的 assistant 轮次)——打开历史会话;② 打开浏览器 devtools 看 pageerror——插件注册抛错表现为 pageerror + 该插件贡献缺席,应用本身不会崩;③ 确认 tarball 是最新构建(remove + add 重装)。
- **安装报 peer missing 警告**:见 §3,设计内行为,不是失败。
- **`dsh web` 行为诡异(旧 API/缺组件)**:launcher 用了裸 `npx @deepseek-ai/dsh` 拿到 `latest` 旧版——重新用 exact 版本启动。
- **想消费别的槽位**:改 `contract.ts` 的 `TARGET_SLOT` 与对应 type-only import;`inject` 数组保持「注册函数实际组合进入的目标面」即可(声明少于实际 require 面会在物化期报错,多声明只是多余的到达约束)。
