export type ProjectXOrder = Record<string, unknown>;
export type ProjectXFill = Record<string, unknown>;

export type ProjectXClientConfig = {
  baseUrl: string;
  username: string;
  apiKey: string;
};

const ADAPTER_TODO =
  "ProjectX adapter requires endpoint configuration. Provide the ProjectX auth, orders, fills, trades, and account endpoint docs or sample responses.";

export function readProjectXConfig(): ProjectXClientConfig {
  const baseUrl = Deno.env.get("PROJECTX_BASE_URL");
  const username = Deno.env.get("PROJECTX_USERNAME");
  const apiKey = Deno.env.get("PROJECTX_API_KEY");

  if (!baseUrl || !username || !apiKey) {
    throw new Error("Missing PROJECTX_BASE_URL, PROJECTX_USERNAME, or PROJECTX_API_KEY.");
  }

  return { baseUrl, username, apiKey };
}

export function readProjectXAccountIds() {
  return (Deno.env.get("PROJECTX_ACCOUNT_IDS") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function assertSyncSecret(req: Request) {
  const expected = Deno.env.get("PROJECTX_SYNC_SECRET");
  const actual = req.headers.get("x-projectx-sync-secret");

  if (!expected) {
    throw new Error("Missing PROJECTX_SYNC_SECRET.");
  }

  if (actual !== expected) {
    const error = new Error("Unauthorized ProjectX sync request.");
    error.name = "Unauthorized";
    throw error;
  }
}

export class ProjectXClient {
  private token: string | null = null;

  constructor(private readonly config: ProjectXClientConfig) {}

  async authenticate() {
    await Promise.resolve();
    throw new Error(ADAPTER_TODO);
  }

  async fetchOrders(_params: {
    accountId: string;
    rangeStart: string;
    rangeEnd: string;
  }): Promise<ProjectXOrder[]> {
    if (!this.token) {
      await this.authenticate();
    }
    throw new Error(ADAPTER_TODO);
  }

  async fetchFills(_params: {
    accountId: string;
    rangeStart: string;
    rangeEnd: string;
  }): Promise<ProjectXFill[]> {
    if (!this.token) {
      await this.authenticate();
    }
    throw new Error(ADAPTER_TODO);
  }

  async healthCheck() {
    await this.authenticate();
    return { ok: true };
  }
}

export const projectXAdapterTodoMessage = ADAPTER_TODO;

