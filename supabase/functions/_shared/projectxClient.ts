export type ProjectXAccount = {
  id: number;
  name: string;
  balance?: number | null;
  realizedPnl?: number | null;
  realizedPnL?: number | null;
  realizedProfitAndLoss?: number | null;
  unrealizedPnl?: number | null;
  unrealizedPnL?: number | null;
  unrealizedProfitAndLoss?: number | null;
  canTrade?: boolean;
  isVisible?: boolean;
  status?: string | null;
  accountType?: string | null;
};

export type ProjectXOrder = Record<string, unknown>;
export type ProjectXFill = Record<string, unknown>;

export type ProjectXClientConfig = {
  baseUrl: string;
  username: string;
  apiKey: string;
};

export function readProjectXConfig(): ProjectXClientConfig {
  const baseUrl = Deno.env.get("PROJECTX_BASE_URL");
  const username = Deno.env.get("TSX_USERNAME") ?? Deno.env.get("PROJECTX_USERNAME");
  const apiKey = Deno.env.get("TSX_API_KEY") ?? Deno.env.get("PROJECTX_API_KEY");

  if (!baseUrl || !username || !apiKey) {
    throw new Error("ProjectX עדיין לא הוגדר");
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), username, apiKey };
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
    const response = await this.post<{ token?: string }>("/api/Auth/loginKey", {
      userName: this.config.username,
      apiKey: this.config.apiKey,
    }, false);

    if (!response.token) {
      throw new Error("ProjectX authentication did not return a session token.");
    }

    this.token = response.token;
    return response.token;
  }

  async fetchAccounts(onlyActiveAccounts = true): Promise<ProjectXAccount[]> {
    const response = await this.post<{ accounts?: ProjectXAccount[] }>("/api/Account/search", {
      onlyActiveAccounts,
    });

    return response.accounts ?? [];
  }

  async fetchOrders(params: {
    accountId: string;
    rangeStart: string;
    rangeEnd: string;
  }): Promise<ProjectXOrder[]> {
    const response = await this.post<{ orders?: ProjectXOrder[] }>("/api/Order/search", {
      accountId: Number(params.accountId),
      startTimestamp: params.rangeStart,
      endTimestamp: params.rangeEnd,
    });

    return response.orders ?? [];
  }

  async fetchFills(params: {
    accountId: string;
    rangeStart: string;
    rangeEnd: string;
  }): Promise<ProjectXFill[]> {
    const response = await this.post<{ trades?: ProjectXFill[] }>("/api/Trade/search", {
      accountId: Number(params.accountId),
      startTimestamp: params.rangeStart,
      endTimestamp: params.rangeEnd,
    });

    return response.trades ?? [];
  }

  async healthCheck() {
    await this.authenticate();
    const accounts = await this.fetchAccounts();
    return { ok: true, accountsCount: accounts.length };
  }

  private async post<T extends Record<string, unknown>>(
    path: string,
    body: Record<string, unknown>,
    requireAuth = true,
  ): Promise<T> {
    if (requireAuth && !this.token) {
      await this.authenticate();
    }

    const headers: HeadersInit = {
      accept: "text/plain",
      "Content-Type": "application/json",
    };

    if (requireAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`ProjectX request failed: ${path} returned ${response.status}`);
    }

    const payload = (await response.json()) as T & {
      success?: boolean;
      errorCode?: number;
      errorMessage?: string | null;
    };

    if (payload.success === false) {
      throw new Error(payload.errorMessage ?? `ProjectX request failed: ${path}`);
    }

    return payload;
  }
}
