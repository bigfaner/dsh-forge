#!/usr/bin/env node
// 真实例全量 UI 交互验收(与 live-ui-probe 同链路: 真宿主 + 真 web dist +
// 默认 profile)。逐项驱动壳内可见的全部交互面, 每步 act → wait 可观测变化 →
// PASS/FAIL, 全程采集 console/pageerror 并归属到当前步骤。
//
// 结构: 开局自清理(归档旧验收会话, 防列表虚拟化挤出行) → 基础导航/面板 →
// 会话深层路径(终端 spawn / 发送 / 重命名 / 分叉 / 归档, 全部瞄准本轮创建的
// 验收会话) → 收尾清理。分叉标题格式为 原题(N), 含「验收测试」, 清理可覆盖。
//
// 用法(在 apps/desktop 下运行):
//   node ../../scripts/acceptance/live-ui-sweep.mjs [--send]
//     --send  额外执行「发送消息」真实回合(消耗已配置模型的少量 token)
// 退出码: 0 = 全部 PASS; 1 = 有 FAIL 或启动失败。
import { readFileSync } from 'node:fs'
import { _electron } from '@playwright/test'

const SEND = process.argv.includes('--send')
const repoRoot = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const mainPath = `${repoRoot}/apps/desktop/dist/main.cjs`

const results = []
let currentStep = 'boot'
let consoleNoise = []
const noise = () => { const n = consoleNoise; consoleNoise = []; return n }

const app = await _electron.launch({ args: [mainPath] })
let failed = false
try {
  const page = await app.firstWindow()
  page.on('console', msg => {
    const text = msg.text()
    if (text.startsWith('Download the React DevTools')) return
    if (text.includes('Electron Security Warning')) return
    if (msg.type() === 'error' || msg.type() === 'warning') consoleNoise.push(`${msg.type()}: ${text.slice(0, 300)}`)
  })
  page.on('pageerror', error => consoleNoise.push(`pageerror: ${String(error).slice(0, 300)}`))

  async function step(name, fn) {
    currentStep = name
    noise()
    const started = Date.now()
    try {
      await fn()
      const n = noise()
      results.push({ step: name, status: n.length === 0 ? 'PASS' : 'PASS(warn)', ms: Date.now() - started, noise: n })
      console.log(`PASS ${name} (${Date.now() - started}ms)${n.length === 0 ? '' : ` — ${String(n.length)} 条渲染侧告警`}`)
    } catch (error) {
      failed = true
      const n = noise()
      results.push({ step: name, status: 'FAIL', ms: Date.now() - started, error: String(error).slice(0, 400), noise: n })
      console.log(`FAIL ${name} (${Date.now() - started}ms): ${String(error).slice(0, 400).split('\n')[0]}`)
    }
  }
  const T = { timeout: 10_000 }

  await page.waitForURL(url => url.href.startsWith('dsh-app://app/'), { timeout: 30_000 })
  const btn = name => page.getByRole('button', { name }).first()

  // 验收会话行(标题以验收测试开头, 含分叉副本 原题(N))。操作按钮只存在于
  // 非空白行(上游 Rows.tsx: 空白行 trailing cells 关闭), 由行 hover 显现 —
  // hover 锚点 = 行内标题 span(永远可见; 从按钮 xpath 反查兄弟), 不用容器
  // div(filter({has}).last() 会取到最外层, 鼠标落点不在行上)。CSS 定位避开
  // a11y 引擎对 hidden 元素的排除(disc-4 教训)。
  const testRowBtn = () => page.locator('button[aria-label*="会话“验收测试"]').first()
  async function openTestRowMenu() {
    const actionBtn = testRowBtn()
    // JS click 派发: 不经指针, 不触发 HoverCard(行悬停卡片会遮挡并使按钮
    // 不可点 — hover→卡片弹出→点击被拦的死锁来源), React onClick 正常触发。
    await actionBtn.evaluate(el => { el.click() })
    await page.waitForTimeout(300)
    return actionBtn
  }
  // 点击「新建会话」并验证会话真打开了 — startSession 在列表 phase 未就绪时
  // 走静默 clearMain()(点击无效果), 且空态同样有 composer/发送消息(空转通过
  // 风险)。打开标志按视图分: 空白会话无「轨迹」标签, 判别用「标准模式」
  // (空态没有); 「选择工作区」不可用作标志 — 空白会话态也出现它。重试 3 次。
  async function openFreshSession() {
    for (let i = 0; i < 3; i++) {
      await btn('新建会话').click()
      await page.waitForTimeout(600)
      const opened = await page.evaluate(() => {
        const has = n => [...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith(n))
        return has('标准模式') && document.querySelector('[contenteditable="true"]') !== null
      })
      if (opened) return true
    }
    return false
  }
  async function archiveTestSessions(limit = 10) {
    let archived = 0
    for (let i = 0; i < limit; i++) {
      if ((await testRowBtn().count()) === 0) break
      await openTestRowMenu()
      await page.getByText('归档会话').first().waitFor({ timeout: 5_000 })
      await page.getByText('归档会话').first().click()
      await page.waitForTimeout(1_500)
      archived += 1
    }
    return archived
  }

  await step('boot: UI 挂载', async () => {
    await btn('新建会话').waitFor({ state: 'visible', timeout: 60_000 })
    await page.waitForTimeout(1_500) // 会话列表水合
  })

  // 配置化路径覆盖(ui-plugin-foundation 任务 2): 产品级 plugin-bundles 配置
  // 是插件树唯一事实源 — 壳侧启动期差集调和应使 userData 投影 manifest 的
  // bundle 清单与配置逐项(含顺序)一致。
  await step('插件树对账: profile manifest ≡ 产品配置', async () => {
    const configPath = process.env.DSH_FORGE_PLUGIN_BUNDLES
      ?? `${repoRoot}/apps/desktop/resources/plugin-bundles.json`
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    const desired = config.bundles.map(entry => entry.name)
    const userData = await app.evaluate(({ app }) => app.getPath('userData'))
    const profileDir = process.env.DSH_FORGE_PROFILE_DIR ?? `${userData}/host-profile`
    const manifest = JSON.parse(readFileSync(`${profileDir}/package.json`, 'utf8'))
    const actual = manifest.dsh?.profile?.bundles ?? []
    if (JSON.stringify(actual) !== JSON.stringify(desired)) {
      throw new Error(`profile bundles ${JSON.stringify(actual)} != config ${JSON.stringify(desired)}`)
    }
  })

  await step('清理: 归档旧验收会话', async () => {
    const n = await archiveTestSessions()
    console.log(`  (归档 ${String(n)} 个旧验收会话)`)
  })

  await step('新会话: 创建并打开会话', async () => {
    if (!(await openFreshSession())) throw new Error('新建会话点击后未打开会话(静默 clearMain 路径?)')
    await btn('发送消息').waitFor({ state: 'visible', ...T })
    await btn('标准模式').waitFor({ state: 'visible', ...T })
  })

  // 预设选择器只出现在新会话 composer 上(历史会话无此按钮), 紧随新会话验证。
  await step('会话内: 模式选择器(标准模式菜单)', async () => {
    await btn('标准模式').click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
  })

  await step('侧栏: 折叠/展开', async () => {
    await btn('收起侧边栏').click()
    await btn('打开侧边栏').waitFor({ state: 'visible', ...T })
    await btn('打开侧边栏').click()
    await btn('收起侧边栏').waitFor({ state: 'visible', ...T })
  })

  await step('面板: 插件', async () => {
    await btn('插件').click()
    await page.getByText('插件', { exact: false }).last().waitFor({ ...T })
    await page.keyboard.press('Escape')
  })

  await step('面板: 设置 + 外观深色/浅色切换', async () => {
    await btn('设置').click()
    await page.getByText('外观').first().waitFor({ ...T })
    const before = await page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme'))
    await page.getByText('深色', { exact: true }).first().click()
    await page.waitForFunction(d => document.body.hasAttribute('data-ds-dark-theme') === !d, before, T)
    await page.getByText('浅色', { exact: true }).first().click()
    await page.waitForFunction(d => document.body.hasAttribute('data-ds-dark-theme') === d, before, T)
    await page.keyboard.press('Escape')
  })

  // 「选择工作区」是空态(无会话)专属控件; 已有会话自动恢复时不存在, 跳过。
  await step('工作区选择器: 菜单列出工作区(空态专属)', async () => {
    const wsBtn = page.getByRole('button', { name: '选择工作区' })
    if (await wsBtn.count() === 0) {
      console.log('  (SKIP: 已有会话自动恢复, 空态控件不存在)')
      return
    }
    await wsBtn.first().click()
    await page.getByText('dsh_workspace').first().waitFor({ ...T })
    await page.keyboard.press('Escape')
  })

  await step('搜索: 会话过滤', async () => {
    await btn('搜索会话').click()
    await page.keyboard.type('分析', { delay: 20 })
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
  })

  // 分组默认折叠旧会话(「展开其余 N 个会话」), 展开后才能点到历史行; 历史
  // 转录会话的 composer 次级控件(访问模式/模型/右侧栏)才 a11y 可见。
  let historyOpened = false
  await step('会话列表: 打开历史会话', async () => {
    const expand = page.getByText(/展开其余/)
    if (await expand.first().isVisible().catch(() => false)) await expand.first().click()
    await page.waitForTimeout(500)
    const row = page.getByText('分析：', { exact: false }).first()
    if ((await row.count()) === 0) {
      console.log('  (SKIP: 历史会话行不在 DOM(已归档/无历史))')
      return
    }
    await row.click()
    await page.waitForTimeout(1_500) // 转录加载
    const opened = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(b => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith('轨迹')))
    if (!opened) throw new Error('点击历史会话行后未打开会话')
    historyOpened = true
  })

  await step('会话内: 访问模式菜单', async () => {
    if (!historyOpened) { console.log('  (SKIP: 未打开历史会话)'); return }
    await btn('访问模式，当前：工作区内修改').click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
  })

  await step('会话内: 模型选择菜单', async () => {
    if (!historyOpened) { console.log('  (SKIP: 未打开历史会话)'); return }
    await btn('选择模型，当前 GLM-5.2，推理等级 Default').click()
    await page.waitForTimeout(500)
    await page.keyboard.press('Escape')
  })

  // 侧栏开闭状态跨会话持久: 先确保关闭(残留的打开态会让「打开右侧边栏」
  // 按钮不存在 — 上轮终端步骤失败未收起时的自我延续失败环)。
  await step('右侧边栏: 打开/收起', async () => {
    const open = btn('打开右侧边栏')
    const close = btn('收起右侧边栏')
    if (await close.isVisible().catch(() => false)) await close.click()
    await open.waitFor({ state: 'visible', ...T })
    await open.click()
    await close.waitFor({ state: 'visible', ...T })
    await close.click()
    await open.waitFor({ state: 'visible', ...T })
  })

  // composer 是 contenteditable DIV(无 placeholder 属性), 键入走 keyboard。
  const composer = page.locator('[contenteditable="true"]').first()
  await step('输入框: 键入', async () => {
    await composer.click()
    await page.keyboard.type('验收测试输入', { delay: 20 })
    await page.waitForFunction(() => document.querySelector('[contenteditable="true"]')?.textContent?.includes('验收测试输入') === true, undefined, T)
  })

  // 终端 spawn(右侧栏 → node-pty 子进程链路)。xterm 回显为软校验; ConPTY
  // 冷启动偶发超 10s, 等待放宽到 20s。
  await step('右侧栏: 终端 spawn(子进程链路)', async () => {
    // 面板激活态全局持久: 终端面板可能已激活(xterm 已挂载, 瓦片不渲染)。
    // 三态自适应: 已挂载→直接用; 有瓦片→点击创建; 都没有→倾倒诊断并失败。
    if (!(await openFreshSession())) throw new Error('新建会话点击后未打开会话(静默 clearMain 路径?)')
    const open = btn('打开右侧边栏')
    const close = btn('收起右侧边栏')
    if (await close.isVisible().catch(() => false)) await close.click()
    await open.waitFor({ state: 'visible', ...T })
    await open.click()
    await page.waitForTimeout(800)
    const xterm = page.locator('[class*="xterm"]').first()
    // 瓦片主按钮是文本命名(无 aria-label), 按文本定位 + JS click(未激活态被
    // a11y 引擎排除)。
    const termTile = page.locator('button', { hasText: '新建终端' }).first()
    if (!(await xterm.isVisible().catch(() => false))) {
      try {
        await termTile.waitFor({ state: 'attached', ...T })
      } catch (error) {
        const d = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => ({ a: (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().slice(0, 40), v: b.offsetParent !== null })).filter(x => x.a !== '').slice(-18))
        console.log(`  (诊断按钮表: ${JSON.stringify(d)})`)
        throw error
      }
      await termTile.evaluate(el => { el.click() }) // CSS+JS click(瓦片被 a11y 排除)
      try {
        await xterm.waitFor({ timeout: 20_000 })
      } catch (error) {
        const tail = await page.evaluate(() => document.body.innerText.replaceAll('\n', ' | ').slice(-400))
        console.log(`  (xterm 未挂载, 状态尾: ${tail})`)
        throw error
      }
    }
    await page.waitForTimeout(1_500)
    await xterm.click().catch(() => {}) // 聚焦
    await page.keyboard.type('echo forge-term-ok', { delay: 15 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1_500)
    const echoed = await page.evaluate(() => document.body.innerText.includes('forge-term-ok'))
    if (!echoed) console.log('  (note: xterm 文本不可见于 innerText, 仅验证面板挂载)')
    await btn('收起右侧边栏').click().catch(() => {})
  })

  if (SEND) {
    await step('发送: 真实回合(已配置模型)', async () => {
      // 在全新会话中发送, 且发送前断言回合统计不存在 — 防止匹配到
      // 历史会话转录里旧的「用时」统计造成假阳性。
      if (!(await openFreshSession())) throw new Error('新建会话点击后未打开会话(静默 clearMain 路径?)')
      await btn('发送消息').waitFor({ state: 'visible', ...T })
      await page.waitForFunction(() => !/用时\s*\d+\s*秒/.test(document.body.innerText), undefined, T)
      await composer.click()
      await page.keyboard.type('验收测试:请只回复两个字:收到', { delay: 10 })
      await btn('发送消息').click()
      await page.waitForFunction(() => /用时\s*\d+\s*秒/.test(document.body.innerText), undefined, { timeout: 120_000 })
    }, T)
  }

  // 重命名走 persistence resume 路径(曾因上游构建产物 lib/worker.cjs 缺失
  // 而 resume failed — fix-3 回归守卫)。只动本 sweep 自己的验收会话。
  await step('会话: 重命名(persistence resume 回归)', async () => {
    if ((await testRowBtn().count()) === 0) {
      console.log('  (SKIP: 无验收会话, 需 --send 先创建)')
      return
    }
    await openTestRowMenu()
    await page.getByText('重命名', { exact: false }).first().waitFor({ ...T })
    await page.getByText('重命名', { exact: false }).first().click()
    const input = page.locator('input').last()
    await input.waitFor({ ...T })
    await input.fill('验收测试-已重命名')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3_000)
    if (!(await page.getByText('验收测试-已重命名', { exact: false }).first().isVisible().catch(() => false))) {
      for (const label of ['保存', '确定', '确认']) {
        const b = page.getByRole('button', { name: label }).first()
        if (await b.isVisible().catch(() => false)) { await b.click(); break }
      }
      await page.waitForTimeout(3_000)
      await page.getByText('验收测试-已重命名', { exact: false }).first().waitFor({ ...T })
    }
  })

  // 分叉(持久化写路径): 会话行菜单 → 分叉会话 → 新会话打开(标题 原题(N))。
  await step('会话: 分叉(persistence 写路径)', async () => {
    if ((await testRowBtn().count()) === 0) { console.log('  (SKIP: 无验收会话)'); return }
    await openTestRowMenu()
    await page.getByText('分叉会话').first().waitFor({ ...T })
    await page.getByText('分叉会话').first().click()
    await btn('发送消息').waitFor({ state: 'visible', ...T })
    await page.waitForTimeout(2_000)
  })

  // 归档(持久化归档路径) + 收尾: 清掉全部验收会话(含分叉副本), 保持工作区整洁。
  await step('会话: 归档(persistence 归档路径) + 收尾清理', async () => {
    if ((await testRowBtn().count()) === 0) { console.log('  (SKIP: 无验收会话)'); return }
    await openTestRowMenu()
    await page.getByText('归档会话').first().waitFor({ ...T })
    await page.getByText('归档会话').first().click()
    await page.waitForTimeout(1_500)
    const n = await archiveTestSessions()
    console.log(`  (收尾归档 ${String(n)} 个)`)
  })
} catch (error) {
  failed = true
  console.log(`FATAL ${currentStep}: ${String(error).slice(0, 400)}`)
} finally {
  await app.close().catch(() => {})
}

console.log(`\n=== sweep ${failed ? 'FAILED' : 'GREEN'}: ${results.filter(r => r.status.startsWith('PASS')).length}/${results.length} PASS ===`)
for (const r of results.filter(r => r.status === 'FAIL')) console.log(`  FAIL ${r.step}: ${r.error?.split('\n')[0]}`)
process.exit(failed ? 1 : 0)
