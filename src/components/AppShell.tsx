import { Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  LogOut,
  RefreshCw,
  WalletCards,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { AccountSelector } from "@/components/AccountScope";
import { supabase } from "@/integrations/supabase/client";

const tabs = [
  { to: "/", label: "יומן", icon: LayoutDashboard },
  { to: "/calendar", label: "לוח שנה", icon: CalendarDays },
  { to: "/trades", label: "עסקאות", icon: ListChecks },
  { to: "/reviews", label: "סקירות", icon: BookOpen },
  { to: "/analytics", label: "ניתוח", icon: BarChart3 },
] as const;

type SyncStatusRow = {
  status: string;
  last_success_at: string | null;
  updated_at: string | null;
  message: string | null;
};

type RefreshNowResponse = {
  ok?: boolean;
  status?: string;
  message?: string;
};

export function AppShell() {
  const { location } = useRouterState();
  const path = location.pathname;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="shrink-0 text-lg font-bold tracking-tight">
            <span className="text-primary">יומן</span>
            <span className="text-foreground"> מסחר</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <AccountSelector />
            <SyncStatusIndicator />
            <Link
              to="/accounts"
              title="חשבונות"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-input/30 text-muted-foreground transition-colors hover:text-foreground"
            >
              <WalletCards className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              title="התנתק"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-input/30 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
            <span className="hidden text-xs text-muted-foreground sm:inline">Futures · מסחר אישי</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "scale-110" : ""} transition-transform`} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SyncStatusIndicator() {
  const [syncStatus, setSyncStatus] = useState<SyncStatusRow | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const router = useRouter();

  const loadSyncStatus = useCallback(async () => {
    const { data } = await supabase
      .from("sync_status")
      .select("status, last_success_at, updated_at, message")
      .eq("id", "projectx")
      .maybeSingle();

    setSyncStatus(data ?? null);
    return data ?? null;
  }, []);

  useEffect(() => {
    void loadSyncStatus();
    const interval = window.setInterval(loadSyncStatus, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadSyncStatus]);

  const handleRefreshNow = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setSyncStatus((current) => current ? { ...current, status: "syncing", message: "מרענן..." } : current);

    const { data, error } = await supabase.functions.invoke<RefreshNowResponse>("refresh-now", {
      method: "POST",
    });

    await loadSyncStatus();
    setIsRefreshing(false);

    if (error || data?.ok === false) {
      toast.error(await refreshErrorMessage(error, data));
      return;
    }

    await router.invalidate();
    toast.success("הנתונים עודכנו");
  };

  const presentation = useMemo(() => getSyncPresentation(syncStatus), [syncStatus]);
  const Icon = presentation.icon;
  const refreshLabel = isRefreshing ? "מרענן..." : "רענן עכשיו";

  return (
    <div className="flex items-center gap-1">
      <span
        title={syncStatus?.message ?? "סטטוס סנכרון ProjectX"}
        className={`inline-flex max-w-[150px] items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${presentation.className}`}
      >
        <Icon className={`h-3.5 w-3.5 ${syncStatus?.status === "syncing" ? "animate-spin" : ""}`} />
        <span className="truncate">{presentation.label}</span>
      </span>
      <button
        type="button"
        title="רענן נתוני ProjectX עכשיו"
        disabled={isRefreshing}
        onClick={handleRefreshNow}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-input/30 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">{refreshLabel}</span>
      </button>
    </div>
  );
}

async function refreshErrorMessage(error: unknown, data: RefreshNowResponse | null | undefined) {
  if (data?.status === "rate_limited") return "אפשר לרענן שוב בעוד דקה";
  if (data?.message) return data.message;

  const context = (error as { context?: { json?: () => Promise<RefreshNowResponse> } } | null)?.context;
  const payload = await context?.json?.().catch(() => null);
  if (payload?.status === "rate_limited") return "אפשר לרענן שוב בעוד דקה";
  if (payload?.message) return payload.message;

  return "הרענון נכשל";
}

function getSyncPresentation(syncStatus: SyncStatusRow | null) {
  if (!syncStatus) {
    return {
      label: "בעיית חיבור",
      icon: WifiOff,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  }

  if (syncStatus.status === "syncing") {
    return {
      label: "מסנכרן...",
      icon: RefreshCw,
      className: "border-primary/30 bg-primary/10 text-primary",
    };
  }

  if (syncStatus.status === "error") {
    return {
      label: "בעיית חיבור",
      icon: WifiOff,
      className: "border-destructive/30 bg-destructive/10 text-destructive",
    };
  }

  const minutes = minutesSince(syncStatus.last_success_at ?? syncStatus.updated_at);
  return {
    label: minutes <= 1 ? "עודכן עכשיו" : `עודכן לפני ${minutes} דקות`,
    icon: RefreshCw,
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  };
}

function minutesSince(value: string | null) {
  if (!value) return 999;
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff) || diff < 0) return 0;
  return Math.max(1, Math.round(diff / 60_000));
}
