// 镜像同步 pin（knowledge-plugin-migration 1.4 承重后置门）：本批落位的镜像/自含副本
// 逐件 export 形状/内容 hash 对账（bridge-mirror.ts 配方——漂移由两侧 pin 对账，不靠人工
// 同步）。对账方向：project 侧正本 ←→ knowledge 侧镜像/副本；hash = 去注释去空行的
// sha256（头注允许叙述性分叉，代码体零漂移即绿；任一侧漂移未同步 = 红）。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1/')

function read(rel: string): string {
  return readFileSync(ROOT + rel, 'utf8')
}

/** 去注释（// 行）去空行归一文本（代码体零漂移对账基准） */
function codeOf(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')
      && !line.startsWith('*/') && !/^import\b/.test(line))
    .join('\n')
}

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** 逐字整文件副本 pin（头注差异豁免） */
function expectWholeFileCopy(relA: string, relB: string): void {
  const a = sha(codeOf(read(relA)))
  const b = sha(codeOf(read(relB)))
  if (a !== b) {
    throw new Error(`镜像漂移：${relA} 与 ${relB} 代码体 hash 不一致（${a.slice(0, 8)} ≠ ${b.slice(0, 8)}）——两侧同步修改后再行`)
  }
}

/** 导出符号块 pin：截取 `export ... <name>` 起至下一个顶层 `export` 前的代码体 hash */
function exportBlockOf(text: string, name: string): string {
  const lines = text.split(/\r?\n/)
  const decl = /^(export )?(async )?(function|const|interface|type|class) /
  const start = lines.findIndex((line) => decl.test(line.trim())
    && new RegExp(`^(export )?(async )?(function|const|interface|type|class) ${name}\\b`).test(line.trim()))
  if (start === -1) throw new Error(`export ${name} 未命中（对账面改名未同步 pin 清单）`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i]!.trim()
    if (/^(export )?(async )?(function|const|interface|type|class) [A-Za-z_$]/.test(t) || /^import\b/.test(t)) {
      end = i
      break
    }
  }
  return codeOf(lines.slice(start, end).join('\n'))
}

function expectSymbolPin(relA: string, relB: string, names: readonly string[]): void {
  const ta = read(relA)
  const tb = read(relB)
  for (const name of names) {
    const a = sha(exportBlockOf(ta, name))
    const b = sha(exportBlockOf(tb, name))
    if (a !== b) {
      throw new Error(`镜像漂移：${relA} ↔ ${relB} export ${name} 代码体 hash 不一致——两侧同步修改后再行`)
    }
  }
}

describe('镜像同步 pin（knowledge 侧副本 ↔ project 正本）', () => {
  it('components 自含副本逐字（project ui/components.tsx 正本）', () => {
    expectWholeFileCopy('plugins/project/ui/components.tsx', 'plugins/knowledge/ui/components.tsx')
  })

  it('components-mirror 双侧镜像逐字（正本随迁 knowledge ui，project 副本供 docs 渲染链）', () => {
    expectWholeFileCopy('plugins/project/ui/components-mirror.tsx', 'plugins/knowledge/ui/components-mirror.tsx')
  })

  it('keyed-section 自含副本逐字（project 10+ 注册面消费——圆桌三分法随迁/下沉均否决）', () => {
    expectWholeFileCopy('plugins/project/ui/keyed-section.ts', 'plugins/knowledge/ui/keyed-section.ts')
  })

  it('anchored-projects 镜像窄面：六导出符号块逐字（正本 = project ui/anchored-projects.tsx）', () => {
    expectSymbolPin(
      'plugins/project/ui/anchored-projects.tsx',
      'plugins/knowledge/ui/anchored-projects.tsx',
      ['isWorkspacesSnapshot', 'WorkspacesAnchor', 'readMainSessionId', 'MainSessionAnchor', 'AnchoredProjects', 'useAnchoredProjects'],
    )
  })


  it('KitSelectorHook 三方同型（knowledge shared 下沉件 ↔ project 正本本地声明）', () => {
    const shared = exportBlockOf(read('plugins/knowledge/shared/kit-types.ts'), 'KitSelectorHook')
    const project = exportBlockOf(read('plugins/project/ui/anchored-projects.tsx'), 'KitSelectorHook')
    expect(sha(shared)).toBe(sha(project))
  })
})
