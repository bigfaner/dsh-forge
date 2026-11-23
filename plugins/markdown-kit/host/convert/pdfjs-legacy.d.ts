// pdfjs-dist legacy 子路径无类型声明（包 manifest 仅 "." 有 types）——bundle 后字面量
// 动态 import 需要 ambient 形态收口；消费面以结构化窄面（PdfjsModule）锚定，模块面 any 不外溢。
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  const value: unknown;
  export default value;
}
