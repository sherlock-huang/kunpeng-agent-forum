import type { AgentRegistrationInput, CreateThreadInput } from "@kunpeng-agent-forum/shared/src/types";
import { slugify } from "./in-memory-repository";
import type {
  AgentRecord,
  AuthenticatedAgent,
  CreateInviteRegistryInput,
  CreateReplyInput,
  ForumRepository,
  InviteRegistryRecord,
  ReplyRecord,
  ThreadDetailRecord,
  ThreadRecord
} from "./repository";

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

  async listAgents(): Promise<AgentRecord[]> {
    const result = await this.db.prepare(`
      SELECT id, slug, name, role, description, public_profile_url, write_token_hash, status, created_at, last_seen_at
      FROM agents
      ORDER BY created_at DESC
    `).all<AgentRow>();
    return result.results.map((agent) => this.mapAgent(agent));
  }

  async createInviteRegistryEntry(input: CreateInviteRegistryInput): Promise<InviteRegistryRecord> {
    const id = createId("invite_registry");
    const createdAt = new Date().toISOString();
    await this.db.prepare(`
      INSERT INTO invite_registry (
        id,
        batch_name,
        invite_code_hash,
        issued_to,
        channel,
        expected_slug,
        agent_name,
        role,
        note,
        status,
        created_at,
        claimed_at,
        claimed_agent_id,
        claimed_agent_slug,
        first_thread_id,
        first_thread_slug,
        first_thread_title,
        first_posted_at,
        revoked_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      input.batchName,
      input.inviteCodeHash,
      input.issuedTo || null,
      input.channel || null,
      input.expectedSlug || null,
      input.agentName || null,
      input.role || null,
      input.note || null,
      "issued",
      createdAt,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    ).run();

    const record = await this.findInviteRegistryByHash(input.inviteCodeHash);
    if (!record) {
      throw new Error(`Invite registry row not found after D1 insert: ${input.inviteCodeHash}`);
    }
    return record;
  }

  async findInviteRegistryByHash(inviteHash: string): Promise<InviteRegistryRecord | null> {
    const row = await this.db.prepare(`
      SELECT * FROM invite_registry
      WHERE invite_code_hash = ?
      LIMIT 1
    `).bind(inviteHash).first<InviteRegistryRow>();
    return row ? this.mapInviteRegistry(row) : null;
  }

  async listInviteRegistry(filters?: {
    batchName?: string;
    status?: InviteRegistryRecord["status"];
    expectedSlug?: string;
    claimedAgentSlug?: string;
  }): Promise<InviteRegistryRecord[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filters?.batchName) {
      clauses.push("batch_name = ?");
      values.push(filters.batchName);
    }
    if (filters?.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    if (filters?.expectedSlug) {
      clauses.push("expected_slug = ?");
      values.push(filters.expectedSlug);
    }
    if (filters?.claimedAgentSlug) {
      clauses.push("claimed_agent_slug = ?");
      values.push(filters.claimedAgentSlug);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.db.prepare(`
      SELECT * FROM invite_registry
      ${whereClause}
      ORDER BY created_at DESC
    `).bind(...values).all<InviteRegistryRow>();
    return (result.results || []).map((row) => this.mapInviteRegistry(row));
  }

  async markInviteRegistryClaimed(inviteHash: string, claim: {
    agentId: string;
    agentSlug: string;
    claimedAt: string;
  }): Promise<InviteRegistryRecord | null> {
    await this.db.prepare(`
      UPDATE invite_registry
      SET status = ?, claimed_at = ?, claimed_agent_id = ?, claimed_agent_slug = ?
      WHERE invite_code_hash = ? AND status = ?
    `).bind("claimed", claim.claimedAt, claim.agentId, claim.agentSlug, inviteHash, "issued").run();

    return await this.findInviteRegistryByHash(inviteHash);
  }

  async findInviteRegistryByClaimedAgentId(agentId: string): Promise<InviteRegistryRecord | null> {
    const row = await this.db.prepare(`
      SELECT * FROM invite_registry
      WHERE claimed_agent_id = ?
      LIMIT 1
    `).bind(agentId).first<InviteRegistryRow>();
    return row ? this.mapInviteRegistry(row) : null;
  }

  async markInviteRegistryFirstThread(agentId: string, firstThread: {
    threadId: string;
    threadSlug: string;
    threadTitle: string;
    firstPostedAt: string;
  }): Promise<InviteRegistryRecord | null> {
    await this.db.prepare(`
      UPDATE invite_registry
      SET status = ?, first_thread_id = ?, first_thread_slug = ?, first_thread_title = ?, first_posted_at = ?
      WHERE claimed_agent_id = ? AND first_thread_id IS NULL
    `).bind(
      "posted",
      firstThread.threadId,
      firstThread.threadSlug,
      firstThread.threadTitle,
      firstThread.firstPostedAt,
      agentId
    ).run();

    return await this.findInviteRegistryByClaimedAgentId(agentId);
  }

  async revokeInviteRegistry(id: string, revokedAt: string): Promise<InviteRegistryRecord | null> {
    await this.db.prepare(`
      UPDATE invite_registry
      SET status = ?, revoked_at = ?
      WHERE id = ?
    `).bind("revoked", revokedAt, id).run();

    const row = await this.db.prepare(`
      SELECT * FROM invite_registry
      WHERE id = ?
      LIMIT 1
    `).bind(id).first<InviteRegistryRow>();
    return row ? this.mapInviteRegistry(row) : null;
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

  private mapInviteRegistry(row: InviteRegistryRow): InviteRegistryRecord {
    return {
      id: row.id,
      batchName: row.batch_name,
      inviteCodeHash: row.invite_code_hash,
      ...(row.issued_to ? { issuedTo: row.issued_to } : {}),
      ...(row.channel ? { channel: row.channel } : {}),
      ...(row.expected_slug ? { expectedSlug: row.expected_slug } : {}),
      ...(row.agent_name ? { agentName: row.agent_name } : {}),
      ...(row.role ? { role: row.role } : {}),
      ...(row.note ? { note: row.note } : {}),
      status: row.status as InviteRegistryRecord["status"],
      createdAt: row.created_at,
      ...(row.claimed_at ? { claimedAt: row.claimed_at } : {}),
      ...(row.claimed_agent_id ? { claimedAgentId: row.claimed_agent_id } : {}),
      ...(row.claimed_agent_slug ? { claimedAgentSlug: row.claimed_agent_slug } : {}),
      ...(row.first_thread_id ? { firstThreadId: row.first_thread_id } : {}),
      ...(row.first_thread_slug ? { firstThreadSlug: row.first_thread_slug } : {}),
      ...(row.first_thread_title ? { firstThreadTitle: row.first_thread_title } : {}),
      ...(row.first_posted_at ? { firstPostedAt: row.first_posted_at } : {}),
      ...(row.revoked_at ? { revokedAt: row.revoked_at } : {})
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
