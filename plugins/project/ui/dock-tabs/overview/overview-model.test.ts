// 1.45 随 dock tab 族注册面自 apps/web 平移本包（装配缝归插件域，AGENTS §1.3）。
// overview-model 单测 —— AC3（子 tab 切换清空三态）+ AC5（chips 过滤接口）+ AC1（默认折叠）
// + 排序/搜索参归一（Hard Rule 服务端承载的模型侧锚：关键词只转查询参，不做本地过滤）。
import { describe, expect, it } from 'vitest'
import { BUG_STATUSES, TASK_STATUSES, type BugStatus, type TaskStatus } from '@dsh-forge/lib-api/labels'
import { type BugCard } from '@dsh-forge/lib-api/dto/bugs'
import {
  OVERVIEW_SORT_LABELS,
  bugStatusCounts,
  bugStatusFilterParam,
  clearBugStatusFilter,
  OVERVIEW_SUBTABS,
  clearStatusFilter,
  hasActiveStatusFilter,
  initialOverviewFilter,
  isChipDisabled,
  joinSpecFileRel,
  nextSort,
  SPEC_FILE_FORMAT_LABELS,
  absSpecDirOf,
  searchPlaceholderOf,
  searchQueryOf,
  specDocDirOf,
  specFileFormatOf,
  specForgeDocRelOf,
  statusFilterParam,
  switchSubtab,
  toggleHead,
  toggleBugStatusFilter,
  toggleOpenRow,
  toggleStatusFilter,
  activeFeatureSlug,
} from './overview-model.js'

const ALL_STATUS = new Set<TaskStatus>(TASK_STATUSES)

describe('OVERVIEW_SUBTABS（spec | 任务 | Bug 有序三枚——对齐 apps/web）', () => {
  it('恰为 spec | 任务 | Bug 有序三枚；feature/提案子 tab 退役零在场', () => {
    expect(OVERVIEW_SUBTABS.map((t) => t.value)).toEqual(['spec', 'tasks', 'bugs'])
    expect(OVERVIEW_SUBTABS.map((t) => t.label)).toEqual(['Spec', '任务', 'Bug'])
  })
})

describe('spec 文档区目录列举纯投影（1.2——格式分流 + rel 拼装）', () => {
  it('specFileFormatOf：扩展名归类（md/html/图片/PDF/文本白名单/其余 = other）', () => {
    expect(specFileFormatOf('spec.md')).toBe('markdown')
    expect(specFileFormatOf('prototype.HTML')).toBe('html')
    expect(specFileFormatOf('page.htm')).toBe('html')
    expect(specFileFormatOf('notes.txt')).toBe('text')
    expect(specFileFormatOf('data.json')).toBe('text')
    expect(specFileFormatOf('theme.css')).toBe('text')
    expect(specFileFormatOf('cfg.yaml')).toBe('text')
    expect(specFileFormatOf('logo.PNG')).toBe('image')
    expect(specFileFormatOf('arch.svg')).toBe('image')
    expect(specFileFormatOf('print.pdf')).toBe('pdf')
    expect(specFileFormatOf('logo.bin')).toBe('other')
    expect(specFileFormatOf('archive.tar.gz')).toBe('other')
    expect(specFileFormatOf('Makefile')).toBe('other')
  })

  it('SPEC_FILE_FORMAT_LABELS：六键封闭 + 中文词汇', () => {
    expect(Object.keys(SPEC_FILE_FORMAT_LABELS)).toEqual(['markdown', 'html', 'text', 'image', 'pdf', 'other'])
    expect(SPEC_FILE_FORMAT_LABELS.text).toBe('文本')
    expect(SPEC_FILE_FORMAT_LABELS.image).toBe('图片')
    expect(SPEC_FILE_FORMAT_LABELS.other).toBe('文件')
  })

  it('specDocDirOf / joinSpecFileRel / absSpecDirOf：rel 与绝对入参拼装（posix 归一）', () => {
    expect(specDocDirOf('.forge/specs/spec-a/spec.md')).toBe('.forge/specs/spec-a')
    expect(specDocDirOf('spec.md')).toBe('')
    expect(specDocDirOf('.forge\\specs\\spec-a\\spec.md')).toBe('.forge/specs/spec-a')
    expect(joinSpecFileRel('.forge/specs/spec-a', 'proto.html')).toBe('.forge/specs/spec-a/proto.html')
    expect(joinSpecFileRel('', 'x.txt')).toBe('x.txt')
    expect(absSpecDirOf('Z:\\ws\\demo', '.forge/specs/spec-a')).toBe('Z:/ws/demo/.forge/specs/spec-a')
    expect(absSpecDirOf('Z:/ws/', '')).toBe('Z:/ws')
  })

  it('bug 8196003a：specForgeDocRelOf 剥 `.forge/` 前缀（项目根基准 → forgeDir 基准），其余原样', () => {
    expect(specForgeDocRelOf('.forge/specs/spec-a/spec.md')).toBe('specs/spec-a/spec.md')
    expect(specForgeDocRelOf('.forge\\specs\\spec-a\\spec.md')).toBe('specs/spec-a/spec.md')
    expect(specForgeDocRelOf('docs/custom/spec.md')).toBe('docs/custom/spec.md')
    expect(specForgeDocRelOf('spec.md')).toBe('spec.md')
    // 段前缀敏感：`.forge-x/` 非同段，不改写
    expect(specForgeDocRelOf('.forge-x/spec.md')).toBe('.forge-x/spec.md')
  })
})

describe('initialOverviewFilter（AC1 默认态）', () => {
  it('默认子 tab = 任务；排序 = 活跃优先；搜索空；chips/展开态空；ov-head 折叠', () => {
    const state = initialOverviewFilter()
    expect(state.subtab).toBe('tasks')
    expect(state.sort).toBe('active')
    expect(state.search).toBe('')
    expect(state.activeStatuses.size).toBe(0)
    expect(state.openRows.size).toBe(0)
    expect(state.headOpen).toBe(false)
  })
})

describe('switchSubtab（AC3 切换清空）', () => {
  it('切换 = 清空搜索 + 清空 chips + 收起全部展开态', () => {
    let state = initialOverviewFilter()
    state = { ...state, search: '网关', openRows: new Set(['row:f-1']) }
    state = toggleStatusFilter(state, 'blocked')
    const next = switchSubtab(state, 'bugs') // 门关期默认子 tab = tasks——切换靶改 bugs 验证清空语义
    expect(next.subtab).toBe('bugs')
    expect(next.search).toBe('')
    expect(next.activeStatuses.size).toBe(0)
    expect(next.openRows.size).toBe(0)
  })

  it('ov-head 展开态跨子 tab 保持（路径详情与内容区正交）；同值切换原样返回（引用相等）', () => {
    let state = initialOverviewFilter()
    state = toggleHead(state)
    const next = switchSubtab(state, 'spec')
    expect(next.headOpen).toBe(true)
    expect(switchSubtab(next, 'spec')).toBe(next)
  })
})

describe('排序（AC2 ⇅ 活跃优先 ↔ 最新创建）', () => {
  it('nextSort 双向翻转；标签常量中英口径', () => {
    expect(nextSort('active')).toBe('created')
    expect(nextSort('created')).toBe('active')
    expect(OVERVIEW_SORT_LABELS.active).toBe('活跃优先')
    expect(OVERVIEW_SORT_LABELS.created).toBe('最新创建')
  })
})

describe('searchQueryOf / searchPlaceholderOf（Hard Rule 服务端承载——参归一）', () => {
  it('非空 trim 透传；空白/空串 = undefined（不带 search 参）', () => {
    expect(searchQueryOf(' 网关 ')).toBe('网关')
    expect(searchQueryOf('gateway')).toBe('gateway')
    expect(searchQueryOf('   ')).toBeUndefined()
    expect(searchQueryOf('')).toBeUndefined()
  })

  it('占位文案逐子 tab（spec · 标题/类型/状态中英 · Bug 摘要/错误类型）', () => {
    expect(searchPlaceholderOf('spec')).toContain('spec')
    expect(searchPlaceholderOf('tasks')).toContain('中英')
    expect(searchPlaceholderOf('bugs')).toContain('Bug')
  })
})

describe('chips 过滤接口（AC5——三视图统一，3.6 消费）', () => {
  it('toggleStatusFilter 翻转集合（不影响他态）；clearStatusFilter 全清', () => {
    let state = initialOverviewFilter()
    state = toggleStatusFilter(state, 'blocked')
    state = toggleStatusFilter(state, 'in_progress')
    expect([...state.activeStatuses].sort()).toEqual(['blocked', 'in_progress'])
    state = toggleStatusFilter(state, 'blocked')
    expect([...state.activeStatuses]).toEqual(['in_progress'])
    const cleared = clearStatusFilter(state)
    expect(cleared.activeStatuses.size).toBe(0)
  })

  it('statusFilterParam = contracts 七态行序白名单；空集 = 空参（= 全部）', () => {
    const active = new Set<TaskStatus>(['rejected', 'blocked', 'pending'])
    expect(statusFilterParam(active)).toEqual(['pending', 'blocked', 'rejected'])
    expect(statusFilterParam(new Set())).toEqual([])
  })

  it('hasActiveStatusFilter / isChipDisabled：0 计数禁用判据', () => {
    expect(hasActiveStatusFilter(new Set())).toBe(false)
    expect(hasActiveStatusFilter(new Set<TaskStatus>(['pending']))).toBe(true)
    expect(isChipDisabled(0)).toBe(true)
    expect(isChipDisabled(3)).toBe(false)
  })

  it('八态词汇序 = contracts TASK_STATUSES（chips 渲染行序单源——S3 +interrupted）', () => {
    expect([...ALL_STATUS]).toEqual([
      'pending',
      'in_progress',
      'completed',
      'blocked',
      'suspended',
      'interrupted',
      'skipped',
      'rejected',
    ])
  })
})

describe('父行展开（AC4 多开并存）', () => {
  it('toggleOpenRow 集合翻转——多行并存互不影响', () => {
    let state = initialOverviewFilter()
    const fk = 'row:m2-pipeline'
    state = toggleOpenRow(state, fk)
    expect(state.openRows.has(fk)).toBe(true)
    state = toggleOpenRow(state, fk)
    expect(state.openRows.has(fk)).toBe(false)
  })
})

describe('activeFeatureSlug（task-tab feature pill 单源——头摘要已随 T1-head 裁决退役）', () => {
  it('非终态（completed/archived 之外）优先，否则首行；空集 = undefined', () => {
    const card = (slug: string, featureStatus: 'prd' | 'completed' | 'archived') => ({
      featureId: `id-${slug}`,
      slug,
      title: slug,
      featureStatus,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      byStatus: {} as Record<TaskStatus, number>,
      docCount: 0,
    })
    expect(activeFeatureSlug([card('done', 'completed'), card('live', 'prd')])).toBe('live')
    expect(activeFeatureSlug([card('a', 'completed'), card('b', 'archived')])).toBe('a')
    expect(activeFeatureSlug([])).toBeUndefined()
  })
})

// ─────────────────────────── Bug 三态 chips 族（fix-bug 第 4 子 tab） ───────────────────────────

describe('Bug 三态 chips（fix-bug——toggle/清空/白名单参/计数）', () => {
  const bug = (bugId: string, bugStatus: BugStatus): BugCard => ({
    bugId,
    summary: `摘要 ${bugId}`,
    bugDesc: 'd',
    triggerDesc: 't',
    expected: 'e',
    actual: 'a',
    bugStatus,
    reporter: 'faner',
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T00:00:00.000Z',
  })

  it('toggleBugStatusFilter：集合翻转；clearBugStatusFilter 全清（他族不受累）', () => {
    let state = initialOverviewFilter()
    state = toggleBugStatusFilter(state, 'open')
    state = toggleBugStatusFilter(state, 'fixed')
    state = toggleStatusFilter(state, 'blocked')
    expect([...state.activeBugStatuses].sort()).toEqual(['fixed', 'open'])
    state = toggleBugStatusFilter(state, 'open')
    expect([...state.activeBugStatuses]).toEqual(['fixed'])
    const cleared = clearBugStatusFilter(state)
    expect(cleared.activeBugStatuses.size).toBe(0)
    expect(cleared.activeStatuses.size).toBe(1)
  })

  it('bugStatusFilterParam = contracts 三态行序白名单；空集 = 空参（= 全部）', () => {
    expect([...BUG_STATUSES]).toEqual(['open', 'fixed', 'unresolved'])
    const active = new Set<BugStatus>(['unresolved', 'open'])
    expect(bugStatusFilterParam(active)).toEqual(['open', 'unresolved'])
    expect(bugStatusFilterParam(new Set())).toEqual([])
  })

  it('bugStatusCounts：三态计数投影（缺态 = 0）', () => {
    expect(bugStatusCounts([bug('b1', 'open'), bug('b2', 'open'), bug('b3', 'fixed')])).toEqual({
      open: 2,
      fixed: 1,
      unresolved: 0,
    })
    expect(bugStatusCounts([])).toEqual({ open: 0, fixed: 0, unresolved: 0 })
  })

  it('子 tab 切换清空 Bug chips（切换语义沿袭——四族全清）', () => {
    let state = initialOverviewFilter()
    state = toggleBugStatusFilter(state, 'open')
    const next = switchSubtab(state, 'bugs') // 门关期默认子 tab = tasks——切换靶改 bugs
    expect(next.activeBugStatuses.size).toBe(0)
  })
})

// M3.1 D12：概览 tab 宽度模型（OVERVIEW_WIDTH_* / clampOverviewWidth /
// overviewWidthFromDrag）随定宽管线整体退役——内容弹性填满整 tab（用户裁决 #1）。
// 退役否定断言（零弱化台账）：模型面宽度符号零导出——本测试文件零引用即编译面守卫
// （tsconfig 类型检查 + oxlint no-unused-vars 双机械通道）；帧面否定断言见 OverviewTab.test。
