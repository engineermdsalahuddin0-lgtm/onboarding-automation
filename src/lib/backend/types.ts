import type { Profile } from '../../types';

export type TableName =
  | 'profiles'
  | 'settings'
  | 'message_templates'
  | 'document_templates'
  | 'designations'
  | 'requisitions'
  | 'job_postings'
  | 'cv_buckets'
  | 'candidates'
  | 'candidate_events'
  | 'message_log'
  | 'candidate_reviews'
  | 'cv_review_sessions'
  | 'notifications'
  | 'questions'
  | 'edit_requests';

export interface ListOptions {
  /** Comma-separated column list. Omit for every column. */
  select?: string;
  match?: Record<string, string | number | boolean>;
  /** Only rows whose column is at or after this value, e.g. created_at since a day. */
  since?: { column: string; value: string };
  order?: { column: string; ascending?: boolean };
  /** At most this many rows, from the start of the order. Omit for all rows. */
  limit?: number;
}

export type RpcName =
  | 'get_public_bucket'
  | 'submit_application'
  | 'get_review_invite'
  | 'submit_review'
  | 'set_ai_key'
  | 'ai_key_status'
  | 'request_edit'
  | 'decide_edit'
  | 'cancel_edit'
  | 'apply_edit';

/** Everything the app needs from a data store. Supabase in production, the browser in demo mode. */
export interface Backend {
  readonly mode: 'supabase' | 'demo';
  currentUser(): Promise<Profile | null>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(callback: () => void): () => void;
  accessToken(): Promise<string | null>;

  list<T>(table: TableName, options?: ListOptions): Promise<T[]>;
  get<T>(table: TableName, match: Record<string, string | number>): Promise<T | null>;
  insert<T>(table: TableName, rows: object[]): Promise<T[]>;
  update<T>(table: TableName, match: Record<string, string | number>, patch: object): Promise<T[]>;
  upsert<T>(table: TableName, rows: object[], conflictColumn: string): Promise<T[]>;
  remove(table: TableName, match: Record<string, string | number>): Promise<void>;
  rpc<T>(name: RpcName, args: Record<string, unknown>): Promise<T>;

  upload(path: string, file: Blob, contentType: string): Promise<void>;
  /** Deletes stored files. Admins only; paths that do not exist are ignored. */
  removeFiles(paths: string[]): Promise<void>;
  /** Returns a temporary link per storage path. Paths that cannot be signed are left out. */
  signedUrls(paths: string[]): Promise<Record<string, string>>;
  /** Fires when another user changes shared data. */
  subscribe(callback: (table: string) => void): () => void;
  /**
   * Who is online and where, for Team activity. Each open tab shares what it is looking at; onChange gets
   * everyone's, this tab's included. Only ids and a page path are shared, never a candidate's details.
   */
  presence(onChange: (entries: PresenceEntry[]) => void): { update(entry: PresenceEntry): void; stop(): void };
}

export interface PresenceEntry {
  /** One per open tab, so two tabs of one person do not overwrite each other. */
  tab: string;
  user_id: string;
  /** The page path, e.g. /buckets/123. */
  path: string;
  candidate_id: string | null;
  /** When this tab started looking at what it shows now. */
  since: string;
}

export class BackendError extends Error {}
