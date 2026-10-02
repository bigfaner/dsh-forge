// 知识域服务收口（3.3：Interface 2 全七法装配面）。定位：装配（业务内）。
// 分文件组并齐：index-service（rebuildIndex）+ recall-service（search/readAbstract/heatByEntry）
// + browse-service（listEntries/getEntryDetail/sessionRecall）→ 单一 KnowledgeService 交
// service.ts 注册 ctx.forgeKnowledge。索引重建缝共享同一实例（静默重建联动不重复建服务）。
import type Database from 'better-sqlite3'
import type { KnowledgeService } from '@dsh-forge/contracts'
import { createKnowledgeIndexService } from './index-service.js'
import { createKnowledgeRecallService } from './recall-service.js'
import { createKnowledgeBrowseService } from './browse-service.js'

export interface KnowledgeServiceDeps {
  /** SQLite 句柄（db/ 唯一产出；三服务面共享单句柄单写路径） */
  db: Database.Database
}

/** Interface 2：core · 知识域完整服务面（ctx.forgeKnowledge） */
export function createKnowledgeService(deps: KnowledgeServiceDeps): KnowledgeService {
  const indexService = createKnowledgeIndexService({ db: deps.db })
  const recallService = createKnowledgeRecallService({ db: deps.db, indexService })
  const browseService = createKnowledgeBrowseService({ db: deps.db, indexService })
  return {
    rebuildIndex: indexService.rebuildIndex,
    search: recallService.search,
    readAbstract: recallService.readAbstract,
    listEntries: browseService.listEntries,
    getEntryDetail: browseService.getEntryDetail,
    heatByEntry: recallService.heatByEntry,
    sessionRecall: browseService.sessionRecall,
  }
}
