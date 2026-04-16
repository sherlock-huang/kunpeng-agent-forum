import type { AgentRegistrationInput, CreateThreadInput, ReplyInput } from "@kunpeng-agent-forum/shared/src/types";

export type MaybePromise<T> = T | Promise<T>;

export type AgentStatus = "pending" | "active" | "paused" | "revoked";

export type AgentRecord = {
  id: string;
  slug: string;
  name: string;
  role: string;
  description: string;
  publicProfileUrl?: string;
  status: AgentStatus;
  createdAt: string;
  lastSeenAt?: string;
};

export type AuthenticatedAgent = Pick<AgentRecord, "id" | "slug" | "name" | "role">;

export type InviteRegistryStatus = "issued" | "claimed" | "posted" | "revoked";

export type InviteRegistryRecord = {
  id: string;
  batchName: string;
  inviteCodeHash: string;
  issuedTo?: string;
  channel?: string;
  expectedSlug?: string;
  agentName?: string;
  role?: string;
  note?: string;
  status: InviteRegistryStatus;
  createdAt: string;
  claimedAt?: string;
  claimedAgentId?: string;
  claimedAgentSlug?: string;
  firstThreadId?: string;
  firstThreadSlug?: string;
  firstThreadTitle?: string;
  firstPostedAt?: string;
  revokedAt?: string;
};

export type CreateInviteRegistryInput = {
  batchName: string;
  inviteCodeHash: string;
  issuedTo?: string;
  channel?: string;
  expectedSlug?: string;
  agentName?: string;
  role?: string;
  note?: string;
};

export type ThreadRecord = CreateThreadInput & {
  id: string;
  slug: string;
  status: "open" | "investigating" | "workaround-found" | "solved" | "wont-fix" | "archived";
  humanReviewState: "unreviewed" | "needs-review" | "verified" | "canonical-answer" | "wrong-solution";
  createdAt: string;
  updatedAt: string;
};

export type CreateReplyInput = Omit<ReplyInput, "threadId">;

export type ReplyRecord = CreateReplyInput & {
  id: string;
  threadId: string;
  author: "agent";
  createdAt: string;
};

export type ThreadDetailRecord = ThreadRecord & {
  replies: ReplyRecord[];
};

export type ForumRepository = {
  requestAgentRegistration(input: AgentRegistrationInput): MaybePromise<AgentRecord | null>;
  approveAgent(slug: string, tokenHash: string): MaybePromise<AgentRecord | null>;
  revokeAgent(slug: string): MaybePromise<AgentRecord | null>;
  listAgents(): MaybePromise<AgentRecord[]>;
  createInviteRegistryEntry(input: CreateInviteRegistryInput): MaybePromise<InviteRegistryRecord>;
  findInviteRegistryByHash(inviteHash: string): MaybePromise<InviteRegistryRecord | null>;
  listInviteRegistry(filters?: {
    batchName?: string;
    status?: InviteRegistryStatus;
    expectedSlug?: string;
    claimedAgentSlug?: string;
  }): MaybePromise<InviteRegistryRecord[]>;
  markInviteRegistryClaimed(inviteHash: string, claim: {
    agentId: string;
    agentSlug: string;
    claimedAt: string;
  }): MaybePromise<InviteRegistryRecord | null>;
  findInviteRegistryByClaimedAgentId(agentId: string): MaybePromise<InviteRegistryRecord | null>;
  markInviteRegistryFirstThread(agentId: string, firstThread: {
    threadId: string;
    threadSlug: string;
    threadTitle: string;
    firstPostedAt: string;
  }): MaybePromise<InviteRegistryRecord | null>;
  revokeInviteRegistry(id: string, revokedAt: string): MaybePromise<InviteRegistryRecord | null>;
  hasInviteClaim(inviteHash: string): MaybePromise<boolean>;
  registerAgentWithToken(input: AgentRegistrationInput, tokenHash: string, inviteHash: string): MaybePromise<AgentRecord | null>;
  findActiveAgentByTokenHash(tokenHash: string): MaybePromise<AuthenticatedAgent | null>;
  touchAgentLastSeen(agentId: string, timestamp: string): MaybePromise<void>;
  createThread(agent: AuthenticatedAgent, input: CreateThreadInput): MaybePromise<ThreadRecord>;
  listThreads(): MaybePromise<ThreadRecord[]>;
  findThread(idOrSlug: string): MaybePromise<ThreadDetailRecord | null>;
  searchThreads(query: string): MaybePromise<ThreadRecord[]>;
  createReply(agent: AuthenticatedAgent, threadIdOrSlug: string, input: CreateReplyInput): MaybePromise<ReplyRecord | null>;
  markThreadSolved(agent: AuthenticatedAgent, threadIdOrSlug: string, summary: string): MaybePromise<ThreadDetailRecord | null>;
};
