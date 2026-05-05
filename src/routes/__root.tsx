import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { AuthGate } from "@/components/AuthGate";
import { AccountScopeProvider } from "@/components/AccountScope";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">העמוד לא נמצא</h2>
        <p className="mt-2 text-sm text-muted-foreground">הקישור שפתחת לא קיים או הוסר.</p>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          חזרה ליומן
        </Link>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { name: "theme-color", content: "#1a1d24" },
      { title: "יומן מסחר Futures" },
      { name: "description", content: "יומן מסחר אישי ל-Futures: תיעוד עסקאות, סקירה יומית והעתקה ל-ChatGPT." },
      { property: "og:title", content: "יומן מסחר Futures" },
      { name: "twitter:title", content: "יומן מסחר Futures" },
      { property: "og:description", content: "יומן מסחר אישי ל-Futures: תיעוד עסקאות, סקירה יומית והעתקה ל-ChatGPT." },
      { name: "twitter:description", content: "יומן מסחר אישי ל-Futures: תיעוד עסקאות, סקירה יומית והעתקה ל-ChatGPT." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/09a7800f-1775-4f5f-ad65-2b976d039a78/id-preview-aa94c76f--29622380-72b1-48ca-a5cc-513f8c5eed91.lovable.app-1777650381425.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/09a7800f-1775-4f5f-ad65-2b976d039a78/id-preview-aa94c76f--29622380-72b1-48ca-a5cc-513f8c5eed91.lovable.app-1777650381425.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <>
      <AuthGate>
        <AccountScopeProvider>
          <AppShell />
        </AccountScopeProvider>
      </AuthGate>
      <Toaster richColors position="top-center" dir="rtl" />
    </>
  );
}
