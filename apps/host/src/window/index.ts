// window/ barrel（定位：基础——窗口生命周期 + 壳文档服务）。
// fix-8：配对独立窗模块退役（配对面承载改回 web 官方 Modal dialog）。
export * from './create.js'
export * from './lifecycle.js'
export * from './web-document.js'
export { forwardRendererConsole, type ConsoleMessageFace } from './console-forward.js' // app-observability 1.2
