// @dsh-forge/knowledge client bundle 入口（knowledge-plugin-migration 1.4 子提交 b——
// UI 三面归位落座：本入口 = faces 组合插件对象正门，scripts/bundle-client.mjs 按
// exports["./client"].types 镜像推导取本件为 esbuild 入口，产出 dist/client.js classic
// 自注册形状；掌舵行 = apps/web main.ts knowledgeClient 块 + vite emit 断言同源）。
export * from './faces.js'
export { default } from './faces.js'
