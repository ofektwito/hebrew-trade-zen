import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthState = "loading" | "ready" | "signed-out" | "blocked";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<AuthState>("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        await claimOwnership();
      } else {
        setState("signed-out");
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        window.setTimeout(() => void claimOwnership(), 0);
      } else {
        setState("signed-out");
      }
    });

    void init();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function claimOwnership() {
    setState("loading");
    const { error } = await supabase.rpc("claim_personal_journal");
    if (error) {
      setMessage(error.message);
      setState("blocked");
      return;
    }
    setMessage(null);
    setState("ready");
  }

  if (state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground" dir="rtl">
        <Card className="gradient-card w-full max-w-sm p-6 text-center text-sm text-muted-foreground">
          מאמת גישה ליומן...
        </Card>
      </div>
    );
  }

  if (!session || state === "signed-out") {
    return <LoginScreen />;
  }

  if (state === "blocked") {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground" dir="rtl">
        <Card className="gradient-card w-full max-w-sm space-y-4 p-6 text-center">
          <LockKeyhole className="mx-auto h-8 w-8 text-destructive" />
          <h1 className="text-lg font-bold">אין הרשאה ליומן הזה</h1>
          <p className="text-sm text-muted-foreground">
            היומן כבר משויך למשתמש אחר. {message ? `(${message})` : ""}
          </p>
          <Button type="button" variant="outline" onClick={() => supabase.auth.signOut()}>
            התנתק
          </Button>
        </Card>
      </div>
    );
  }

  return children;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setLoading(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signup" && !result.data.session) {
      setMessage("נשלח מייל אישור. אחרי האישור אפשר להתחבר.");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 text-foreground" dir="rtl">
      <Card className="gradient-card w-full max-w-sm space-y-5 p-6 shadow-card">
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold">יומן מסחר פרטי</h1>
          <p className="mt-1 text-sm text-muted-foreground">התחברות נדרשת כדי לצפות בנתוני המסחר.</p>
        </div>

        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>אימייל</Label>
            <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>סיסמה</Label>
            <Input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          {message && <p className="rounded-md border border-border bg-input/30 p-2 text-xs text-muted-foreground">{message}</p>}
          <Button type="submit" className="h-11 w-full" disabled={loading}>
            {loading ? "בודק..." : mode === "login" ? "התחבר" : "צור משתמש ראשון"}
          </Button>
        </form>

        <button
          type="button"
          className="w-full text-center text-xs font-semibold text-primary"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "משתמש ראשון? צור חשבון" : "כבר יש חשבון? התחבר"}
        </button>
      </Card>
    </div>
  );
}
