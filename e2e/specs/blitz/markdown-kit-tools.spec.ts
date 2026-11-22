// @proposal:md-mermaid-doc-convert @web-e2e
// markdown-kit 工具面真调 e2e——convertDocument + getOutline 两工具（契约
// contracts/convert-document.md CD-1..CD-6、contracts/get-outline.md GO-1..GO-3）。
//
// 真调口径（零模型 e2e 的真机等价形，撰写期声明假设）：
//   - 真机装配链证据 = 官方宿主实拉（launchHost）+ 夹具工作区注册 + 官方芯片流开会话 +
//     files tab data-files-root 断言（会话 cwd = 夹具工作区根——工具落盘锚的真机绑定面，
//     md-mermaid-plugin.spec 同径动线）；
//   - 工具真执行 = 经 dev 宿主装载正本同物（plugins/markdown-kit/dist/host/index.js
//     ——cordis.patch.yml 全局行装载入口）的工具工厂 + 真实 fs + 真实引擎（mammoth /
//     pdfjs-dist）真调 execute，session cwd 锚经 ToolExecFace 注入真实夹具工作区；
//   - 模型驱动会话内 agent 真调（非确定性参数）归提案 §三 真机取证轮（dogfood），
//     不入自动门——本 spec 承载全部契约条目的确定性判定面。
//
// 断言纪律（testing/core.md）：
//   - 每条断言标注来源契约条目 id（断言-契约溯源）；
//   - typed error code 精确相等断言（禁「返回失败即可」恒真形）+ fs 侧产物快照对账
//     （失败零落盘 = 恒真禁令的反例锚）；
//   - 落盘路径 / 摘要字段 / 树形结构 / 行号锚断言，不锁文档内容字面（样本声明串除外
//     ——契约 CD-1/CD-3 明示「可辨识内容」语义）；
//   - 夹具 = 仓外 tmp（AGENTS.md 过程件纪律），样本字节自仓内固化 fixture 拷贝
//     （指纹对账见 proposal testing/journey.md 附录 A）；
//   - 每例自持串行启停（closeApp 后复启），跑批结束零残留。
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import { closeApp, launchHost, type Launched } from '../../support/launch.js'
import { registerProject, selectWorkspaceViaChip } from '../../support/rpc.js'
import { revealRightbar } from '../../support/navigation.js'
import { rmDirBestEffort } from '../../support/cleanup.js'
import { FILES_BODY, guideEntryOf } from '../../support/anchors.js'

// 工具真执行面 = dev 宿主装载正本同物（cordis.patch.yml 全局行 → 包 main
// dist/host/index.js——bundle-host 自含产物，与被测应用装载面同源）。
import {
  createConvertDocumentTool,
  createGetOutlineTool,
  isConvertDocumentError,
  isGetOutlineError,
} from '../../../plugins/markdown-kit/dist/host/index.js'

// ── 仓内固化 fixture（proposal testing/journey.md 附录 A 指纹基线）──

const FIXTURES = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'tests', 'markdown-kit', 'doc-convert', 'fixtures')
const SAMPLE_FILES = ['doc-with-image.docx', 'text-sample.pdf', 'scanned-sample.pdf', 'legacy-sample.doc'] as const

/** 样本声明串（契约 CD-1/CD-3「可辨识内容」锚——非全文逐字锁定） */
const DOCX_HEADING = 'Markdown Kit Conversion Sample'
const PDF_TEXT_1 = 'PDF Text Extraction Sample'
const PDF_TEXT_2 = 'Second line for two-block extraction.'

// ── 夹具工作区 ──

function makeFixtureWorkspace(): string {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mkt-'))
  const samples = join(fixtureRoot, 'mkt-demo', 'samples')
  mkdirSync(samples, { recursive: true })
  for (const f of SAMPLE_FILES) copyFileSync(join(FIXTURES, f), join(samples, f))
  copyFileSync(join(FIXTURES, 'outline-sample.md'), join(fixtureRoot, 'mkt-demo', 'outline-sample.md'))
  return fixtureRoot
}

/** samples/ 重置（CD-2/CD-3 起跑零串扰前置——先清前一例产物再重拷固化字节） */
function resetSamples(fixtureRoot: string): void {
  const wsDir = join(fixtureRoot, 'mkt-demo')
  rmSync(join(wsDir, 'samples'), { recursive: true, force: true })
  const samples = join(wsDir, 'samples')
  mkdirSync(samples, { recursive: true })
  for (const f of SAMPLE_FILES) copyFileSync(join(FIXTURES, f), join(samples, f))
}

/** 工作区相对路径全集快照（零落盘对账锚——递归、排序、归一正斜杠） */
function snapshotWorkspace(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) {
        out.push(relative(root, abs).replaceAll('\\', '/'))
        walk(abs)
      } else {
        out.push(relative(root, abs).replaceAll('\\', '/'))
      }
    }
  }
  walk(root)
  return out.sort()
}

const diffSnapshot = (before: string[], after: string[]): string[] => after.filter((p) => !before.includes(p))

// ── 工具真调面（session cwd 锚 = 真实夹具工作区根——ToolExecFace 真形状注入）──

interface ToolExecLike {
  agent?: { session?: { header?: { cwd?: string }; cwd?: string } }
}

const execIn = (wsDir: string): ToolExecLike => ({ agent: { session: { header: { cwd: wsDir } } } })

async function expectToolError(
  pending: Promise<unknown>,
  isTypedError: (e: unknown) => boolean,
  code: string,
  label: string,
  messageRe?: RegExp,
): Promise<void> {
  let raised: unknown
  try {
    await pending
  } catch (e) {
    raised = e
  }
  expect(raised, `${label}：typed error 抛出（非静默成功）`).toBeDefined()
  expect(isTypedError(raised), `${label}：typed error 类型判别（结构面自证）`).toBe(true)
  expect((raised as { code: string }).code, `${label}：error code 精确相等（非恒真）`).toBe(code)
  if (messageRe !== undefined) {
    expect(String((raised as Error).message), `${label}：消息语义在场（文案不锁字面）`).toMatch(messageRe)
  }
}

// ── 旅程一：convertDocument 真调链（契约 convert-document.md CD-1..CD-6）──

test('@web-e2e @blitz markdown-kit convertDocument 宿主真调：会话工作区绑定 + docx assets/discard 双策略落盘 + pdf 提取 + 拒绝分支三码零落盘', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeFixtureWorkspace()
  const wsDir = join(fixtureRoot, 'mkt-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mkt-ud-'))
  const convert = createConvertDocumentTool({})
  let launched: Launched | undefined
  try {
    // ── 真机装配链动线：注册 → 芯片流开会话 → files tab 根绑定断言（md-mermaid spec 同径）──
    launched = await launchHost({ userData, expectPhase: 'hero' })
    const { page } = launched
    await registerProject(page, wsDir, 'mkt-demo')
    await selectWorkspaceViaChip(page, 'mkt-demo')
    await revealRightbar(page)
    const filesCard = page.locator(guideEntryOf('files')).first()
    await expect(filesCard, '官方文件入口卡在场（guide 种子页「工作区文件」）').toBeVisible({ timeout: 30_000 })
    await filesCard.click()
    const filesBody = page.locator(FILES_BODY).first()
    await expect(filesBody, 'files tab body 挂载').toBeVisible({ timeout: 30_000 })
    expect(
      (await filesBody.getAttribute('data-files-root'))?.toLowerCase(),
      'INV-C1 真机面：会话 cwd = 夹具工作区根（files 根绑定）',
    ).toContain('mkt-demo')

    // ── CD-1 docx assets 策略（journey 1.1）——落盘 + 引用改写 + 摘要对账 ──
    const before1 = snapshotWorkspace(wsDir)
    const summary1 = (await convert.execute(
      { docRel: 'samples/doc-with-image.docx', images: 'assets' },
      execIn(wsDir),
    )) as Record<string, unknown>
    expect(summary1.ok, 'CD-1：成功态 ok = true').toBe(true)
    expect(summary1.outRel, 'CD-1：输出 md 相对路径（同目录同名 .md）').toBe('samples/doc-with-image.md')
    expect(summary1.engine, 'CD-1：docx 引擎').toBe('docx')
    expect(summary1.extractedImages as number, 'CD-1：抽取图片数 ≥ 1').toBeGreaterThanOrEqual(1)
    expect(summary1.discardedImages, 'CD-1：assets 态零 discard 字段（可选键 undefined 剔除）').toBeUndefined()
    const outMd1 = join(wsDir, 'samples', 'doc-with-image.md')
    expect(existsSync(outMd1), 'CD-1 State：输出 md 落盘在工作区（INV-C1）').toBe(true)
    const md1 = readFileSync(outMd1, 'utf8')
    expect(md1, 'CD-1 State：标题语义内容在场（样本声明串）').toContain(DOCX_HEADING)
    expect(md1, 'CD-1 Side-effect：图片引用改写为 assets/ 相对路径').toMatch(/!\[[^\]]*\]\(assets\/[^)]+\)/)
    expect(md1, 'CD-1 Side-effect：非 base64 嵌入').not.toContain('data:image')
    expect(md1, 'CD-1 Side-effect：非 docx 内部路径').not.toContain('word/media')
    const assetsDir = join(wsDir, 'samples', 'assets')
    expect(existsSync(assetsDir), 'CD-1 State：assets/ 目录在场').toBe(true)
    expect(readdirSync(assetsDir).length, 'CD-1 State：抽取图片文件 ≥ 1 张').toBeGreaterThanOrEqual(1)
    // INV-C3 摘要对账：摘要声明产物 = 盘上新增全集（md + assets 文件，无计划外落盘）
    const delta1 = diffSnapshot(before1, snapshotWorkspace(wsDir))
    expect(delta1, 'INV-C3：摘要声明的输出路径在盘上对账').toContain('samples/doc-with-image.md')
    expect(
      delta1.every((p) => p === 'samples/doc-with-image.md' || p === 'samples/assets' || p.startsWith('samples/assets/')),
      'INV-C3：落盘全集 = 声明产物（无计划外路径）',
    ).toBe(true)

    // ── CD-2 docx discard 策略（journey 1.2）——先清 CD-1 产物（零串扰），零图片副作用 ──
    resetSamples(fixtureRoot)
    const before2 = snapshotWorkspace(wsDir)
    const summary2 = (await convert.execute(
      { docRel: 'samples/doc-with-image.docx', images: 'discard' },
      execIn(wsDir),
    )) as Record<string, unknown>
    expect(summary2.ok, 'CD-2：成功态 ok = true').toBe(true)
    expect(summary2.outRel, 'CD-2：输出 md 相对路径').toBe('samples/doc-with-image.md')
    expect(summary2.discardedImages as number, 'CD-2：零图片抽取声明（discard 计数 ≥ 1）').toBeGreaterThanOrEqual(1)
    expect(summary2.extractedImages, 'CD-2：assets 字段缺席（零抽取）').toBeUndefined()
    const outMd2 = join(wsDir, 'samples', 'doc-with-image.md')
    expect(existsSync(outMd2), 'CD-2 State：输出 md 落盘').toBe(true)
    const md2 = readFileSync(outMd2, 'utf8')
    expect(md2, 'CD-2 State：标题语义内容在场').toContain(DOCX_HEADING)
    expect(md2, 'CD-2 State：零图片引用残留').not.toMatch(/!\[/)
    expect(existsSync(assetsDir), 'CD-2 State：输出旁无 assets 目录（零图片副作用）').toBe(false)
    expect(diffSnapshot(before2, snapshotWorkspace(wsDir)), 'CD-2：落盘全集恰为输出 md 一件').toEqual([
      'samples/doc-with-image.md',
    ])

    // ── CD-3 pdf 文本提取（journey 1.3）——auto 缺省 + 显式 format 同判（INV-C4）──
    resetSamples(fixtureRoot)
    const summary3a = (await convert.execute({ docRel: 'samples/text-sample.pdf' }, execIn(wsDir))) as Record<string, unknown>
    expect(summary3a, 'CD-3：pdf 摘要整形（ok/outRel/engine/pages——auto 按扩展名机械分派）').toEqual({
      ok: true,
      outRel: 'samples/text-sample.md',
      engine: 'pdf',
      pages: 1,
    })
    const outMd3 = join(wsDir, 'samples', 'text-sample.md')
    expect(existsSync(outMd3), 'CD-3 State：输出 md 落盘').toBe(true)
    const md3 = readFileSync(outMd3, 'utf8')
    expect(md3, 'CD-3 State：文本块一在场（样本声明串）').toContain(PDF_TEXT_1)
    expect(md3, 'CD-3 State：文本块二在场（两段提取）').toContain(PDF_TEXT_2)
    const summary3b = (await convert.execute(
      { docRel: 'samples/text-sample.pdf', format: 'pdf' },
      execIn(wsDir),
    )) as Record<string, unknown>
    expect(summary3b, 'CD-3/INV-C4：显式 format:pdf 与 auto 同结果').toEqual(summary3a)

    // ── CD-4 不支持变体拒绝（journey 1.4）——.doc + 扫描件，双例零落盘 ──
    resetSamples(fixtureRoot)
    const before4 = snapshotWorkspace(wsDir)
    await expectToolError(
      convert.execute({ docRel: 'samples/legacy-sample.doc' }, execIn(wsDir)),
      isConvertDocumentError,
      'ERR_UNSUPPORTED_VARIANT',
      'CD-4 ① .doc 老格式',
      /unsupported/i,
    )
    await expectToolError(
      convert.execute({ docRel: 'samples/scanned-sample.pdf' }, execIn(wsDir)),
      isConvertDocumentError,
      'ERR_UNSUPPORTED_VARIANT',
      'CD-4 ② 扫描件（零文本层）',
    )
    expect(diffSnapshot(before4, snapshotWorkspace(wsDir)), 'CD-4/INV-C2：两例拒绝后零落盘残留').toEqual([])

    // ── CD-5 路径穿越拒绝（journey 1.5）——父目录穿越 + 绝对路径，工作区外零写入 ──
    const before5 = snapshotWorkspace(wsDir)
    await expectToolError(
      convert.execute({ docRel: 'samples/doc-with-image.docx', outRel: '../escape.md' }, execIn(wsDir)),
      isConvertDocumentError,
      'ERR_IO',
      'CD-5 ① outRel 父目录穿越',
    )
    await expectToolError(
      convert.execute({ docRel: 'samples/doc-with-image.docx', outRel: 'C:/abs/out.md' }, execIn(wsDir)),
      isConvertDocumentError,
      'ERR_IO',
      'CD-5 ② outRel 绝对路径',
    )
    expect(diffSnapshot(before5, snapshotWorkspace(wsDir)), 'CD-5/INV-C1：工作区内无半成品产物').toEqual([])
    expect(existsSync(join(dirname(wsDir), 'escape.md')), 'CD-5：工作区外零写入（父目录无 escape.md）').toBe(false)

    // ── CD-6 引擎失败（journey 1.6）——伪 docx（进程外公开 fs 构造）→ ERR_CONVERT_ENGINE ──
    writeFileSync(join(wsDir, 'samples', 'broken-docx.docx'), 'this is not a zip archive at all', 'utf8')
    const before6 = snapshotWorkspace(wsDir)
    await expectToolError(
      convert.execute({ docRel: 'samples/broken-docx.docx' }, execIn(wsDir)),
      isConvertDocumentError,
      'ERR_CONVERT_ENGINE',
      'CD-6 损坏 docx',
    )
    expect(diffSnapshot(before6, snapshotWorkspace(wsDir)), 'CD-6：引擎失败零落盘').toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    await rmDirBestEffort(fixtureRoot)
    await rmDirBestEffort(userData)
  }
})

// ── 旅程二：getOutline 真调链（契约 get-outline.md GO-1..GO-3）──

/** 树 → 行号锚全集（先序遍历） */
function collectLines(nodes: readonly unknown[]): number[] {
  return nodes.flatMap((n) => [(n as { line: number }).line, ...collectLines((n as { children: unknown[] }).children)])
}

/** 树 → {title, level, line, children} 探针投影（结构断言面） */
interface NodeProbe {
  title: string
  level: number
  line: number
  children: NodeProbe[]
}

function probeTree(nodes: readonly unknown[]): NodeProbe[] {
  return nodes.map((n) => {
    const node = n as { title: string; level: number; line: number; children: unknown[] }
    return { title: node.title, level: node.level, line: node.line, children: probeTree(node.children) }
  })
}

test('@web-e2e @blitz markdown-kit getOutline 宿主真调：嵌套树/行号锚/depth 截断/代码块 # 零误判/typed error 零副作用', async () => {
  test.setTimeout(420_000)
  const fixtureRoot = makeFixtureWorkspace()
  const wsDir = join(fixtureRoot, 'mkt-demo')
  const userData = mkdtempSync(join(tmpdir(), 'dsh-forge-e2e-blitz-mkt-ud-'))
  const outline = createGetOutlineTool({})
  let launched: Launched | undefined
  try {
    // ── 真机装配链动线（同旅程一——会话 cwd 绑定真机面）──
    launched = await launchHost({ userData, expectPhase: 'hero' })
    const { page } = launched
    await registerProject(page, wsDir, 'mkt-demo')
    await selectWorkspaceViaChip(page, 'mkt-demo')
    await revealRightbar(page)
    const filesCard = page.locator(guideEntryOf('files')).first()
    await expect(filesCard, '官方文件入口卡在场').toBeVisible({ timeout: 30_000 })
    await filesCard.click()
    const filesBody = page.locator(FILES_BODY).first()
    await expect(filesBody, 'files tab body 挂载').toBeVisible({ timeout: 30_000 })
    expect(
      (await filesBody.getAttribute('data-files-root'))?.toLowerCase(),
      '读取锚真机面：会话 cwd = 夹具工作区根',
    ).toContain('mkt-demo')

    const before = snapshotWorkspace(wsDir)

    // ── GO-1 全深度嵌套树 + 行号锚（journey 2.1）──
    const full = (await outline.execute({ docRel: 'outline-sample.md' }, execIn(wsDir))) as { nodes: unknown[] }
    const tree = probeTree(full.nodes)
    expect(tree, 'GO-1/INV-O1：根节点恰一（h1）').toHaveLength(1)
    const root = tree[0]!
    expect(
      { title: root.title, level: root.level, line: root.line },
      'GO-1：根 = level 1 / line 1（层级语义锚，不锁多余面）',
    ).toEqual({ title: 'Root Heading', level: 1, line: 1 })
    expect(root.children.map((n) => [n.title, n.level, n.line]), 'GO-1：h1 下挂 3 个 h2（L3/L9/L16）').toEqual([
      ['Section Alpha', 2, 3],
      ['Section Beta', 2, 9],
      ['Section Gamma', 2, 16],
    ])
    const alpha = root.children[0]!
    expect(alpha.children.map((n) => [n.title, n.level, n.line]), 'GO-1：Alpha 下挂 h3（L5）').toEqual([['Sub A1', 3, 5]])
    expect(alpha.children[0]!.children.map((n) => [n.title, n.level, n.line]), 'GO-1：h3 下挂 h4（L7）').toEqual([
      ['Deep Leaf', 4, 7],
    ])
    expect(collectLines(full.nodes), 'GO-1/INV-O3：行号锚全集 = 已知锚行（1-based 精确逐值）').toEqual([1, 3, 5, 7, 9, 16])

    // ── GO-2 代码块内 # 零误判（journey 2.2）——同一样本行号集合精确相等（L12 恒缺席）──
    expect(collectLines(full.nodes), 'GO-2/INV-O2：L12 伪标题零误判（行号集精确相等，非子集/包含）').toEqual([1, 3, 5, 7, 9, 16])

    // ── GO-3 depth 截断（journey 2.3）——裁深度不破坏剩余树与行号锚 ──
    const depth2 = (await outline.execute({ docRel: 'outline-sample.md', depth: 2 }, execIn(wsDir))) as { nodes: unknown[] }
    expect(collectLines(depth2.nodes), 'GO-3：depth:2 → 仅 h1+h2 两层（h3/h4 裁）').toEqual([1, 3, 9, 16])
    const d2tree = probeTree(depth2.nodes)
    expect(d2tree[0]!.children.map((n) => [n.title, n.level, n.line]), 'GO-3/INV-O4：剩余树父子关系与行号锚完好').toEqual([
      ['Section Alpha', 2, 3],
      ['Section Beta', 2, 9],
      ['Section Gamma', 2, 16],
    ])
    const depth1 = (await outline.execute({ docRel: 'outline-sample.md', depth: 1 }, execIn(wsDir))) as { nodes: unknown[] }
    expect(collectLines(depth1.nodes), 'GO-3 边界：depth:1 → 仅根单节点').toEqual([1])

    // ── 只读零副作用（GO 契约 State 面）+ typed error 闭集 ──
    await expectToolError(
      outline.execute({ docRel: 'missing-outline.md' }, execIn(wsDir)),
      isGetOutlineError,
      'ERR_INVALID_ARGS',
      'getOutline 样本缺席',
      /cannot read document/,
    )
    await expectToolError(
      outline.execute({ docRel: '../outside.md' }, execIn(wsDir)),
      isGetOutlineError,
      'ERR_IO',
      'getOutline docRel 穿越拒绝',
    )
    await expectToolError(
      outline.execute({ docRel: 'C:/abs/outline.md' }, execIn(wsDir)),
      isGetOutlineError,
      'ERR_IO',
      'getOutline docRel 绝对路径拒绝',
    )
    expect(diffSnapshot(before, snapshotWorkspace(wsDir)), 'getOutline 只读工具：全程零落盘副作用').toEqual([])
  } finally {
    if (launched !== undefined) await closeApp(launched.app)
    await rmDirBestEffort(fixtureRoot)
    await rmDirBestEffort(userData)
  }
})
