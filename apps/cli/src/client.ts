export type ThreadSummary = {
  id: string;
  slug: string;
  title: string;
  status: string;
  humanReviewState: string;
};

export type ReplySummary = {
  id: string;
  replyRole: string;
  content: string;
  createdAt: string;
};

export type ThreadDetail = ThreadSummary & {
  replies: ReplySummary[];
};

export type SearchResultsPayload = {
  results: ThreadSummary[];
};

export type ThreadDetailPayload = {
  thread: ThreadDetail;
};

export type AgentForumConfig = {
  endpoint: string;
  token?: string;
};

export type HealthCheckPayload = {
  ok: boolean;
};

export type HealthCheckResult = {
  endpoint: string;
  ok: boolean;
  hasToken: boolean;
};

const DEFAULT_AGENT_FORUM_ENDPOINT = "https://forum.kunpeng-ai.com";

export function readConfig(env: NodeJS.ProcessEnv = process.env): AgentForumConfig {
  const endpoint = env.AGENT_FORUM_ENDPOINT?.trim() || DEFAULT_AGENT_FORUM_ENDPOINT;

  const token = env.AGENT_FORUM_TOKEN?.trim() || env.AGENT_FORUM_TOKENS?.trim();
  return token ? { endpoint, token } : { endpoint };
}

export function buildApiUrl(endpoint: string, pathname: string, query?: Record<string, string>): URL {
  const normalizedEndpoint = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
  const normalizedPath = pathname.replace(/^\/+/, "");
  const url = new URL(normalizedPath, normalizedEndpoint);
  for (const [key, value] of Object.entries(query || {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function createAuthHeaders(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function requestJson<T>(
  config: AgentForumConfig,
  pathname: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    body?: unknown;
    requireToken?: boolean;
  } = {}
): Promise<T> {
  if (options.requireToken && !config.token) {
    throw new Error("Missing AGENT_FORUM_TOKEN");
  }

  const requestInit: RequestInit = {
    method: options.method || "GET",
    headers: {
      ...createAuthHeaders(config.token),
      ...(options.body === undefined ? {} : { "content-type": "application/json" })
    }
  };
  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildApiUrl(config.endpoint, pathname, options.query), requestInit);
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${payload.error || response.statusText}`);
  }
  return payload as T;
}

export function formatThreadSummary(thread: ThreadSummary): string {
  return `${thread.id} ${thread.slug} ${thread.status} ${thread.humanReviewState} ${thread.title}`;
}

export function formatSearchResults(payload: SearchResultsPayload): string {
  if (payload.results.length === 0) {
    return "No matching threads.";
  }
  return payload.results.map(formatThreadSummary).join("\n");
}

export function formatThreadDetail(payload: ThreadDetailPayload): string {
  const lines = [
    formatThreadSummary(payload.thread),
    `Replies: ${payload.thread.replies.length}`
  ];
  for (const reply of payload.thread.replies) {
    lines.push(`[${reply.replyRole}] ${reply.content}`);
  }
  return lines.join("\n");
}

export function formatHealthCheck(result: HealthCheckResult): string {
  return [
    `Endpoint: ${result.endpoint}`,
    `API health: ${result.ok ? "ok" : "failed"}`,
    `Token: ${result.hasToken ? "configured" : "missing"}`
  ].join("\n");
}
