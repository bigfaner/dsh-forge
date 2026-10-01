#!/usr/bin/env node
// 负样例自证（G0 组成部分）—— AC2/AC3/AC4 的机械自证：
//   种植违规样例文件（`_lintneg_*` 前缀，落在真实目录树上以命中 override 文件域）
//   → 分别断言被 oxlint（三条依赖铁律）/ lint-imports（SC2 watch + RPC 边界）/
//     lint-tokens（令牌零裸值）拦截（含预期 message）
//   → 清理（finally；下次运行前还会先清扫残留）。
// 对应任务 AC「违规样例文件被 lint 拦截（负样例自证后删除）」的自动化常驻版。
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ox：期望 oxlint 拦截的 message 片段；imp：期望 lint-imports 拦截的 message 片段
const FIXTURES = [
  {
    path: 'apps/web/src/components/_lintneg_base_to_views.ts',
    code: `import { p } from '../views/session/panel'\nexport const v = p\n`,
    ox: ['基础↛业务'],
  },
  {
    path: 'packages/core/src/db/_lintneg_db_to_domains.ts',
    code: `import { f } from '../forge/service.js'\nimport { k } from '../knowledge/index.js'\nexport const v = [f, k]\n`,
    ox: ['基础↛业务'],
  },
  {
    path: 'packages/core/src/forge/_lintneg_peer_and_watch.ts',
    code: `import { k } from '../knowledge/index.js'\nimport { watch } from 'node:fs'\nexport const v = [k, watch]\n`,
    ox: ['同级业务互禁'],
    imp: ['SC2 无投影'],
  },
  {
    path: 'packages/core/src/knowledge/_lintneg_knowledge_to_forge.ts',
    code: `import { f } from '../forge/index.js'\nexport const v = f\n`,
    ox: ['同级业务互禁'],
  },
  {
    path: 'apps/web/src/views/session/_lintneg_session_to_knowledge.tsx',
    code: `import { K } from '../knowledge/card'\nexport const v = K\n`,
    ox: ['同级业务互禁'],
  },
  {
    path: 'apps/web/src/views/knowledge/_lintneg_knowledge_to_session.tsx',
    code: `import { S } from '../session/panel'\nexport const v = S\n`,
    ox: ['同级业务互禁'],
  },
  {
    path: 'apps/web/src/zones/_lintneg_base_watch_rpc.ts',
    code: `import { p } from '../views/session/panel'\nimport chokidar from 'chokidar'\nimport { coreSvc } from '@dsh-forge/core'\nexport const v = [p, chokidar, coreSvc]\n`,
    ox: ['基础↛业务'],
    imp: ['SC2 无投影', '运行期边界'],
  },
  {
    path: 'apps/web/src/rpc/_lintneg_rpc_import.ts',
    code: `import { knowledgeSvc } from '@dsh-forge/knowledge'\nexport const v = knowledgeSvc\n`,
    imp: ['运行期边界'],
  },
  {
    path: 'apps/web/src/styles/_lintneg_tokens.css',
    code: `.x { color: #ff0000; font-size: 12px; padding: 4px 8px; }\n`,
    token: true,
  },
  {
    path: 'apps/web/src/components/_lintneg_tokens.tsx',
    code: `export const s = { fontSize: '12px', color: '#00ff00' } as const\n`,
    token: true,
  },
  {
    // 正样例：行尾 dsw-raw 豁免（块注释剥离不吞判据——2.7 修复的行为 pin）
    path: 'apps/web/src/styles/_lintpos_raw_exempt.css',
    code: `.x { padding: 6px; /* dsw-raw 自测豁免：官方行语言刻度 */ gap: 4px; }\n`,
    tokenExempt: true,
  },
]

function sweep() {
  // 清扫可能的历史残留（前缀约定；.gitignore 亦兜底——含正样例 _lintpos_ 前缀）
  for (const base of ['apps', 'packages']) {
    const stack = [join(ROOT, base)]
    while (stack.length > 0) {
      const dir = stack.pop()
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) stack.push(p)
        else if (name.startsWith('_lintneg_') || name.startsWith('_lintpos_')) rmSync(p, { force: true })
      }
    }
  }
}

function runNode(script, args = []) {
  return spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
}

function runOxlint(paths) {
  // 经 oxlint 包 JS bin 直启（免 shell 拼接，Windows 下亦稳）
  const oxlintBin = join(ROOT, 'node_modules/oxlint/bin/oxlint')
  return spawnSync(process.execPath, [oxlintBin, '-c', 'oxlint.config.ts', ...paths], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
}

let verified = 0
let failed = false

try {
  sweep()
  for (const f of FIXTURES) {
    const abs = join(ROOT, f.path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.code, 'utf8')
  }

  // —— oxlint 三铁律面：逐样例断言拦截与 message ——
  for (const f of FIXTURES) {
    if (!f.ox) continue
    const res = runOxlint([f.path])
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
    for (const msg of f.ox) {
      if (res.status === 0 || !out.includes(msg)) {
        failed = true
        console.error(`[selftest] FAIL ${f.path} 未被 oxlint 拦截（期望「${msg}」，exit=${res.status}）`)
        console.error(out.split('\n').slice(0, 12).join('\n'))
      } else {
        verified++
        console.log(`[selftest] ok ${f.path} → oxlint 拦截「${msg}」`)
      }
    }
  }

  // —— import 边界面（SC2 watch + RPC）：单次扫描，逐样例断言 ——
  const impFixtures = FIXTURES.filter((f) => f.imp)
  if (impFixtures.length > 0) {
    const res = runNode('scripts/lint-imports.mjs')
    const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
    for (const f of impFixtures) {
      const rel2 = relative(ROOT, join(ROOT, f.path)).split('\\').join('/')
      for (const msg of f.imp) {
        const lineHit = out
          .split('\n')
          .filter((l) => l.includes(rel2) && l.includes(msg))
        if (res.status === 0 || lineHit.length === 0) {
          failed = true
          console.error(`[selftest] FAIL ${f.path} 未被 import-lint 拦截（期望「${msg}」，exit=${res.status}）`)
        } else {
          verified++
          console.log(`[selftest] ok ${f.path} → import-lint 拦截「${msg}」`)
        }
      }
    }
  }

  // —— 令牌 lint 面：负样例断言拦截 + 豁免正样例断言放行 ——
  const tokenFixtures = FIXTURES.filter((f) => f.token)
  const tok = runNode('scripts/lint-tokens.mjs')
  const tokOut = `${tok.stdout ?? ''}${tok.stderr ?? ''}`
  for (const fx of tokenFixtures) {
    const rel2 = relative(ROOT, join(ROOT, fx.path)).split('\\').join('/')
    if (tok.status === 0 || !tokOut.includes(rel2)) {
      failed = true
      console.error(`[selftest] FAIL ${rel2} 未被令牌 lint 拦截（exit=${tok.status}）`)
    } else {
      verified++
      console.log(`[selftest] ok ${rel2} → 令牌 lint 拦截`)
    }
  }
  for (const fx of FIXTURES.filter((f) => f.tokenExempt)) {
    const rel2 = relative(ROOT, join(ROOT, fx.path)).split('\\').join('/')
    if (tokOut.includes(rel2)) {
      failed = true
      console.error(`[selftest] FAIL ${rel2} 行尾 dsw-raw 豁免未生效（被令牌 lint 误拦）`)
    } else {
      verified++
      console.log(`[selftest] ok ${rel2} → dsw-raw 豁免放行`)
    }
  }
} finally {
  sweep()
}

if (failed) {
  console.error('[selftest] 负样例自证失败——G0 规则面存在漏洞')
  process.exit(1)
}
console.log(`[selftest] 负样例自证通过：${verified} 条规则拦截全部命中，样例已清理`)
