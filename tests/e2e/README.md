# M3 SC e2e 基座(任务 6.2)

`tests/e2e/` 是 M3 SC 验收腿(SC1-SC9,任务 6.3-6.8)的公共基座 —— M2 6.1 装置工程(`apps/desktop/e2e/fixtures/`)的目录延续:凡 M2 已有的生成器/桩直接复用,本目录只补 M3 需要的四件 —— 干净环境、两类项目语料、派发通道统一 stub(含审批注入面)、实例锁纪律。全部装置只提交生成器/桩模块,**绝不提交生成产物**;每次运行写入 journey 私有临时目录,测试后清理。

## 目录

| 模块 | 作用 | 主要消费方 |
|---|---|---|
| `fixtures/clean-env.ts` | 干净环境:系统目录级 PATH 净化(大小写变体归一)+ forge CLI 不可达进程探针(裸名×PATHEXT 各形 + shell 形;含假桩反证对照) | SC1(6.3)零 CLI 链 |
| `fixtures/corpus.ts` | 两类项目语料:①未迁移(index.json + 任务 md,M2 writer 复用);②已迁移(真内核链 register→scan→migrate 产出的 `<userData>/workbench/workbench.db` + `.migrated` 归档,md 原样) | SC1/SC2(6.3/6.4)、SC9(6.8) |
| `stubs/dispatch.ts` | 派发通道统一 stub(test 半身):一个目录同时驱动两个 env 缝(`DSH_FORGE_SESSION_STUB_DIR` + `DSH_FORGE_APPROVAL_STUB_DIR`),一份 journal(create/prompt/session-ended/approval 四类) | SC3(6.5)及全部派发腿 |
| `stubs/oracle.ts` | prompt_hash 四件套 oracle(内核三查 + requestId 确定性;spike-3 §4 口径)+ 逐字符语料(CRLF/unicode/行尾空格/收尾换行) | SC3 注入内容断言 |
| `helpers/instance-lock.ts` | 单实例锁纪律:进程表枚举 + dsh-forge 实例识别(repo main.cjs 形 + 打包 exe 形)+ fail-fast 断言 | 全部腿(Hard Rule:跑前必查) |
| `helpers/app.ts` | M3 腿启动器:`launchPluginShell` 预设(强制隔离 userData + 默认干净 PATH + stub env 随行) | 全部腿 |
| `specs/*.spec.ts` | Playwright 腿(project `forge-m3-e2e`;`just web-test-m3 <name>`) | 6.3-6.8 |
| `base-selfcheck.spec.ts` | 基座自检(vitest 快道:探针/语料/oracle/实例锁,含反证对照) | 本任务 AC 证据 |

## 三条纪律(Hard Rules)

1. **实例锁**:任何腿启动应用前必调 `assertNoActiveDshForgeInstances()` —— 本机已有活跃实例即 fail-fast 列出 pid(M1 教训:整片 ERR_SINGLE_INSTANCE)。识别三种形态:repo main.cjs 路径、打包 `dsh-forge*.exe`、以及**任意 checkout 的活跃 host 子进程**(`desktop-host-vendor\vendored\apps\desktop-host` 命令行形态 —— 宿主 webserver 端口 19387 是全机固定的,dev 实例(`electron .` 形态)持端口时,e2e 腿全部以「连接已中断/Desktop Host unavailable」暴毙,持端口者就是必查对象)。
2. **隔离 userData**:`launchWorkbenchShell` 的 `userDataDir` 必填 —— 工作台库/插件 overlay/单实例锁全部钉进 journey 临时目录(`DSH_FORGE_USER_DATA` 缝),绝不复用开发实例 userData。
3. **CI 型 e2e 不混真链路验收**:真链路验收仍走 `scripts/acceptance/live-ui-{probe,sweep}.mjs` 纪律(vendored 闭包教训);本目录全部为 CI 型腿。

## 派发通道统一 stub 协议

test 半身 `createDispatchStub(dir)` 与两个 host 半身(插件内,env 缝驱动,未设置即生产行为)共用一套文件协议:

```
<dir>/control.json   — 会话通道编排(M2 协议原样:create/prompt 三态 + mintSessionId)
<dir>/inject.jsonl   — 审批注入面(append-only,host 150ms 轮询):
                       { "kind": "approval"?, agentId, toolName, callId?, reason? }
                       { "kind": "tool-exec", callId, arguments? }        # pre-execute 捕获
<dir>/journal.jsonl  — 统一观测流(host 追加,test 读取):
                       create / prompt(text=组合首条用户消息逐字) / session-ended / approval
<dir>/inject.cursor  — host 私有消费游标(重启不重放)
```

审批注入走**真桥核**(approval-bridge `handle`:认领过滤 → T2 内核 `approval_receive` → `approval_received` 事件 → UI dock → `settle` 回注)—— 注入面只铸造事件孪生,不绕过路由。

## 跑法

```sh
just web-test-m3 base-smoke        # 单腿(Playwright project forge-m3-e2e)
pnpm exec vitest run tests/e2e     # 基座自检(快道)
pnpm test:e2e                      # 全量(desktop-e2e + forge-m3-e2e,worker=1 串行)
```

前置:`pnpm build:plugins`(桩/插件 host 半身改动后)+ `apps/desktop/dist/main.cjs` 已构建。
