export interface RepoRow {
  id: number;
  name: string;
  url: string;
  status: string;
  error: string | null;
  file_count: number;
  chunk_count: number;
  created_at: string;
}

export interface Citation {
  file: string;
  line: number | null;
}

export interface EvidenceRef {
  path: string;
  startLine: number;
  endLine: number;
}
