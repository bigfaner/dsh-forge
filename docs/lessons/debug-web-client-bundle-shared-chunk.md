# debug- web boot 恒报「loaded without registering "@dsh-forge/web-client"」（双入口共享 chunk 拆分）

- Tags: architecture, dependencies, testing
- Date: 2026-10-11
- Source: fix-bug 会话（commit e877196）

## Problem

宿主载入壳页后 web boot 恒失败：`web boot: 1 entry did not activate` + `@dsh-forge/web-client: import failed: client-modules: could not load "@dsh-forge/web-client": forge-client.js?rev=…: loaded without registering "@dsh-forge/web-client" via __ModuleLoader__.load`。错误文案指向「注册面未调用」，但 client 入口源码注册语句在场、e2e 等待 `__DSH_FORGE_CLIENT__` 激活标记 90s 超时——症状与根因（构建产物形状）隔了三层。

## Root Cause

三层错位（413e3dd 引入，构建期护栏有盲区未拦截）：

1. `views/session/ForgeProgressNode.tsx`（壳入口树）runtime import `client-plugin/progress-node.ts`（client 入口树）的纯守卫——vite 双入口（index.html 壳 + client-plugin 第二入口）遇共享模块即拆公共 chunk；
2. 产物 `forge-client.js` 以 `import{n as e,r as t,t as n}from"./assets/progress-node-CcPwg__j.js"` 开头（ESM 形）——模块系统 `defaultLoadBundle` 以 **classic `<script>`** 装载：`import{` 在 classic script 是 SyntaxError，但元素 `load` 事件**照常触发**（语法错误走 window.onerror，不触发 script `error` 事件）→ 模块系统只见「load 完成、factories 无该 id」→ 报「loaded without registering」——文案系统性误导；
3. `vite.config.ts` 形状 pin 的 import 检测正则字符类 `[("'\s]` 漏最小化零空格花括号/星号紧邻形态（`import{`/`import*`）——破坏产物未被构建期拒绝，流到运行期报障。

## Solution

- 守卫+类型归其唯一 runtime 消费者壳树（`views/session/forge-progress-data.ts`），client 树零引用——双入口零运行时共享，rollup 不再拆 chunk，`forge-client.js` 复原 `var` 开头自含 classic script；
- 形状断言抽纯函数 `apps/web/src/build/client-bundle-shape.ts`（vite pin 消费 + 单测面），字符类补 `{`/`*`；
- 守护测试两层：结构池 pin「双入口互禁 runtime import（type-only 豁免）」（tests/structure/web-shell.test.ts）+ 形状断言单测（花括号/命名空间形态必拒）。

## Reusable Pattern

- **「loaded without registering」先查产物形状再查注册语句**：classic script 的语法错误不触发 script `error` 事件（load 照常 fire）——该错误 = 「bundle 求值零执行」的统称，首诊 `dist/forge-client.js` 头 200 字符是否 `import{`/`export` 开头；
- **双入口 bundle 自含纪律 = 值需求走镜像不走 import**：跨入口要字面量/纯函数 = 复制并同源 pin（`main.ts` 插件 id 同款先例），任何 runtime import 共享即拆 chunk——结构性守护（扫源 import 边界）比产物正则更早拦；
- **产物形状正则须覆盖最小化零空格形态**：`import{`/`import*` 与带空格形态并列测试（`apps/web/src/build/client-bundle-shape.test.ts`），否则护栏只在非压缩产物上生效。

## Related Files

- apps/web/src/views/session/forge-progress-data.ts（守卫迁居——唯一 runtime 消费者侧）
- apps/web/src/build/client-bundle-shape.ts（形状断言纯函数 + 盲区补全）
- tests/structure/web-shell.test.ts（双入口零运行时共享 pin）
- apps/web/vite.config.ts（pin 消费点）
- apps/host/profile.dev/node_modules/@deepseek-ai/dsh-client-modules/lib/client.js（defaultLoadBundle——classic `<script>` 装载与 arrive 失败文案的机制源）
