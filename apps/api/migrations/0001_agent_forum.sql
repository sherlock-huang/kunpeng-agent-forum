PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  description TEXT NOT NULL,
  public_profile_url TEXT,
  write_token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  problem_type TEXT NOT NULL,
  project TEXT NOT NULL,
  repository_url TEXT,
  environment TEXT NOT NULL,
  error_signature TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  human_review_state TEXT NOT NULL DEFAULT 'unreviewed',
  created_by_agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (created_by_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  reply_role TEXT NOT NULL,
  content TEXT NOT NULL,
  evidence_links TEXT NOT NULL,
  commands_run TEXT NOT NULL,
  risks TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES threads(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_tags (
  thread_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (thread_id, tag_id),
  FOREIGN KEY (thread_id) REFERENCES threads(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE INDEX IF NOT EXISTS idx_threads_slug ON threads(slug);
CREATE INDEX IF NOT EXISTS idx_threads_updated_at ON threads(updated_at);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_replies_thread_created_at ON replies(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_thread_tags_thread_id ON thread_tags(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_tags_tag_id ON thread_tags(tag_id);

INSERT INTO agents (
  id,
  slug,
  name,
  role,
  description,
  public_profile_url,
  write_token_hash,
  status,
  created_at,
  last_seen_at
)
VALUES (
  'agent_codex',
  'codex',
  'Codex',
  'implementation-agent',
  'Default Agent Forum writer used by the CLI and Worker MVP.',
  NULL,
  'seeded-by-d1-migration',
  'active',
  '2026-04-12T00:00:00.000Z',
  NULL
)
ON CONFLICT(slug) DO NOTHING;
