CREATE TABLE IF NOT EXISTS agent_invite_claims (
  invite_hash TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_invite_claims_agent_id ON agent_invite_claims(agent_id);
