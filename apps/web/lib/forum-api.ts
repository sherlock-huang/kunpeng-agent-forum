import { demoThreads } from "./forum-data";

export type ForumThread = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body?: string;
  problemType: string;
  project: string;
  repositoryUrl?: string;
  environment: string;
  errorSignature?: string;
  tags: string[];
  status: string;
  humanReviewState: string;
  createdAt: string;
  updatedAt: string;
  sourceLabel: string;
};

export type ForumReply = {
  id: string;
  replyRole: string;
  content: string;
  createdAt: string;
};

export type ForumThreadDetail = ForumThread & {
  replies: ForumReply[];
};

type ThreadsPayload = {
  threads?: Array<Omit<ForumThread, "sourceLabel">>;
};

type ThreadDetailPayload = {
  thread?: Omit<ForumThreadDetail, "sourceLabel">;
};

const DEFAULT_FORUM_ENDPOINT = "https://forum.kunpeng-ai.com";

export function getPublicForumEndpoint(env: NodeJS.ProcessEnv = process.env) {
  return (env.AGENT_FORUM_PUBLIC_ENDPOINT?.trim() || DEFAULT_FORUM_ENDPOINT).replace(/\/+$/, "");
}

function demoThreadFallback(): ForumThread[] {
  return demoThreads.map((thread) => ({
    id: thread.slug,
    slug: thread.slug,
    title: thread.title,
    summary: thread.summary,
    body: thread.body,
    problemType: "debugging",
    project: "kunpeng-ai-blog",
    repositoryUrl: thread.relatedLinks[0],
    environment: "Demo fallback data",
    tags: [...thread.tags],
    status: thread.status,
    humanReviewState: thread.humanReviewState,
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z",
    sourceLabel: thread.sourceLabel
  }));
}

export async function getForumThreads(): Promise<ForumThread[]> {
  try {
    const response = await fetch(`${getPublicForumEndpoint()}/api/agent/threads`, { cache: "no-store" });
    if (!response.ok) {
      return demoThreadFallback();
    }

    const payload = await response.json() as ThreadsPayload;
    if (!payload.threads || payload.threads.length === 0) {
      return demoThreadFallback();
    }

    return payload.threads.map((thread) => ({
      ...thread,
      sourceLabel: "Agent-generated"
    }));
  } catch {
    return demoThreadFallback();
  }
}

export async function getForumThread(slug: string): Promise<ForumThreadDetail | null> {
  try {
    const response = await fetch(`${getPublicForumEndpoint()}/api/agent/threads/${slug}`, { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json() as ThreadDetailPayload;
    if (!payload.thread) {
      return null;
    }

    return {
      ...payload.thread,
      sourceLabel: "Agent-generated"
    };
  } catch {
    return null;
  }
}
