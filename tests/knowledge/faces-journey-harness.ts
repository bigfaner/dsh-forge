// knowledge-faces-mount / knowledge-faces-unmount 旅程共通夹具（契约
// proposals/knowledge-plugin-migration/testing/contracts/shared-anchors-channels.md 的
// e2e 侧承载—— journeys: knowledge-faces-mount / knowledge-faces-unmount）。
//
// 装载形态：dsh-forge 集成态（G-A 壳缝）——launchHost dev profile（@dsh-forge/knowledge
// 在场）+ RPC 直注注册单项目（锚定无歧义前置）。
// 卸载形态（CT-U1「正式卸载通道」在集成装配的等价夹具）：集成态卸载 = 装载位移除 +
// 宿主按卸载语义重载——junction 农场镜像 profile.dev（唯一差异 = @dsh-forge/knowledge
// link 缺席 + loader 行/依赖行剔除），经 DSH_FORGE_PROFILE_DIR 显式覆盖启动（paths.ts
// 注记的 e2e/调试口）→ productPackagePresent 双探针一缺席 → knowledgePlugin 位 false
// → 壳掌舵让位 + faces gate fail-closed（apps/web boot.ts / faces.ts 消费链）。
// 官方形态（CT-KN-GATE，fix-3 修订：bundle 在场即挂载——apply 期无条件注册）在集成装配
// 不可复现（bootShell 恒发布壳缝）——faces-gate.test.ts 单测覆盖门控三形态，此处注记留痕。
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'
import { ROOT, closeApp, launchHost, type Launched } from '../../e2e/support/launch.js'
import { registerProject } from '../../e2e/support/rpc.js'
import { KNOWLEDGE_ENTRY, KNOWLEDGE_VIEW } from '../../e2e/support/anchors.js'

/** 知识面板根锚（A-KN-1——KnowledgePanel.tsx 根属性） */
export const KN_PANEL_ROOT = '[data-dswf-view="knowledge"]'
/** 召回页签行锚（A-KN-5 实锚 = 官方 TAB_ITEM 内「知识召回」行——登记 id dswf-recall） */
export const RECALL_TAB_ITEM = '[data-conversation-tabs] [role="tab"]'

/** 旅程夹具（wsDir 单项目 + 隔离 userData） */
export interface FacesFixture {
  readonly root: string
  readonly wsDir: string
  readonly userData: string
}

/** 夹具制备：{root}/demo-proj（.knowledge 目录在场——知识域工作区形态） */
export function makeFacesFixture(prefix = 'dsh-forge-e2e-kfaces-'): FacesFixture {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const wsDir = join(root, 'demo-proj')
  mkdirSync(join(wsDir, '.knowledge'), { recursive: true })
  const userData = mkdtempSync(join(tmpdir(), `${prefix}ud-`))
  return { root, wsDir, userData }
}

export interface FacesLaunch {
  readonly launched: Launched
  readonly projectId: string
  readonly fixture: FacesFixture
}

/** 单项目装载 boot（RPC 直注注册——向导走查归 project-registration 旅程） */
export async function bootWithProject(fixture: FacesFixture, opts: {
  readonly collectConsole?: boolean
  readonly env?: Record<string, string>
  readonly overlay?: string
} = {}): Promise<FacesLaunch> {
  const launched = await launchHost({ userData: fixture.userData, collectConsole: opts.collectConsole ?? true, env: opts.env, overlay: opts.overlay })
  const row = await registerProject(launched.page, fixture.wsDir, 'demo-proj')
  return { launched, projectId: row.id, fixture }
}

/** GP3：点知识入口行 + 面板锚定态断言（A-KN-1/2/3——单项目 = projectId，非 none） */
export async function openKnowledgePanel(page: Page, projectId: string): Promise<void> {
  await page.locator(KNOWLEDGE_ENTRY).first().click()
  await expect(page.locator(KN_PANEL_ROOT).first()).toBeVisible({ timeout: 30_000 })
  const knowledgeView = page.locator(KNOWLEDGE_VIEW).first()
  await expect(knowledgeView).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(async () => knowledgeView.getAttribute('data-dswf-kn-anchor'), { timeout: 30_000 })
    .toBe(projectId)
}

/** stripKnowledgeLoaderRow：cordis.patch.yml 摘 dsh-forge-knowledge insert 两行（loader 行缺席 = 服务零装载） */
function stripKnowledgeLoaderRow(patch: string): string {
  return patch
    .split('\n')
    .filter((line) => !/^\s*- id: dsh-forge-knowledge\s*$/.test(line))
    .filter((line) => !/^\s*name: ['"]@dsh-forge\/knowledge['"]\s*$/.test(line))
    .join('\n')
}

/**
 * 卸载态 profile 制备（junction 农场——profile.dev 全量透传、唯一差异 = knowledge 缺席）：
 * - 顶层文件复制（cordis.patch.yml 摘 loader 行；package.json 摘依赖行；其余逐字复制）；
 * - 顶层目录/ node_modules 逐条目 junction（knowledge 段跳过——productPackagePresent
 *   profileDir 探针缺席；rmdirSync 摘链接本体不追目标，真实 profile.dev 零触碰）；
 * - 例外：boot 链两件（@deepseek-ai/dsh-app-boot + @deepseek-ai/dsh，与
 *   apps/host/src/boot/boot-chain.ts TREE_CHAIN_PACKAGES 同源）物理复制——fix-20
 *   BootChainSplitError 守卫按 realpath containment 判树内解析，junction 指向
 *   profile.dev 真身即判逃逸 fatal；守卫语义不弱化，夹具改为在树内承载真身拷贝
 *   （与真实 profile.dev 形态同构——真身本就在 profile.dev 树内）。
 */
const BOOT_CHAIN_PACKAGES = ['@deepseek-ai/dsh-app-boot', '@deepseek-ai/dsh'] as const
export function makeUninstalledProfile(root: string): string {
  const src = join(ROOT, 'apps', 'host', 'profile.dev')
  const dst = join(root, 'profile-uninstalled')
  mkdirSync(join(dst, 'node_modules'), { recursive: true })
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, e.name)
    const to = join(dst, e.name)
    if (e.name === 'node_modules') continue
    if (e.isDirectory()) {
      symlinkSync(from, to, 'junction')
      continue
    }
    if (e.name === 'cordis.patch.yml') {
      writeFileSync(to, stripKnowledgeLoaderRow(readFileSync(from, 'utf8')), 'utf8')
    } else if (e.name === 'package.json') {
      const pkg = JSON.parse(readFileSync(from, 'utf8')) as { dependencies?: Record<string, string> }
      delete pkg.dependencies?.['@dsh-forge/knowledge']
      writeFileSync(to, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
    } else {
      copyFileSync(from, to)
    }
  }
  const nmSrc = join(src, 'node_modules')
  const nmDst = join(dst, 'node_modules')
  for (const e of readdirSync(nmSrc, { withFileTypes: true })) {
    if (e.name === '@dsh-forge') {
      mkdirSync(join(nmDst, '@dsh-forge'), { recursive: true })
      for (const g of readdirSync(join(nmSrc, '@dsh-forge'), { withFileTypes: true })) {
        if (g.name === 'knowledge') continue // 卸载位探针缺席（双探针之一——唯一差异点）
        symlinkSync(join(nmSrc, '@dsh-forge', g.name), join(nmDst, '@dsh-forge', g.name), 'junction')
      }
    } else if (e.name === '@deepseek-ai') {
      // boot 链两件物理复制（守卫树内判据），其余 deepseek 包照常 junction
      mkdirSync(join(nmDst, '@deepseek-ai'), { recursive: true })
      for (const g of readdirSync(join(nmSrc, '@deepseek-ai'), { withFileTypes: true })) {
        const from = join(nmSrc, '@deepseek-ai', g.name)
        const to = join(nmDst, '@deepseek-ai', g.name)
        if (BOOT_CHAIN_PACKAGES.some((name) => name === `@deepseek-ai/${g.name}`)) {
          cpSync(from, to, { recursive: true, verbatimSymlinks: false })
        } else {
          symlinkSync(from, to, 'junction')
        }
      }
    } else {
      symlinkSync(join(nmSrc, e.name), join(nmDst, e.name), 'junction')
    }
  }
  return dst
}

/** 卸载态 profile 清理：junction 先逐条 rmdirSync 摘链接（boot 链复制件走 rmSync；
 *  绝不 rmSync 递归翻越 junction） */
export function removeProfileFarm(dir: string): void {
  const nm = join(dir, 'node_modules')
  for (const e of readdirSync(nm, { withFileTypes: true })) {
    const p = join(nm, e.name)
    if (e.name === '@dsh-forge') {
      for (const g of readdirSync(p)) rmdirSync(join(p, g))
      rmdirSync(p)
    } else if (e.name === '@deepseek-ai') {
      for (const g of readdirSync(p)) {
        const gp = join(p, g)
        if (BOOT_CHAIN_PACKAGES.some((name) => name === `@deepseek-ai/${g}`)) {
          rmSync(gp, { recursive: true, force: true }) // 物理复制件（夹具自有）
        } else {
          rmdirSync(gp) // junction
        }
      }
      rmdirSync(p)
    } else {
      rmdirSync(p)
    }
  }
  rmSync(dir, { recursive: true, force: true })
}

/** 旅程清理（app 停机 + 夹具/userData/卸载态 profile 全清） */
export async function teardownFaces(fixture: FacesFixture | undefined, extraDirs: readonly string[] = []): Promise<void> {
  if (fixture !== undefined) {
    rmSync(fixture.userData, { recursive: true, force: true })
    rmSync(fixture.root, { recursive: true, force: true })
  }
  for (const dir of extraDirs) {
    if (dir.includes('profile-uninstalled')) removeProfileFarm(dir)
    else rmSync(dir, { recursive: true, force: true })
  }
}

/** diag error 级判读（renderer console 环形缓冲的 [error] 前缀 + pageerror 面——集成态
 *  可观测代理；boot/diag 宿主日志域归冒烟承载） */
export function errorConsoleEntries(launched: Launched): readonly string[] {
  return launched.consoleTail.filter((line) => line.startsWith('[error]'))
}

export { closeApp }
