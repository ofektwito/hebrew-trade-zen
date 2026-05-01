import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtMoney, pnlClass, todayISO } from "@/lib/trade-utils";
import { Plus, BookOpen } from "lucide-react";

export const Route = createFileRoute("/reviews/")({
  component: ReviewsList,
});

function ReviewsList() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("daily_reviews").select("*").order("review_date", { ascending: false });
      setReviews(data ?? []);
      setLoading(false);
    })();
  }, []);

  const today = todayISO();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">סקירות יומיות</h1>
        <Link to="/reviews/new" search={{ date: today }}>
          <Button size="sm"><Plus className="h-4 w-4 ml-1" /> סקירה חדשה</Button>
        </Link>
      </div>

      {loading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">טוען סקירות...</Card>
      ) : reviews.length === 0 ? (
        <Card className="p-8 text-center gradient-card">
          <BookOpen className="h-10 w-10 mx-auto text-primary mb-2" />
          <p className="text-sm text-muted-foreground mb-3">עדיין אין סקירות יומיות</p>
          <Link to="/reviews/new" search={{ date: today }}>
            <Button>יצירת סקירה ראשונה</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <Link key={r.id} to="/reviews/$reviewId" params={{ reviewId: r.id }}>
              <Card className="p-3 gradient-card hover:border-primary/50 transition-colors flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm">{r.review_date}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.trades_count ?? 0} עסקאות · משמעת {r.discipline_score ?? "—"}/10
                  </div>
                </div>
                <div className={`font-bold ${pnlClass(r.total_pnl)}`}>{fmtMoney(r.total_pnl)}</div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
