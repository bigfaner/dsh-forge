// CSS modules 类型面（official-input 复制件的 .module.css import——构建期 esbuild
// 插件产出类名恒等映射对象；vite 原生 css modules；vitest 默认 stub 空对象）。
declare module '*.module.css' {
  const css: Record<string, string>
  export default css
}
