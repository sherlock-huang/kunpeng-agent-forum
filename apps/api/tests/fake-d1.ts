import type { AuthenticatedAgent } from "../src/repository";

type AgentRow = {
  id: string;
  slug: string;
  name: string;
  role: string;
  description: string;
  public_profile_url: string | null;
  write_token_hash: string;
  status: string;
  created_at: string;
  last_seen_at: string | null;
};

type ThreadRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string | null;
  problem_type: string;
  project: string;
  repository_url: string | null;
  environment: string;
  error_signature: string | null;
  status: string;
  human_review_state: string;
  created_by_agent_id: string;
  created_at: string;
  updated_at: string;
};

type ReplyRow = {
  id: string;
  thread_id: string;
  agent_id: string;
  reply_role: string;
  content: string;
  evidence_links: string;
  commands_run: string;
  risks: string;
  created_at: string;
};

type TagRow = {
  id: string;
  slug: string;
  label: string;
};

type InviteClaimRow = {
  invite_hash: string;
  agent_id: string;
  claimed_at: string;
};

type InviteRegistryRow = {
  id: string;
  batch_name: string;
  invite_code_hash: string;
  issued_to: string | null;
  channel: string | null;
  expected_slug: string | null;
  agent_name: string | null;
  role: string | null;
  note: string | null;
  status: string;
  created_at: string;
  claimed_at: string | null;
  claimed_agent_id: string | null;
  claimed_agent_slug: string | null;
  first_thread_id: string | null;
  first_thread_slug: string | null;
  first_thread_title: string | null;
  first_posted_at: string | null;
  revoked_at: string | null;
};

export type FakeD1Result<T = unknown> = {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
};

function stringValue(values: unknown[], index: number): string {
  const value = values[index];
  if (typeof value !== "string") {
    throw new Error(`Expected fake D1 bind value ${index} to be a string`);
  }
  return value;
}

export class FakeD1Database {
  private readonly agents = new Map<string, AgentRow>();
  private readonly threads = new Map<string, ThreadRow>();
  private readonly replies = new Map<string, ReplyRow>();
  private readonly tags = new Map<string, TagRow>();
  private readonly inviteClaims = new Map<string, InviteClaimRow>();
  private readonly inviteRegistry = new Map<string, InviteRegistryRow>();
  private readonly threadTags: Array<{ thread_id: string; tag_id: string }> = [];

  prepare(query: string): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this, query);
  }

  async batch<T = unknown>(statements: FakeD1PreparedStatement[]): Promise<Array<FakeD1Result<T>>> {
    const results: Array<FakeD1Result<T>> = [];
    for (const statement of statements) {
      results.push(await statement.run<T>());
    }
    return results;
  }

  seedAgent(agent: { id: string; slug: string; tokenHash?: string; status?: string }): AuthenticatedAgent {
    this.agents.set(agent.slug, {
      id: agent.id,
      slug: agent.slug,
      name: "Codex",
      role: "implementation-agent",
      description: "Fake D1 test agent",
      public_profile_url: null,
      write_token_hash: agent.tokenHash || "fake",
      status: agent.status || "active",
      created_at: "2026-04-12T00:00:00.000Z",
      last_seen_at: null
    });

    return {
      id: agent.id,
      slug: agent.slug,
      name: "Codex",
      role: "implementation-agent"
    };
  }

  execute<T>(query: string, values: unknown[], mode: "first" | "all" | "run"): T | FakeD1Result<T> | null {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("select * from agents where slug =")) {
      return (Array.from(this.agents.values()).find((agent) => agent.slug === values[0]) || null) as T | null;
    }

    if (normalized.startsWith("select * from agents where write_token_hash =")) {
      return (
        Array.from(this.agents.values()).find(
          (agent) => agent.write_token_hash === values[0] && agent.status === values[1]
        ) || null
      ) as T | null;
    }

    if (normalized.startsWith("select id, slug, name, role, description, public_profile_url, write_token_hash, status, created_at, last_seen_at from agents order by created_at desc")) {
      const rows = Array.from(this.agents.values()).sort((left, right) => right.created_at.localeCompare(left.created_at));
      return this.result<T>(rows as T[]);
    }

    if (normalized.startsWith("select invite_hash from agent_invite_claims")) {
      return (this.inviteClaims.get(values[0] as string) || null) as T | null;
    }

    if (normalized.startsWith("select * from invite_registry where invite_code_hash =")) {
      return (this.inviteRegistry.get(values[0] as string) || null) as T | null;
    }

    if (normalized.startsWith("select * from invite_registry where claimed_agent_id =")) {
      return (
        Array.from(this.inviteRegistry.values()).find((record) => record.claimed_agent_id === values[0]) || null
      ) as T | null;
    }

    if (normalized.startsWith("select * from invite_registry where id =")) {
      return (
        Array.from(this.inviteRegistry.values()).find((record) => record.id === values[0]) || null
      ) as T | null;
    }

    if (normalized.startsWith("select * from invite_registry order by created_at desc")) {
      const rows = Array.from(this.inviteRegistry.values()).sort((left, right) => right.created_at.localeCompare(left.created_at));
      return this.result<T>(rows as T[]);
    }

    if (normalized.startsWith("insert into agents")) {
      const id = stringValue(values, 0);
      const slug = stringValue(values, 1);
      const name = stringValue(values, 2);
      const role = stringValue(values, 3);
      const description = stringValue(values, 4);
      const publicProfileUrl = values[5];
      const writeTokenHash = stringValue(values, 6);
      const status = stringValue(values, 7);
      const createdAt = stringValue(values, 8);
      const lastSeenAt = values[9];

      this.agents.set(slug, {
        id,
        slug,
        name,
        role,
        description,
        public_profile_url: typeof publicProfileUrl === "string" ? publicProfileUrl : null,
        write_token_hash: writeTokenHash,
        status,
        created_at: createdAt,
        last_seen_at: typeof lastSeenAt === "string" ? lastSeenAt : null
      });
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into agent_invite_claims")) {
      const inviteHash = stringValue(values, 0);
      const agentId = stringValue(values, 1);
      const claimedAt = stringValue(values, 2);
      this.inviteClaims.set(inviteHash, {
        invite_hash: inviteHash,
        agent_id: agentId,
        claimed_at: claimedAt
      });
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into invite_registry")) {
      const row: InviteRegistryRow = {
        id: stringValue(values, 0),
        batch_name: stringValue(values, 1),
        invite_code_hash: stringValue(values, 2),
        issued_to: typeof values[3] === "string" ? values[3] : null,
        channel: typeof values[4] === "string" ? values[4] : null,
        expected_slug: typeof values[5] === "string" ? values[5] : null,
        agent_name: typeof values[6] === "string" ? values[6] : null,
        role: typeof values[7] === "string" ? values[7] : null,
        note: typeof values[8] === "string" ? values[8] : null,
        status: stringValue(values, 9),
        created_at: stringValue(values, 10),
        claimed_at: typeof values[11] === "string" ? values[11] : null,
        claimed_agent_id: typeof values[12] === "string" ? values[12] : null,
        claimed_agent_slug: typeof values[13] === "string" ? values[13] : null,
        first_thread_id: typeof values[14] === "string" ? values[14] : null,
        first_thread_slug: typeof values[15] === "string" ? values[15] : null,
        first_thread_title: typeof values[16] === "string" ? values[16] : null,
        first_posted_at: typeof values[17] === "string" ? values[17] : null,
        revoked_at: typeof values[18] === "string" ? values[18] : null
      };
      this.inviteRegistry.set(row.invite_code_hash, row);
      return this.result<T>([]);
    }

    if (normalized.startsWith("update agents set name =")) {
      const hasTokenUpdate = normalized.includes("write_token_hash");
      const name = stringValue(values, 0);
      const role = stringValue(values, 1);
      const description = stringValue(values, 2);
      const publicProfileUrl = values[3];
      const tokenHash = hasTokenUpdate ? stringValue(values, 4) : null;
      const status = hasTokenUpdate ? stringValue(values, 5) : null;
      const slug = stringValue(values, hasTokenUpdate ? 6 : 4);
      const agent = this.agents.get(slug);
      if (agent) {
        agent.name = name;
        agent.role = role;
        agent.description = description;
        agent.public_profile_url = typeof publicProfileUrl === "string" ? publicProfileUrl : null;
        if (tokenHash && status) {
          agent.write_token_hash = tokenHash;
          agent.status = status;
        }
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("update invite_registry set status = ?, claimed_at = ?, claimed_agent_id = ?, claimed_agent_slug = ?")) {
      const record = this.inviteRegistry.get(stringValue(values, 4));
      if (record && record.status === stringValue(values, 5)) {
        record.status = stringValue(values, 0);
        record.claimed_at = stringValue(values, 1);
        record.claimed_agent_id = stringValue(values, 2);
        record.claimed_agent_slug = stringValue(values, 3);
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("update invite_registry set status = ?, first_thread_id = ?, first_thread_slug = ?, first_thread_title = ?, first_posted_at = ?")) {
      const agentId = stringValue(values, 5);
      const record = Array.from(this.inviteRegistry.values()).find((item) => item.claimed_agent_id === agentId);
      if (record && !record.first_thread_id) {
        record.status = stringValue(values, 0);
        record.first_thread_id = stringValue(values, 1);
        record.first_thread_slug = stringValue(values, 2);
        record.first_thread_title = stringValue(values, 3);
        record.first_posted_at = stringValue(values, 4);
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("update invite_registry set status = ?, revoked_at = ?")) {
      const record = Array.from(this.inviteRegistry.values()).find((item) => item.id === values[2]);
      if (record) {
        record.status = stringValue(values, 0);
        record.revoked_at = stringValue(values, 1);
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("update agents set write_token_hash =")) {
      const tokenHash = stringValue(values, 0);
      const status = stringValue(values, 1);
      const slug = stringValue(values, 2);
      const agent = this.agents.get(slug);
      if (agent) {
        agent.write_token_hash = tokenHash;
        agent.status = status;
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("update agents set status =")) {
      const status = stringValue(values, 0);
      const slug = stringValue(values, 1);
      const agent = this.agents.get(slug);
      if (agent) {
        agent.status = status;
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("update agents set last_seen_at =")) {
      const lastSeenAt = stringValue(values, 0);
      const id = stringValue(values, 1);
      const agent = Array.from(this.agents.values()).find((item) => item.id === id);
      if (agent) {
        agent.last_seen_at = lastSeenAt;
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into threads")) {
      const id = stringValue(values, 0);
      const slug = stringValue(values, 1);
      const title = stringValue(values, 2);
      const summary = stringValue(values, 3);
      const body = values[4];
      const problemType = stringValue(values, 5);
      const project = stringValue(values, 6);
      const repositoryUrl = values[7];
      const environment = stringValue(values, 8);
      const errorSignature = values[9];
      const status = stringValue(values, 10);
      const humanReviewState = stringValue(values, 11);
      const createdByAgentId = stringValue(values, 12);
      const createdAt = stringValue(values, 13);
      const updatedAt = stringValue(values, 14);
      this.threads.set(id, {
        id,
        slug,
        title,
        summary,
        body: typeof body === "string" ? body : null,
        problem_type: problemType,
        project,
        repository_url: typeof repositoryUrl === "string" ? repositoryUrl : null,
        environment,
        error_signature: typeof errorSignature === "string" ? errorSignature : null,
        status,
        human_review_state: humanReviewState,
        created_by_agent_id: createdByAgentId,
        created_at: createdAt,
        updated_at: updatedAt
      });
      return this.result<T>([]);
    }

    if (normalized.startsWith("insert into tags")) {
      const id = stringValue(values, 0);
      const slug = stringValue(values, 1);
      const label = stringValue(values, 2);
      if (!this.tags.has(slug)) {
        this.tags.set(slug, { id, slug, label });
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("select * from tags where slug =")) {
      return (this.tags.get(values[0] as string) || null) as T | null;
    }

    if (normalized.startsWith("insert into thread_tags")) {
      const threadId = stringValue(values, 0);
      const tagId = stringValue(values, 1);
      if (!this.threadTags.some((row) => row.thread_id === threadId && row.tag_id === tagId)) {
        this.threadTags.push({ thread_id: threadId, tag_id: tagId });
      }
      return this.result<T>([]);
    }

    if (normalized.startsWith("select threads.* from threads where threads.id = ? or threads.slug = ?")) {
      return (this.findThread(values[0] as string) || null) as T | null;
    }

    if (normalized.startsWith("select threads.* from threads order by")) {
      return this.result<T>(this.sortedThreads() as T[]);
    }

    if (normalized.startsWith("select threads.* from threads where")) {
      const needle = String(values[0] || "").replaceAll("%", "").toLowerCase();
      const rows = this.sortedThreads().filter((thread) => {
        const tagSlugs = this.tagsForThread(thread.id).join(" ");
        return [
          thread.title,
          thread.summary,
          thread.body || "",
          thread.problem_type,
          thread.project,
          thread.environment,
          thread.error_signature || "",
          tagSlugs
        ].join(" ").toLowerCase().includes(needle);
      });
      return this.result<T>(rows as T[]);
    }

    if (normalized.startsWith("select tags.slug from tags inner join thread_tags")) {
      const threadId = values[0] as string;
      return this.result<T>(this.tagsForThread(threadId).map((slug) => ({ slug })) as T[]);
    }

    if (normalized.startsWith("select * from replies where thread_id =")) {
      const threadId = values[0] as string;
      const rows = Array.from(this.replies.values())
        .filter((reply) => reply.thread_id === threadId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at));
      return this.result<T>(rows as T[]);
    }

    if (normalized.startsWith("insert into replies")) {
      const id = stringValue(values, 0);
      const threadId = stringValue(values, 1);
      const agentId = stringValue(values, 2);
      const replyRole = stringValue(values, 3);
      const content = stringValue(values, 4);
      const evidenceLinks = stringValue(values, 5);
      const commandsRun = stringValue(values, 6);
      const risks = stringValue(values, 7);
      const createdAt = stringValue(values, 8);
      this.replies.set(id, {
        id,
        thread_id: threadId,
        agent_id: agentId,
        reply_role: replyRole,
        content,
        evidence_links: evidenceLinks,
        commands_run: commandsRun,
        risks,
        created_at: createdAt
      });
      return this.result<T>([]);
    }

    if (normalized.startsWith("select * from replies where id =")) {
      return (this.replies.get(values[0] as string) || null) as T | null;
    }

    if (normalized.startsWith("update threads set status =")) {
      if (values.length === 2) {
        const updatedAt = stringValue(values, 0);
        const id = stringValue(values, 1);
        const thread = this.threads.get(id);
        if (thread) {
          thread.updated_at = updatedAt;
        }
        return this.result<T>([]);
      }

      const status = stringValue(values, 0);
      const updatedAt = stringValue(values, 1);
      const id = stringValue(values, 2);
      const thread = this.threads.get(id);
      if (thread) {
        thread.status = status;
        thread.updated_at = updatedAt;
      }
      return this.result<T>([]);
    }

    throw new Error(`Unhandled fake D1 ${mode} query: ${query}`);
  }

  private sortedThreads() {
    return Array.from(this.threads.values()).sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  private tagsForThread(threadId: string): string[] {
    return this.threadTags
      .filter((row) => row.thread_id === threadId)
      .map((row) => Array.from(this.tags.values()).find((tag) => tag.id === row.tag_id)?.slug)
      .filter((slug): slug is string => Boolean(slug));
  }

  private findThread(idOrSlug: string) {
    return Array.from(this.threads.values()).find((thread) => thread.id === idOrSlug || thread.slug === idOrSlug);
  }

  private result<T>(results: T[]): FakeD1Result<T> {
    return { results, success: true, meta: {} };
  }
}

export class FakeD1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): FakeD1PreparedStatement {
    this.values = values;
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    return this.db.execute<T>(this.query, this.values, "first") as T | null;
  }

  async all<T = unknown>(): Promise<FakeD1Result<T>> {
    return this.db.execute<T>(this.query, this.values, "all") as FakeD1Result<T>;
  }

  async run<T = unknown>(): Promise<FakeD1Result<T>> {
    return this.db.execute<T>(this.query, this.values, "run") as FakeD1Result<T>;
  }
}
