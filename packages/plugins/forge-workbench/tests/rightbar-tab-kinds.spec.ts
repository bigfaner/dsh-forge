import { describe, expect, it } from 'vitest'
import { en } from '../src/client/locale/en.ts'
import { zh } from '../src/client/locale/zh.ts'
import type { WorkbenchKey } from '../src/client/locale/en.ts'
import {
  forgeTabDefinitions, forgeTabId, FORGE_TAB_ID_PREFIX, isTabKind,
  PROJECT_SCOPED_TAB_KINDS, RIGHTBAR_TAB_KINDS,
} from '../src/client/views/rightbar/tab-kinds.ts'

// M4 task 2.2 — AC1: the five forge tab kinds (guide/overview/board/doc/
// depgraph) as registry definitions — the Interface 4 TabKind whitelist,
// the guide take-over band, and the §4.8 project-scoped set.

const t = (key: WorkbenchKey): string => en[key]
const definitions = forgeTabDefinitions(t)

describe('AC1: the five forge tab kinds (Interface 4 TabKind whitelist)', () => {
  it('declares exactly the five kinds with unique prefixed implementation ids', () => {
    expect(RIGHTBAR_TAB_KINDS).toEqual(['guide', 'overview', 'board', 'doc', 'depgraph'])
    const ids = RIGHTBAR_TAB_KINDS.map(kind => definitions[kind].id)
    expect(new Set(ids).size).toBe(5)
    for (const id of ids) expect(id.startsWith(FORGE_TAB_ID_PREFIX)).toBe(true)
    expect(forgeTabId('guide')).toBe(`${FORGE_TAB_ID_PREFIX}guide`)
  })

  it('isTabKind admits exactly the whitelist', () => {
    for (const kind of RIGHTBAR_TAB_KINDS) expect(isTabKind(kind)).toBe(true)
    expect(isTabKind('terminal')).toBe(false)
    expect(isTabKind('browser')).toBe(false)
    expect(isTabKind('')).toBe(false)
  })

  it('guide is the EXTENSION TAKE-OVER of the shipped door page (kind stays "guide")', () => {
    // The kind string is the native machinery's invariant key (defaultSeed /
    // the strip's ＋ / the sole-docked-guide close protection); the extension
    // band is what puts the forge definition in force over the builtin.
    expect(definitions.guide.kind).toBe('guide')
    expect(definitions.guide.priority).toBe('extension')
    expect(definitions.guide.multiple).toBeUndefined()
    expect(definitions.guide.title('sidebar://guide')).toBe(en['rightbar.tab.guide'])
  })

  it('guide/overview titles stay locale-live (re-read per call, both halves)', () => {
    // The thunk re-reads through the bound seat, so a zh-bound build answers
    // zh copy with no re-registration (the upstream registry contract).
    const zhT = (key: WorkbenchKey): string => zh[key as keyof typeof zh]
    const zhDefinitions = forgeTabDefinitions(zhT)
    expect(definitions.overview.title('sidebar://overview')).toBe(en['rightbar.tab.overview'])
    expect(zhDefinitions.overview.title('sidebar://overview')).toBe(zh['rightbar.tab.overview'])
    expect(zhDefinitions.guide.title('sidebar://guide')).toBe(zh['rightbar.tab.guide'])
    expect(definitions.board.title('sidebar://board')).toBe(en['rightbar.tab.board'])
    expect(definitions.depgraph.title('sidebar://depgraph')).toBe(en['rightbar.tab.depgraph'])
  })

  it('overview contributes the guide ENTRY at order 10 (项目概览, before terminal 20 / browser 30)', () => {
    const [entry] = definitions.overview.guide ?? []
    expect(entry).toBeDefined()
    expect(entry.id).toBe('overview')
    expect(entry.order).toBe(10)
    expect(entry.title()).toBe(en['rightbar.guide.overview.title'])
    expect(entry.description?.()).toBe(en['rightbar.guide.overview.description'])
  })

  it('doc is multiple (文档可多开) and depgraph is one-per-pane (§4.8)', () => {
    expect(definitions.doc.multiple).toBe(true)
    expect(definitions.depgraph.multiple).toBeUndefined()
    expect(definitions.board.multiple).toBeUndefined()
  })
})

describe('AC4: the §4.8 project-scoped kinds (联动 closes exactly these)', () => {
  it('scopes doc/depgraph — overview/board follow the pointer, guide is project-agnostic', () => {
    expect(PROJECT_SCOPED_TAB_KINDS).toEqual(['doc', 'depgraph'])
  })
})
