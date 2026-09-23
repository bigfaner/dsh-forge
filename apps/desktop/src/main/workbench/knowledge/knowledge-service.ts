// workbench/knowledge/knowledge-service — 知识系 + feature 读动词服务(任务 2.2)。
//
// tech-design §Interface 2「dsh tool 面」D4 段的服务实现(fact/lesson/
// research 读+必要写、forensic 只读、feature list/status 只读)。装配律与
// task-service 同型:本模块 = 数据面模块(fact-table/lessons/research/
// forensic/feature-read)的业务调用方;项目定位 → 文档根/forge 根解析 →
// 动作分派;未注册项目 → ERR_PROJECT_NOT_FOUND(AC2 明确提示,断言口径
// 与 repos assertProjectExists 同码)。
//
// 路径授权(Hard Rule:写操作仅落文档根授权路径):
//   - lesson/research 写 → 文档根 =(docLocationPath ?? codeRoot)/docs
//     (M2 注册链授权面;indexer resolveFeaturesDir 同基);
//   - fact 写 → codeRoot/.forge(forge 数据模型权威位置,注册根即授权);
//   - 越界拒绝 = 段校验 + 解析后包含性复核(knowledge-error 双闸)。
//
// actor:知识系文件数据模型无作者槽位(fact-table.json 条目/lesson/research
// frontmatter 均无该字段;Hard Rule「不在应用侧新增语义」)→ actor 经桥
// 透传至服务面但不落盘(与 task 写集的 updated_by 审计分立)。
//
// forensic 与项目注册无关(机器全局只读源:~/.claude/history.jsonl 与
// 任意会话转录路径;归宿表「dsh tool 只读」)→ 无 projectId 入参、无
// 注册门;homeDir 经 deps 注入(缺省 os.homedir,测试可换)。

import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveFeaturesDir, type ScanTarget } from '../indexer/scan.ts'
import { toProject, type Project, type ProjectRow, type RepoDb } from '../repos/types.ts'
import type {
  FactEntry, FactSummaryStats,
} from './fact-table.ts'
import {
  addFactEntry, filterFacts, findFactById, loadFactTable, sortFactsById, summarizeFacts,
} from './fact-table.ts'
import type { ForensicEvidence, ForensicSessionSummary, ForensicSubagent } from './forensic.ts'
import { extractForensicEvidence, listForensicSubagents, searchForensicSessions } from './forensic.ts'
import type { FeatureListEntry, FeatureStatusReport } from './feature-read.ts'
import { listFeatures, readFeatureStatus } from './feature-read.ts'
import type { Lesson } from './lessons.ts'
import { discoverLessons, findLesson, writeLesson } from './lessons.ts'
import type { ResearchReport } from './research.ts'
import { discoverReports, findReport, writeReport } from './research.ts'
import type {
  KnowledgeFactInput, KnowledgeFactListResult, KnowledgeForensicInput, KnowledgeForensicResult,
  KnowledgeLessonInput, KnowledgeLessonListResult, KnowledgeResearchInput, KnowledgeResearchListResult,
} from '../ipc/types.ts'
import { KnowledgeDomainError } from './knowledge-error.ts'

/** 服务依赖缝(db + forensic home 注入面)。 */
export interface KnowledgeVerbDeps {
  readonly db: RepoDb
  /** forensic search 的 history.jsonl 基目录(缺省 os.homedir)。 */
  readonly homeDir?: string
}

/** 本模块装配产物:六个知识系/feature 读动词(并入 WorkbenchVerbServices)。 */
export interface KnowledgeVerbService {
  knowledgeFact(input: KnowledgeFactInput): KnowledgeFactListResult | FactEntry | FactSummaryStats
  knowledgeLesson(input: KnowledgeLessonInput): KnowledgeLessonListResult | Lesson
  knowledgeResearch(input: KnowledgeResearchInput): KnowledgeResearchListResult | ResearchReport
  knowledgeForensic(input: KnowledgeForensicInput): KnowledgeForensicResult
  featureList(projectId: string): FeatureListEntry[]
  featureStatus(input: { projectId: string; featureSlug: string }): FeatureStatusReport
}

function invalid(message: string): KnowledgeDomainError {
  return new KnowledgeDomainError('ERR_KNOWLEDGE_INPUT_INVALID', message)
}

/** 项目定位:未注册 → ERR_PROJECT_NOT_FOUND(AC2 读操作明确提示同码)。 */
function requireProject(db: RepoDb, projectId: string): Project {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as unknown
  if (row === undefined) {
    throw new KnowledgeDomainError(
      'ERR_PROJECT_NOT_FOUND',
      `project ${projectId} does not exist (register the project in the workbench first; knowledge tools only serve registered projects)`,
    )
  }
  return toProject(row as ProjectRow)
}

function docRootOf(project: Project): string {
  return join(project.docLocationPath ?? project.codeRoot, 'docs')
}

function scanTargetOf(project: Project): ScanTarget {
  return { id: project.id, codeRoot: project.codeRoot, docLocationPath: project.docLocationPath }
}

export function createKnowledgeVerbService(deps: KnowledgeVerbDeps): KnowledgeVerbService {
  const { db } = deps
  const historyPath = () => join(deps.homeDir ?? homedir(), '.claude', 'history.jsonl')

  return {
    knowledgeFact(input) {
      const project = requireProject(db, input.projectId)
      switch (input.action) {
        case 'list': {
          const filtered = sortFactsById(filterFacts(loadFactTable(project.codeRoot), input.source, input.confidence))
          return { total: filtered.length, facts: filtered }
        }
        case 'get': {
          if (input.factId === undefined || input.factId === '') throw invalid('factId is required for action=get')
          const entry = findFactById(loadFactTable(project.codeRoot), input.factId)
          if (entry === undefined) {
            throw new KnowledgeDomainError(
              'ERR_KNOWLEDGE_ENTRY_NOT_FOUND',
              `fact not found: ${input.factId}`,
              'No fact entry with this fact_id exists in the table; list facts first to see what exists',
            )
          }
          return entry
        }
        case 'summary':
          return summarizeFacts(loadFactTable(project.codeRoot))
        case 'add': {
          if (input.entry === undefined) throw invalid('entry is required for action=add (subject, kind, value)')
          return addFactEntry(project.codeRoot, input.entry)
        }
        default:
          throw invalid(`unknown fact action ${JSON.stringify(input.action)}`)
      }
    },

    knowledgeLesson(input) {
      const project = requireProject(db, input.projectId)
      const docRoot = docRootOf(project)
      switch (input.action) {
        case 'list': {
          const lessons = discoverLessons(docRoot)
          return { total: lessons.length, lessons }
        }
        case 'get': {
          if (input.name === undefined || input.name === '') throw invalid('name is required for action=get')
          return findLesson(docRoot, input.name)
        }
        case 'add': {
          if (input.name === undefined || input.name === '') throw invalid('name is required for action=add')
          if (input.body === undefined || input.body.trim() === '') throw invalid('body is required for action=add')
          return writeLesson(docRoot, {
            name: input.name,
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.tags === undefined ? {} : { tags: input.tags }),
            ...(input.severity === undefined ? {} : { severity: input.severity }),
            ...(input.created === undefined ? {} : { created: input.created }),
            body: input.body,
          })
        }
        default:
          throw invalid(`unknown lesson action ${JSON.stringify(input.action)}`)
      }
    },

    knowledgeResearch(input) {
      const project = requireProject(db, input.projectId)
      const docRoot = docRootOf(project)
      switch (input.action) {
        case 'list': {
          const reports = discoverReports(docRoot)
          return { total: reports.length, reports }
        }
        case 'get': {
          if (input.slug === undefined || input.slug === '') throw invalid('slug is required for action=get')
          return findReport(docRoot, input.slug)
        }
        case 'add': {
          if (input.slug === undefined || input.slug === '') throw invalid('slug is required for action=add')
          if (input.body === undefined || input.body.trim() === '') throw invalid('body is required for action=add')
          return writeReport(docRoot, {
            slug: input.slug,
            ...(input.topic === undefined ? {} : { topic: input.topic }),
            ...(input.mode === undefined ? {} : { mode: input.mode }),
            ...(input.dimensions === undefined ? {} : { dimensions: input.dimensions }),
            ...(input.candidates === undefined ? {} : { candidates: input.candidates }),
            ...(input.created === undefined ? {} : { created: input.created }),
            body: input.body,
          })
        }
        default:
          throw invalid(`unknown research action ${JSON.stringify(input.action)}`)
      }
    },

    knowledgeForensic(input) {
      switch (input.action) {
        case 'search': {
          const sessions: ForensicSessionSummary[] = searchForensicSessions({
            ...(input.projectPath === undefined ? {} : { projectPath: input.projectPath }),
            ...(input.session === undefined ? {} : { session: input.session }),
            ...(input.keyword === undefined ? {} : { keyword: input.keyword }),
            ...(input.skill === undefined ? {} : { skill: input.skill }),
            ...(input.last === undefined ? {} : { last: input.last }),
          }, historyPath())
          return { action: 'search', sessions }
        }
        case 'extract': {
          if (input.transcriptPath === undefined || input.transcriptPath === '') {
            throw invalid('transcriptPath is required for action=extract')
          }
          const evidence: ForensicEvidence = extractForensicEvidence(input.transcriptPath)
          return { action: 'extract', evidence }
        }
        case 'subagents': {
          if (input.sessionDir === undefined || input.sessionDir === '') {
            throw invalid('sessionDir is required for action=subagents')
          }
          const subagents: ForensicSubagent[] = listForensicSubagents(input.sessionDir)
          return { action: 'subagents', subagents }
        }
        default:
          throw invalid(`unknown forensic action ${JSON.stringify(input.action)}`)
      }
    },

    featureList(projectId) {
      const project = requireProject(db, projectId)
      return listFeatures(resolveFeaturesDir(scanTargetOf(project)))
    },

    featureStatus(input) {
      const project = requireProject(db, input.projectId)
      return readFeatureStatus(resolveFeaturesDir(scanTargetOf(project)), input.featureSlug)
    },
  }
}
