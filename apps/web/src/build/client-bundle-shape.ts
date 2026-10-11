// forge-client 产物形状断言（定位：装配——vite pin 的纯函数面，vite.config.ts 消费）。
// 形态契约（上游 client bundle 注册面，S2 清单 pin）：forge-client.js 必须是零 import/export
// 的自含 classic script（模块系统 defaultLoadBundle 以 <script> 装载求值即注册）——共享 chunk
// 拆分会产出 `import{…}from"./assets/…"` 的 ESM 形，classic script 下 = SyntaxError：元素 load
// 照常触发而求值零执行，模块系统报「loaded without registering … via __ModuleLoader__.load」
// （web boot 报障形态——fix 记录 2026-10-11）。本模块单测面 = apps/web/src/build/。
/** classic script 形状 pin：import/export 语句零容忍 + __ModuleLoader__ 注册面在场。 */
export function assertClientBundleClassicScript(code: string): void {
  // 花括号紧邻（import{n}from）与命名空间（import*as）形态一并捕获——最小化产物零空格，
  // 漏 `{`/`*` 即漏检 413e3dd 类共享 chunk 拆分（2026-10-11 报障前车之鉴）。
  if (/(?<![.\w$])import\s*[("'{*\s]|(?<![.\w$])export\s*[{*(\w]/.test(code)) {
    throw new Error('vite: forge-client 产物含 import/export 语句——classic script 形状破坏（模块系统以 <script> 装载）')
  }
  if (!code.includes('__ModuleLoader__')) {
    throw new Error('vite: forge-client 产物未见 __ModuleLoader__ 注册面')
  }
}
