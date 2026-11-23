// dist bundle 功能等价探针（bug d00302ef 终局修——零运行时依赖 + host 半全 bundling）：
// dist 拷入无 node_modules 的裸目录（type:module）后经纯 node 子进程动态 import——
// 三引擎（mammoth/pdfjs/mermaid）全自 dist 内联闭包解析，docx/pdf/mermaid 功能等价
// 断言全绿。不经 vitest 运行器装载（vite interop 对内联 CJS default 形态失真——
// 纯 node 才是安装代装载语义）；子进程清空 NODE_OPTIONS 防运行器钩子串扰。
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDocx, buildPdf } from './convert/fixtures.js'

const PKG_DIR = join(import.meta.dirname, '..', '..')
const DIST_INDEX = join(PKG_DIR, 'dist', 'host', 'index.js')

describe('dist bundle 功能等价（零 node_modules 裸目录 + 纯 node 子进程）', () => {
  it('三引擎自 dist 内联闭包解析：convertDocument docx/pdf + validateMermaid 全绿', { timeout: 60_000 }, () => {
    expect(existsSync(DIST_INDEX), 'dist 缺席——先 pnpm --filter @dsh-forge/markdown-kit build').toBe(true)
    const bare = mkdtempSync(join(import.meta.dirname, '.tmp-dist-probe-'))
    try {
      cpSync(join(PKG_DIR, 'dist'), join(bare, 'dist'), { recursive: true })
      writeFileSync(join(bare, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8')
      const docxPath = join(bare, 'sample.docx')
      const pdfPath = join(bare, 'sample.pdf')
      writeFileSync(docxPath, buildDocx())
      writeFileSync(pdfPath, buildPdf(['Alpha page', 'Beta page']))
      const entryUrl = `file://${join(bare, 'dist', 'host', 'index.js').replace(/\\/g, '/')}`
      const script = `
        const { readFileSync, writeFileSync } = require('node:fs');
        const envSnapshot = { NODE_OPTIONS: process.env.NODE_OPTIONS ?? null, node: process.version };
        import(${JSON.stringify(entryUrl)}).then(async (m) => {
          const steps = {};
          const step = async (name, fn) => {
            try { steps[name] = await fn(); } catch (e) { steps[name] = 'ERR: ' + String(e && e.stack ? e.stack.split('\\n').slice(0, 2).join(' | ') : e); }
          };
          await step('probe', () => typeof m.convertDocxToMarkdown);
          await step('docx', async () => {
            const outcome = await m.convertDocxToMarkdown(readFileSync(${JSON.stringify(docxPath)}), { images: 'discard' });
            return { heading: outcome.markdown.includes('Quarterly Report'), images: outcome.imagesHandled };
          });
          await step('docx-invalid', async () => { try { await m.convertDocxToMarkdown(Buffer.from('x'), { images: 'discard' }); return 'no-error'; } catch (e) { return 'threw: ' + String(e.message).slice(0, 80); } });
          await step('pdf', async () => {
            const outcome = await m.convertPdfToMarkdown(readFileSync(${JSON.stringify(pdfPath)}));
            return { pages: outcome.pages, text: outcome.markdown.includes('Alpha page') };
          });
          await step('mermaid', async () => (await m.createValidateMermaidTool().execute({ source: 'flowchart TD\\n  A --> B', format: 'mermaid' })).ok);
          writeFileSync(${JSON.stringify(join(bare, 'probe-result.json'))}, JSON.stringify({ envSnapshot, steps }));
        }).catch((e) => {
          writeFileSync(${JSON.stringify(join(bare, 'probe-result.json'))}, JSON.stringify({ envSnapshot, error: String(e) }));
        });
      `
      const scriptPath = join(bare, 'probe.cjs')
      writeFileSync(scriptPath, script, 'utf8')
      const env = { ...process.env, NODE_OPTIONS: '' }
      spawnSync(process.execPath, [scriptPath], { cwd: bare, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 50_000 })
      const result = JSON.parse(readFileSync(join(bare, 'probe-result.json'), 'utf8')) as {
        envSnapshot?: { NODE_OPTIONS?: string | null; node?: string }
        steps?: Record<string, unknown>
        error?: string
      }
      writeFileSync(join(PKG_DIR, '..', '..', '.forge-tmp', 'mdk-probe-result.json'), JSON.stringify(result), 'utf8')
      const steps = (result.steps ?? {}) as {
        probe?: unknown
        docx?: { heading?: boolean; images?: number } | string
        'docx-invalid'?: string
        pdf?: { pages?: number; text?: boolean } | string
        mermaid?: unknown
      }
      expect(steps.probe, `裸目录装载（convertDocx 导出函数）[${JSON.stringify(result.envSnapshot)}]`).toBe('function')
      expect(steps['docx-invalid'], 'docx 非法输入应抛 zip 错误（mammoth 内联运行）').toMatch(/^threw: /)
      const docx = typeof steps.docx === 'object' ? steps.docx : {}
      expect(docx.heading, `docx 引擎（mammoth 内联）功能等价：${JSON.stringify(steps.docx)}`).toBe(true)
      expect(docx.images, 'docx 内嵌图片 discard 策略处理').toBeGreaterThan(0)
      const pdf = typeof steps.pdf === 'object' ? steps.pdf : {}
      expect(pdf.pages, `pdf 引擎（pdfjs 内联 + fake worker 随包）页数：${JSON.stringify(steps.pdf)}`).toBe(2)
      expect(pdf.text, 'pdf 文本提取功能等价').toBe(true)
      expect(steps.mermaid, `mermaid 引擎（内联）判决 ok：${steps.mermaid}`).toBe(true)
    } finally {
      rmSync(bare, { recursive: true, force: true })
    }
  })
})
