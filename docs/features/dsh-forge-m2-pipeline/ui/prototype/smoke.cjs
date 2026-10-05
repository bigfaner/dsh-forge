/* M2 UI 原型冒烟（评审辅助）：真实浏览器加载 index.html，断言四 UF 关键面。
   运行：node smoke.cjs（依赖仓库根 node_modules 的 Playwright + 本机 chromium 缓存）。 */
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(path.resolve(__dirname, '../../../../../node_modules/@playwright/test'))

const EXE = 'C:/Users/panda/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe'
let pass = 0, fail = 0
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name) }
}

;(async () => {
  const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {})
  const page = await (await browser.newContext()).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'))

  console.log('— UF-1 概览 · 任务列表 —')
  ok(await page.locator('.rb-chip', { hasText: '概览' }).count() === 1, '概览页签在场')
  ok(await page.locator('.st-chip').count() === 7, '七态过滤 chips ×7')
  ok(await page.locator('.task-row').count() >= 8, '任务行 ≥8（m2 feature 种子）')
  ok(await page.locator('.task-row', { hasText: '2.5' }).locator('.status-tag.st-blocked').count() === 1, 'blocked 行带 st-blocked 态')
  ok((await page.locator('.task-group-label').first().textContent()).includes('执行中'), '执行中置顶分组')
  await page.locator('.task-row', { hasText: '2.4' }).first().click()
  ok(await page.locator('.task-detail .tl-verb').count() >= 2, '行展开时间线（claim/幂等重入记录）')
  await page.locator('.st-chip', { hasText: '待办' }).click()
  ok(await page.locator('.task-row').count() === 5, 'chips 过滤生效（待办 ×5）')
  await page.locator('.st-chip', { hasText: '清过滤' }).click()

  console.log('— 人工转移（人类通道）—')
  await page.locator('.task-feat-pill').click()
  await page.locator('.menu-item', { hasText: 'demo-lib-refactor' }).click()
  ok(await page.locator('.task-row').count() === 3, 'feature 切换（demo-lib-refactor ×3 行）')
  await page.locator('.task-row', { hasText: '1.3' }).locator('.task-more').click()
  await page.locator('.menu-item', { hasText: '转 已完成' }).click()
  ok(await page.locator('#trans-why').count() === 1, '转移对话框在场（原因必填）')
  await page.locator('[data-act="trans-apply"]').click()
  ok((await page.locator('.toast').last().textContent()).includes('原因必填'), '空原因被拒（Toast）')
  await page.fill('#trans-why', '人工确认旧方案废弃补验收')
  await page.locator('[data-act="trans-apply"]').click()
  ok(await page.locator('.task-row', { hasText: '1.3' }).locator('.status-tag.st-completed').count() === 1, '转移生效 → completed')

  console.log('— UF-3 会话头部挂接 —')
  ok(await page.locator('#conv-actions .pill').count() >= 2, '挂接 pill + 运行态在场（s-disp-1）')
  await page.locator('.sess-row', { hasText: 'executor · 2.4' }).click()
  ok(await page.locator('#conv-actions [data-act="task-goto"]').count() === 1, '切会话（executor）→ 头部挂接随之（执行型）')
  await page.locator('#conv-actions [data-act="task-goto"]').first().click()
  ok(await page.locator('.task-row.is-open').count() === 1, '挂接 pill 点击 → 概览定位任务（行展开）')

  console.log('— ⚡ 模拟 tool 写入（即时刷新 + 恢复钩子）—')
  await page.locator('[data-act="sim-write"]').click() // 2.4 in_progress → completed（提交门 ✓）
  ok(await page.locator('.task-row', { hasText: '2.4' }).locator('.status-tag.st-completed').count() === 1, 'submit 写入即时可见（2.4 → completed）')
  await page.locator('[data-act="sim-write"]').click() // fix-1 in_progress → completed → 前置全满足
  ok(await page.locator('.task-row', { hasText: 'fix-1' }).locator('.status-tag.st-completed').count() === 1, 'fix-1 → completed（即时可见）')
  ok(await page.locator('.task-row', { hasText: '2.5' }).locator('.status-tag.st-pending').count() === 1, '恢复钩子：2.5 blocked → pending（auto-restore）')

  console.log('— UF-2 文档页签（SC4）—')
  await page.locator('.rb-chip', { hasText: '文档' }).click()
  ok(await page.locator('.tree-row.dir').count() === 3, '组行 ×3（proposals + 2 feature）')
  ok(await page.locator('.tree-row.file').count() === 8, '文件行 ×8（提案 2 + feature 文档 6）')
  ok(await page.locator('.tree-row.file.is-dangling').count() === 1, '悬空行 ×1（⚠ 淡化）')
  await page.locator('.tree-row.file', { hasText: 'tech-design.md' }).click()
  ok(await page.locator('.doc-pathbar .p').first().textContent().then(t => t.includes('demo-proj\\docs\\features')), 'canonical 路径栏（绝对路径）')
  ok((await page.locator('.doc-body h1').first().textContent()).includes('Tech Design'), '正文只读渲染（Markdown）')
  await page.locator('[data-act="doc-back"]').click()
  await page.locator('.tree-row.file.is-dangling').click()
  ok(await page.locator('.doc-dangling').count() === 1, '悬空详情态 = 只读缺省渲染占位')
  ok(await page.locator('.doc-pathbar').count() === 1, '悬空态路径栏保留（不删行不崩溃）')
  await page.keyboard.press('Escape')
  ok(await page.locator('.tree-row.file').count() === 8, 'Esc 返回列表态')

  console.log('— UF-4 注册表单派生行 —')
  await page.locator('[data-act="form-open"]').click()
  const v = await page.locator('#ap-tasks').inputValue()
  ok(/-[0-9a-f]{8}$/.test(v), '派生行含 hash8 后缀：' + v)
  await page.locator('[data-act="suspect-toggle"]').click()
  ok(await page.locator('.form-err').count() === 1, '疑似移动 → 错误条 + 指引在场')
  ok(await page.locator('[data-act="form-confirm"]').isDisabled(), '疑似移动 → 确认被拒（禁用）')
  await page.locator('[data-act="suspect-toggle"]').click()
  ok(await page.locator('.form-err').count() === 0, '复检通过 → 错误条消失')

  console.log('— 主题切换 —')
  await page.locator('[data-act="theme-toggle"]').click()
  ok(await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), '暗主题生效')

  ok(errors.length === 0, '零页面 JS 错误' + (errors.length ? '：' + errors.join(' | ') : ''))
  await browser.close()
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
