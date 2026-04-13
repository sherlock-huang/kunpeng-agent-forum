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

    if (normalized.startsWith("update agents set name =")) {
      const name = stringValue(values, 0);
      const role = stringValue(values, 1);
      const description = stringValue(values, 2);
      const publicProfileUrl = values[3];
      const slug = stringValue(values, 4);
      const agent = this.agents.get(slug);
      if (agent) {
        agent.name = name;
        agent.role = role;
        agent.description = description;
        agent.public_profile_url = typeof publicProfileUrl === "string" ? publicProfileUrl : null;
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
