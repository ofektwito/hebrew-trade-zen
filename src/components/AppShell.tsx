import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, PlusCircle, BookOpen, BarChart3, Upload } from "lucide-react";

const tabs = [
  { to: "/", label: "יומן", icon: LayoutDashboard },
  { to: "/trades/new", label: "עסקה", icon: PlusCircle },
  { to: "/reviews", label: "סקירה", icon: BookOpen },
  { to: "/analytics", label: "ניתוח", icon: BarChart3 },
  { to: "/import", label: "ייבוא", icon: Upload },
] as const;

export function AppShell() {
  const { location } = useRouterState();
  const path = location.pathname;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="font-bold tracking-tight text-lg">
            <span className="text-primary">יומן</span>
            <span className="text-foreground"> מסחר</span>
          </Link>
          <span className="text-xs text-muted-foreground">Futures · מסחר אישי</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-50 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-2xl grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
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
