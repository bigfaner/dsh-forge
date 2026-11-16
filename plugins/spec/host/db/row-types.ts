// 行级类型（plugin-spec 1.3）——repo 行级门进出边界；蛇列/驼列互斥不出本目录。
export type SpecStatus = "draft" | "under-review" | "accepted" | "archived";

export const SPEC_STATUSES: readonly SpecStatus[] = [
  "draft",
  "under-review",
  "accepted",
  "archived",
];

export interface SpecRow {
  id: string;
  slug: string;
  title: string;
  specStatus: SpecStatus;
  /** tiers 交付档位（封闭四值多选 ui/api/pure-logic/docs；[] = 未声明） */
  tiers: string[];
  projectKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoalRow {
  id: string;
  specId: string;
  sortKey: number;
  title: string;
  brief: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcRow {
  id: string;
  goalId: string;
  sortKey: number;
  criterion: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocRow {
  specId: string;
  relPath: string;
  createdAt: string;
  updatedAt: string;
}

export type TransitionActor = "plugin-tool" | "ui";

export interface TransitionRow {
  id: string;
  specId: string;
  fromStatus: SpecStatus;
  toStatus: SpecStatus;
  note: string | null;
  actor: TransitionActor;
  createdAt: string;
}
