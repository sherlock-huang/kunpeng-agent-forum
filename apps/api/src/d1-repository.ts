import type { AgentRegistrationInput, CreateThreadInput } from "@kunpeng-agent-forum/shared/src/types";
import { slugify } from "./in-memory-repository";
import type { AgentRecord, AuthenticatedAgent, CreateReplyInput, ForumRepository, ReplyRecord, ThreadDetailRecord, ThreadRecord } from "./repository";

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
  created_at: string;
  updated_at: string;
};

type TagSlugRow = {
  slug: string;
};

type TagRow = {
  id: string;
  slug: string;
  label: string;
};

type ReplyRow = {
  id: string;
  thread_id: string;
  reply_role: string;
  content: string;
  evidence_links: string;
  commands_run: string;
  risks: string;
  created_at: string;
};

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function likePattern(value: string): string {
  return `%${value}%`;
}

export class D1ForumRepository implements ForumRepository {
  constructor(private readonly db: D1Database) {}

  async requestAgentRegistration(input: AgentRegistrationInput): Promise<AgentRecord | null> {
    const existing = await this.findAgentBySlug(input.slug);
    if (existing && existing.status !== "pending") {
      return null;
    }

    const now = new Date().toISOString();
    if (existing) {
      await this.db.prepare(`
        UPDATE agents
        SET name = ?, role = ?, description = ?, public_profile_url = ?
        WHERE slug = ?
      `).bind(input.name, input.role, input.description, input.publicProfileUrl || null, input.slug).run();
      return this.mapAgent({
        ...existing,
        name: input.name,
        role: input.role,
        description: input.description,
        public_profile_url: input.publicProfileUrl || null
      });
    }

    const agentId = createId("agent");
    await this.db.prepare(`
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      agentId,
      input.slug,
      input.name,
      input.role,
      input.description,
      input.publicProfileUrl || null,
      "pending",
      "pending",
      now,
      null
    ).run();

    const agent = await this.findAgentBySlug(input.slug);
    return agent ? this.mapAgent(agent) : null;
  }

  async approveAgent(slug: string, tokenHash: string): Promise<AgentRecord | null> {
    const existing = await this.findAgentBySlug(slug);
    if (!existing) {
      return null;
    }

    await this.db.prepare(`
      UPDATE agents
      SET write_token_hash = ?, status = ?
      WHERE slug = ?
    `).bind(tokenHash, "active", slug).run();

    const agent = await this.findAgentBySlug(slug);
    return agent ? this.mapAgent(agent) : null;
  }

  async revokeAgent(slug: string): Promise<AgentRecord | null> {
    const existing = await this.findAgentBySlug(slug);
    if (!existing) {
      return null;
    }

    await this.db.prepare(`
      UPDATE agents
      SET status = ?
      WHERE slug = ?
    `).bind("revoked", slug).run();

    const agent = await this.findAgentBySlug(slug);
    return agent ? this.mapAgent(agent) : null;
  }

  async hasInviteClaim(inviteHash: string): Promise<boolean> {
    const claim = await this.db.prepare(`
      SELECT invite_hash FROM agent_invite_claims
      WHERE invite_hash = ?
      LIMIT 1
    `).bind(inviteHash).first<{ invite_hash: string }>();
    return Boolean(claim);
  }

  async registerAgentWithToken(
    input: AgentRegistrationInput,
    tokenHash: string,
    inviteHash: string
  ): Promise<AgentRecord | null> {
    if (await this.hasInviteClaim(inviteHash)) {
      return null;
    }

    const existing = await this.findAgentBySlug(input.slug);
    if (existing && existing.status === "active") {
      return null;
    }

    const now = new Date().toISOString();
    const agentId = existing?.id || createId("agent");
    if (existing) {
      await this.db.prepare(`
        UPDATE agents
        SET name = ?, role = ?, description = ?, public_profile_url = ?, write_token_hash = ?, status = ?
        WHERE slug = ?
      `).bind(
        input.name,
        input.role,
        input.description,
        input.publicProfileUrl || null,
        tokenHash,
        "active",
        input.slug
      ).run();
    } else {
      await this.db.prepare(`
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        agentId,
        input.slug,
        input.name,
        input.role,
        input.description,
        input.publicProfileUrl || null,
        tokenHash,
        "active",
        now,
        null
      ).run();
    }

    await this.db.prepare(`
      INSERT INTO agent_invite_claims (invite_hash, agent_id, claimed_at)
      VALUES (?, ?, ?)
    `).bind(inviteHash, agentId, now).run();

    const agent = await this.findAgentBySlug(input.slug);
    return agent ? this.mapAgent(agent) : null;
  }

  async findActiveAgentByTokenHash(tokenHash: string): Promise<AuthenticatedAgent | null> {
    const agent = await this.db.prepare(`
      SELECT * FROM agents
      WHERE write_token_hash = ? AND status = ?
      LIMIT 1
    `).bind(tokenHash, "active").first<AgentRow>();
    return agent ? this.mapAuthenticatedAgent(agent) : null;
  }

  async touchAgentLastSeen(agentId: string, timestamp: string): Promise<void> {
    await this.db.prepare(`
      UPDATE agents
      SET last_seen_at = ?
      WHERE id = ?
    `).bind(timestamp, agentId).run();
  }

  async createThread(agent: AuthenticatedAgent, input: CreateThreadInput): Promise<ThreadRecord> {
    const now = new Date().toISOString();
    const threadId = createId("thread");
    const slug = slugify(input.title);

    await this.db.prepare(`
      INSERT INTO threads (
        id,
        slug,
        title,
        summary,
        body,
        problem_type,
        project,
        repository_url,
        environment,
        error_signature,
        status,
        human_review_state,
        created_by_agent_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      threadId,
      slug,
      input.title,
      input.summary,
      input.body || null,
      input.problemType,
      input.project,
      input.repositoryUrl || null,
      input.environment,
      input.errorSignature || null,
      "open",
      "unreviewed",
      agent.id,
      now,
      now
    ).run();

    for (const tag of input.tags) {
      await this.upsertThreadTag(threadId, tag);
    }

    const thread = await this.findThread(threadId);
    if (!thread) {
      throw new Error(`Thread not found after D1 insert: ${threadId}`);
    }
    return thread;
  }

  async listThreads(): Promise<ThreadRecord[]> {
    const result = await this.db.prepare(`
      SELECT threads.* FROM threads
      ORDER BY threads.updated_at DESC
    `).all<ThreadRow>();
    return await this.mapThreadRows(result.results || []);
  }

  async findThread(idOrSlug: string): Promise<ThreadDetailRecord | null> {
    const thread = await this.findThreadRow(idOrSlug);
    if (!thread) {
      return null;
    }

    const tags = await this.findTagSlugs(thread.id);
    const replies = await this.findReplies(thread.id);
    return {
      ...this.mapThread(thread, tags),
      replies
    };
  }

  async searchThreads(query: string): Promise<ThreadRecord[]> {
    const normalized = query.trim();
    if (!normalized) {
      return await this.listThreads();
    }

    const pattern = likePattern(normalized);
    const result = await this.db.prepare(`
      SELECT threads.* FROM threads
      WHERE threads.title LIKE ?
        OR threads.summary LIKE ?
        OR threads.body LIKE ?
        OR threads.problem_type LIKE ?
        OR threads.project LIKE ?
        OR threads.environment LIKE ?
        OR threads.error_signature LIKE ?
        OR EXISTS (
          SELECT 1 FROM thread_tags
          INNER JOIN tags ON tags.id = thread_tags.tag_id
          WHERE thread_tags.thread_id = threads.id
            AND tags.slug LIKE ?
        )
      ORDER BY threads.updated_at DESC
    `).bind(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern).all<ThreadRow>();

    return await this.mapThreadRows(result.results || []);
  }

  async createReply(agent: AuthenticatedAgent, threadIdOrSlug: string, input: CreateReplyInput): Promise<ReplyRecord | null> {
    const thread = await this.findThreadRow(threadIdOrSlug);
    if (!thread) {
      return null;
    }

    const now = new Date().toISOString();
    const replyId = createId("reply");

    await this.db.prepare(`
      INSERT INTO replies (
        id,
        thread_id,
        agent_id,
        reply_role,
        content,
        evidence_links,
        commands_run,
        risks,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      replyId,
      thread.id,
      agent.id,
      input.replyRole,
      input.content,
      JSON.stringify(input.evidenceLinks),
      JSON.stringify(input.commandsRun),
      JSON.stringify(input.risks),
      now
    ).run();

    await this.touchThread(thread.id, now);

    const reply = await this.db.prepare(`
      SELECT * FROM replies WHERE id = ?
    `).bind(replyId).first<ReplyRow>();
    return reply ? this.mapReply(reply) : null;
  }

  async markThreadSolved(agent: AuthenticatedAgent, threadIdOrSlug: string, summary: string): Promise<ThreadDetailRecord | null> {
    const thread = await this.findThreadRow(threadIdOrSlug);
    if (!thread) {
      return null;
    }

    const now = new Date().toISOString();
    await this.db.prepare(`
      UPDATE threads SET status = ?, updated_at = ?
      WHERE id = ?
    `).bind("solved", now, thread.id).run();

    await this.createReply(agent, thread.id, {
      replyRole: "summary",
      content: summary,
      evidenceLinks: [],
      commandsRun: [],
      risks: []
    });

    return await this.findThread(thread.id);
  }

  private async findAgentBySlug(slug: string): Promise<AgentRow | null> {
    return await this.db.prepare(`
      SELECT * FROM agents WHERE slug = ?
    `).bind(slug).first<AgentRow>();
  }

  private mapAgent(row: AgentRow): AgentRecord {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      description: row.description,
      ...(row.public_profile_url ? { publicProfileUrl: row.public_profile_url } : {}),
      status: row.status as AgentRecord["status"],
      createdAt: row.created_at,
      ...(row.last_seen_at ? { lastSeenAt: row.last_seen_at } : {})
    };
  }

  private mapAuthenticatedAgent(row: AgentRow): AuthenticatedAgent {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role
    };
  }

  private async findThreadRow(idOrSlug: string): Promise<ThreadRow | null> {
    return await this.db.prepare(`
      SELECT threads.* FROM threads
      WHERE threads.id = ? OR threads.slug = ?
      LIMIT 1
    `).bind(idOrSlug, idOrSlug).first<ThreadRow>();
  }

  private async findTagSlugs(threadId: string): Promise<string[]> {
    const result = await this.db.prepare(`
      SELECT tags.slug FROM tags
      INNER JOIN thread_tags ON thread_tags.tag_id = tags.id
      WHERE thread_tags.thread_id = ?
      ORDER BY tags.slug ASC
    `).bind(threadId).all<TagSlugRow>();
    return (result.results || []).map((row) => row.slug);
  }

  private async findReplies(threadId: string): Promise<ReplyRecord[]> {
    const result = await this.db.prepare(`
      SELECT * FROM replies
      WHERE thread_id = ?
      ORDER BY created_at ASC
    `).bind(threadId).all<ReplyRow>();
    return (result.results || []).map((row) => this.mapReply(row));
  }

  private async mapThreadRows(rows: ThreadRow[]): Promise<ThreadRecord[]> {
    const mapped: ThreadRecord[] = [];
    for (const row of rows) {
      mapped.push(this.mapThread(row, await this.findTagSlugs(row.id)));
    }
    return mapped;
  }

  private mapThread(row: ThreadRow, tags: string[]): ThreadRecord {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      ...(row.body ? { body: row.body } : {}),
      problemType: row.problem_type,
      project: row.project,
      ...(row.repository_url ? { repositoryUrl: row.repository_url } : {}),
      environment: row.environment,
      ...(row.error_signature ? { errorSignature: row.error_signature } : {}),
      tags,
      status: row.status as ThreadRecord["status"],
      humanReviewState: row.human_review_state as ThreadRecord["humanReviewState"],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapReply(row: ReplyRow): ReplyRecord {
    return {
      id: row.id,
      threadId: row.thread_id,
      replyRole: row.reply_role as ReplyRecord["replyRole"],
      content: row.content,
      evidenceLinks: parseJsonStringArray(row.evidence_links),
      commandsRun: parseJsonStringArray(row.commands_run),
      risks: parseJsonStringArray(row.risks),
      author: "agent",
      createdAt: row.created_at
    };
  }

  private async upsertThreadTag(threadId: string, slug: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO tags (id, slug, label)
      VALUES (?, ?, ?)
      ON CONFLICT(slug) DO NOTHING
    `).bind(createId("tag"), slug, slug).run();

    const tag = await this.db.prepare(`
      SELECT * FROM tags WHERE slug = ?
    `).bind(slug).first<TagRow>();
    if (!tag) {
      throw new Error(`Tag not found after D1 insert: ${slug}`);
    }

    await this.db.prepare(`
      INSERT INTO thread_tags (thread_id, tag_id)
      VALUES (?, ?)
      ON CONFLICT(thread_id, tag_id) DO NOTHING
    `).bind(threadId, tag.id).run();
  }

  private async touchThread(threadId: string, updatedAt: string): Promise<void> {
    await this.db.prepare(`
      UPDATE threads SET status = status, updated_at = ?
      WHERE id = ?
    `).bind(updatedAt, threadId).run();
  }
}
