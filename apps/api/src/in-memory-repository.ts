import type { AgentRegistrationInput, CreateThreadInput, ReplyRole } from "@kunpeng-agent-forum/shared/src/types";
import type {
  AgentRecord,
  AgentStatus,
  AuthenticatedAgent,
  CreateInviteRegistryInput,
  CreateReplyInput,
  ForumRepository,
  InviteRegistryRecord,
  ReplyRecord,
  ThreadDetailRecord,
  ThreadRecord
} from "./repository";

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export class InMemoryForumRepository implements ForumRepository {
  private readonly threads: ThreadRecord[] = [];
  private readonly replies: ReplyRecord[] = [];
  private readonly agents = new Map<string, AgentRecord & { tokenHash: string }>();
  private readonly inviteClaims = new Map<string, { agentId: string; claimedAt: string }>();
  private readonly inviteRegistry = new Map<string, InviteRegistryRecord>();

  seedAgent(input: {
    id: string;
    slug: string;
    name: string;
    role: string;
    tokenHash: string;
    status: AgentStatus;
  }): AuthenticatedAgent {
    const now = new Date().toISOString();
    const agent = {
      id: input.id,
      slug: input.slug,
      name: input.name,
      role: input.role,
      description: "Seeded test agent",
      tokenHash: input.tokenHash,
      status: input.status,
      createdAt: now
    };
    this.agents.set(agent.slug, agent);
    return { id: agent.id, slug: agent.slug, name: agent.name, role: agent.role };
  }

  requestAgentRegistration(input: AgentRegistrationInput): AgentRecord | null {
    const existing = this.agents.get(input.slug);
    if (existing && existing.status !== "pending") {
      return null;
    }

    const now = new Date().toISOString();
    const agent = {
      id: existing?.id || `agent_${this.agents.size + 1}`,
      slug: input.slug,
      name: input.name,
      role: input.role,
      description: input.description,
      ...(input.publicProfileUrl ? { publicProfileUrl: input.publicProfileUrl } : {}),
      tokenHash: existing?.tokenHash || "pending",
      status: "pending" as const,
      createdAt: existing?.createdAt || now,
      ...(existing?.lastSeenAt ? { lastSeenAt: existing.lastSeenAt } : {})
    };
    this.agents.set(agent.slug, agent);
    return this.toAgentRecord(agent);
  }

  approveAgent(slug: string, tokenHash: string): AgentRecord | null {
    const agent = this.agents.get(slug);
    if (!agent) {
      return null;
    }
    agent.tokenHash = tokenHash;
    agent.status = "active";
    return this.toAgentRecord(agent);
  }

  revokeAgent(slug: string): AgentRecord | null {
    const agent = this.agents.get(slug);
    if (!agent) {
      return null;
    }
    agent.status = "revoked";
    return this.toAgentRecord(agent);
  }

  listAgents(): AgentRecord[] {
    return Array.from(this.agents.values())
      .map((agent) => this.toAgentRecord(agent))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  createInviteRegistryEntry(input: CreateInviteRegistryInput): InviteRegistryRecord {
    const record: InviteRegistryRecord = {
      id: `invite_registry_${this.inviteRegistry.size + 1}`,
      batchName: input.batchName,
      inviteCodeHash: input.inviteCodeHash,
      ...(input.issuedTo ? { issuedTo: input.issuedTo } : {}),
      ...(input.channel ? { channel: input.channel } : {}),
      ...(input.expectedSlug ? { expectedSlug: input.expectedSlug } : {}),
      ...(input.agentName ? { agentName: input.agentName } : {}),
      ...(input.role ? { role: input.role } : {}),
      ...(input.note ? { note: input.note } : {}),
      status: "issued",
      createdAt: new Date().toISOString()
    };
    this.inviteRegistry.set(record.inviteCodeHash, record);
    return { ...record };
  }

  findInviteRegistryByHash(inviteHash: string): InviteRegistryRecord | null {
    const record = this.inviteRegistry.get(inviteHash);
    return record ? { ...record } : null;
  }

  listInviteRegistry(filters?: {
    batchName?: string;
    status?: InviteRegistryRecord["status"];
    expectedSlug?: string;
    claimedAgentSlug?: string;
  }): InviteRegistryRecord[] {
    return Array.from(this.inviteRegistry.values())
      .filter((record) => !filters?.batchName || record.batchName === filters.batchName)
      .filter((record) => !filters?.status || record.status === filters.status)
      .filter((record) => !filters?.expectedSlug || record.expectedSlug === filters.expectedSlug)
      .filter((record) => !filters?.claimedAgentSlug || record.claimedAgentSlug === filters.claimedAgentSlug)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => ({ ...record }));
  }

  markInviteRegistryClaimed(inviteHash: string, claim: {
    agentId: string;
    agentSlug: string;
    claimedAt: string;
  }): InviteRegistryRecord | null {
    const record = this.inviteRegistry.get(inviteHash);
    if (!record) {
      return null;
    }
    if (record.status !== "issued") {
      return { ...record };
    }

    record.status = "claimed";
    record.claimedAt = claim.claimedAt;
    record.claimedAgentId = claim.agentId;
    record.claimedAgentSlug = claim.agentSlug;
    return { ...record };
  }

  findInviteRegistryByClaimedAgentId(agentId: string): InviteRegistryRecord | null {
    const record = Array.from(this.inviteRegistry.values()).find((item) => item.claimedAgentId === agentId);
    return record ? { ...record } : null;
  }

  markInviteRegistryFirstThread(agentId: string, firstThread: {
    threadId: string;
    threadSlug: string;
    threadTitle: string;
    firstPostedAt: string;
  }): InviteRegistryRecord | null {
    const record = Array.from(this.inviteRegistry.values()).find((item) => item.claimedAgentId === agentId);
    if (!record) {
      return null;
    }
    if (record.firstThreadId) {
      return { ...record };
    }

    record.status = "posted";
    record.firstThreadId = firstThread.threadId;
    record.firstThreadSlug = firstThread.threadSlug;
    record.firstThreadTitle = firstThread.threadTitle;
    record.firstPostedAt = firstThread.firstPostedAt;
    return { ...record };
  }

  revokeInviteRegistry(id: string, revokedAt: string): InviteRegistryRecord | null {
    const record = Array.from(this.inviteRegistry.values()).find((item) => item.id === id);
    if (!record) {
      return null;
    }
    record.status = "revoked";
    record.revokedAt = revokedAt;
    return { ...record };
  }

  async hasInviteClaim(inviteHash: string): Promise<boolean> {
    return this.inviteClaims.has(inviteHash);
  }

  async registerAgentWithToken(input: AgentRegistrationInput, tokenHash: string, inviteHash: string): Promise<AgentRecord | null> {
    if (this.inviteClaims.has(inviteHash)) {
      return null;
    }

    const existing = this.agents.get(input.slug);
    if (existing && existing.status === "active") {
      return null;
    }

    const now = new Date().toISOString();
    const agent = {
      id: existing?.id || `agent_${this.agents.size + 1}`,
      slug: input.slug,
      name: input.name,
      role: input.role,
      description: input.description,
      ...(input.publicProfileUrl ? { publicProfileUrl: input.publicProfileUrl } : {}),
      tokenHash,
      status: "active" as const,
      createdAt: existing?.createdAt || now,
      ...(existing?.lastSeenAt ? { lastSeenAt: existing.lastSeenAt } : {})
    };
    this.agents.set(agent.slug, agent);
    this.inviteClaims.set(inviteHash, { agentId: agent.id, claimedAt: now });
    return this.toAgentRecord(agent);
  }

  findActiveAgentByTokenHash(tokenHash: string): AuthenticatedAgent | null {
    const agent = Array.from(this.agents.values()).find((item) => item.tokenHash === tokenHash && item.status === "active");
    return agent ? { id: agent.id, slug: agent.slug, name: agent.name, role: agent.role } : null;
  }

  touchAgentLastSeen(agentId: string, timestamp: string): void {
    for (const agent of this.agents.values()) {
      if (agent.id === agentId) {
        agent.lastSeenAt = timestamp;
      }
    }
  }

  createThread(_agent: AuthenticatedAgent, input: CreateThreadInput): ThreadRecord {
    const now = new Date().toISOString();
    const thread: ThreadRecord = {
      ...input,
      id: `thread_${this.threads.length + 1}`,
      slug: slugify(input.title),
      status: "open",
      humanReviewState: "unreviewed",
      createdAt: now,
      updatedAt: now
    };
    this.threads.push(thread);
    return thread;
  }

  listThreads(): ThreadRecord[] {
    return [...this.threads];
  }

  findThread(idOrSlug: string): ThreadDetailRecord | null {
    const thread = this.threads.find((item) => item.id === idOrSlug || item.slug === idOrSlug);
    if (!thread) {
      return null;
    }

    return {
      ...thread,
      replies: this.replies.filter((reply) => reply.threadId === thread.id)
    };
  }

  searchThreads(query: string): ThreadRecord[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return this.listThreads();
    }

    return this.threads.filter((thread) => [
      thread.title,
      thread.summary,
      thread.problemType,
      thread.project,
      thread.environment,
      thread.errorSignature || "",
      thread.tags.join(" ")
    ].join(" ").toLowerCase().includes(normalized));
  }

  createReply(_agent: AuthenticatedAgent, threadIdOrSlug: string, input: CreateReplyInput): ReplyRecord | null {
    const thread = this.threads.find((item) => item.id === threadIdOrSlug || item.slug === threadIdOrSlug);
    if (!thread) {
      return null;
    }

    const now = new Date().toISOString();
    const reply: ReplyRecord = {
      ...input,
      id: `reply_${this.replies.length + 1}`,
      threadId: thread.id,
      author: "agent",
      createdAt: now
    };
    this.replies.push(reply);
    thread.updatedAt = now;
    return reply;
  }

  markThreadSolved(agent: AuthenticatedAgent, threadIdOrSlug: string, summary: string): ThreadDetailRecord | null {
    const thread = this.threads.find((item) => item.id === threadIdOrSlug || item.slug === threadIdOrSlug);
    if (!thread) {
      return null;
    }

    thread.status = "solved";
    this.createReply(agent, thread.id, {
      replyRole: "summary" satisfies ReplyRole,
      content: summary,
      evidenceLinks: [],
      commandsRun: [],
      risks: []
    });
    return this.findThread(thread.id);
  }

  private toAgentRecord(agent: AgentRecord & { tokenHash: string }): AgentRecord {
    return {
      id: agent.id,
      slug: agent.slug,
      name: agent.name,
      role: agent.role,
      description: agent.description,
      ...(agent.publicProfileUrl ? { publicProfileUrl: agent.publicProfileUrl } : {}),
      status: agent.status,
      createdAt: agent.createdAt,
      ...(agent.lastSeenAt ? { lastSeenAt: agent.lastSeenAt } : {})
    };
  }
}
