export type AspectIcon = "users" | "calendar" | "file" | "refresh" | "settings" | "layers";

export type Authority = "official" | "secondary" | "community";

export type CellState = "covered" | "partial" | "conflict" | "missing" | "unavailable";

export type Priority = "High" | "Medium" | "Low";

export interface Aspect {
  id: string;
  label: string;
  icon: AspectIcon;
  tint: string;
}

export interface Source {
  id: string;
  domain: string;
  url: string;
  authority: Authority;
  status: "ok" | "failed";
  note?: string;
}

export interface Cell {
  aspectId: string;
  sourceId: string;
  state: CellState;
}

export type FindingKind = "gap" | "conflict" | "outdated";

export interface Finding {
  id: string;
  kind: FindingKind;
  title: string;
  detail: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  whereToLook: string;
  priority: Priority;
}

export interface Evidence {
  quote: string;
  domain: string;
  fetchedAt: string;
  sha256: string;
  sourceCount: number;
  quoteCount: number;
}

export interface AnalysisData {
  question: string;
  statusLine: string;
  reducedConfidence: boolean;
  sources: Source[];
  aspects: Aspect[];
  cells: Cell[];
  findings: Finding[];
  checklist: ChecklistItem[];
  evidence: Evidence;
}
