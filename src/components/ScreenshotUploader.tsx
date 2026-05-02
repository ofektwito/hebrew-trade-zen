import { useEffect, useMemo, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export type ScreenshotSlotDef = {
  key: string;
  label: string;
};

type ScreenshotStatus = "idle" | "selected" | "uploading" | "saved" | "error" | "deleting";

type ScreenshotUploaderProps = {
  title: string;
  description: string;
  owner: { tradeId: string; reviewId?: never } | { reviewId: string; tradeId?: never };
  context: "trade" | "daily_review";
  slots: readonly ScreenshotSlotDef[];
  onChanged?: () => void;
};

type ScreenshotRow = {
  id: string;
  trade_id: string | null;
  review_id: string | null;
  kind: string;
  screenshot_type: string | null;
  screenshot_context: string | null;
  storage_path: string | null;
  public_url: string | null;
  url: string;
};

export function ScreenshotUploader({ title, description, owner, context, slots, onChanged }: ScreenshotUploaderProps) {
  const [screenshots, setScreenshots] = useState<ScreenshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [slotStatus, setSlotStatus] = useState<Record<string, ScreenshotStatus>>(() =>
    Object.fromEntries(slots.map((slot) => [slot.key, "idle"])),
  );

  useEffect(() => {
    void loadScreenshots();
  }, [owner.tradeId, owner.reviewId]);

  const screenshotsByType = useMemo(() => groupScreenshots(screenshots), [screenshots]);

  async function loadScreenshots() {
    setLoading(true);
    const query = supabase
      .from("screenshots")
      .select("*")
      .order("created_at", { ascending: true });

    const { data, error } = owner.tradeId
      ? await query.eq("trade_id", owner.tradeId)
      : await query.eq("review_id", owner.reviewId);

    if (error) {
      toast.error(error.message);
      setScreenshots([]);
    } else {
      setScreenshots((data ?? []) as ScreenshotRow[]);
    }
    setLoading(false);
  }

  async function uploadScreenshot(type: string, file?: File) {
    if (!file) return;

    setSlotStatus((current) => ({ ...current, [type]: "selected" }));
    window.setTimeout(() => {
      setSlotStatus((current) => (current[type] === "selected" ? { ...current, [type]: "uploading" } : current));
    }, 120);

    const ownerId = owner.tradeId ?? owner.reviewId;
    const ownerPrefix = owner.tradeId ? "trades" : "reviews";
    const safeName = file.name.replace(/[^\w.-]/g, "_");
    const path = `${ownerPrefix}/${ownerId}/${type}-${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from("screenshots").upload(path, file);
    if (uploadError) {
      setSlotStatus((current) => ({ ...current, [type]: "error" }));
      toast.error(`שגיאה בהעלאת צילום: ${uploadError.message}`);
      return;
    }

    const { data: publicData } = supabase.storage.from("screenshots").getPublicUrl(path);
    const publicUrl = publicData.publicUrl;
    const insertPayload = {
      trade_id: owner.tradeId ?? null,
      review_id: owner.reviewId ?? null,
      kind: type,
      screenshot_type: type,
      screenshot_context: context,
      storage_path: path,
      url: publicUrl,
      public_url: publicUrl,
      uploaded_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("screenshots").insert(insertPayload as any);
    if (insertError) {
      await supabase.storage.from("screenshots").remove([path]);
      setSlotStatus((current) => ({ ...current, [type]: "error" }));
      toast.error(insertError.message);
      return;
    }

    setSlotStatus((current) => ({ ...current, [type]: "saved" }));
    toast.success("צילום המסך נשמר");
    await loadScreenshots();
    onChanged?.();
  }

  async function removeScreenshot(screenshot: ScreenshotRow) {
    const type = normalizeType(screenshot.screenshot_type ?? screenshot.kind);
    setSlotStatus((current) => ({ ...current, [type]: "deleting" }));

    if (screenshot.storage_path) {
      const { error: removeError } = await supabase.storage.from("screenshots").remove([screenshot.storage_path]);
      if (removeError) {
        setSlotStatus((current) => ({ ...current, [type]: "error" }));
        toast.error(`שגיאה במחיקת צילום: ${removeError.message}`);
        return;
      }
    }

    const { error } = await supabase.from("screenshots").delete().eq("id", screenshot.id);
    if (error) {
      setSlotStatus((current) => ({ ...current, [type]: "error" }));
      toast.error(error.message);
      return;
    }

    setSlotStatus((current) => ({ ...current, [type]: "idle" }));
    toast.success("צילום המסך הוסר");
    await loadScreenshots();
    onChanged?.();
  }

  return (
    <Card className="gradient-card space-y-3 p-4">
      <div>
        <h3 className="text-sm font-bold text-primary">{title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-dashed border-border bg-input/20 p-4 text-center text-xs text-muted-foreground">
          טוען צילומים...
        </div>
      ) : (
        <div className="space-y-4">
          {slots.map((slot) => (
            <ScreenshotSlot
              key={slot.key}
              label={slot.label}
              type={slot.key}
              screenshots={screenshotsByType[slot.key] ?? []}
              status={slotStatus[slot.key] ?? "idle"}
              onUpload={uploadScreenshot}
              onRemove={removeScreenshot}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ScreenshotSlot({
  label,
  type,
  screenshots,
  status,
  onUpload,
  onRemove,
}: {
  label: string;
  type: string;
  screenshots: ScreenshotRow[];
  status: ScreenshotStatus;
  onUpload: (type: string, file?: File) => void;
  onRemove: (screenshot: ScreenshotRow) => void;
}) {
  const busy = status === "uploading" || status === "deleting";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{label}</Label>
          <ScreenshotStatusBadge status={status} />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-input/40 px-2 py-1 text-[11px] text-foreground hover:border-primary/60">
          <ImagePlus className="h-3.5 w-3.5" />
          {status === "uploading" ? "מעלה..." : "הוסף"}
          <Input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              onUpload(type, event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      {screenshots.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-input/20 p-4 text-center text-xs text-muted-foreground">
          אין צילום {label}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {screenshots.map((screenshot) => {
            const src = screenshot.public_url ?? screenshot.url;
            return (
              <div key={screenshot.id} className="overflow-hidden rounded-lg border border-border bg-background/40">
                <a href={src} target="_blank" rel="noreferrer">
                  <img src={src} alt={label} className="max-h-72 w-full object-contain" />
                </a>
                <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
                  <span className="text-[11px] text-profit">נשמר ב-Supabase</span>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(screenshot)}>
                    <X className="ml-1 h-3.5 w-3.5" />
                    {status === "deleting" ? "מסיר..." : "הסר"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScreenshotStatusBadge({ status }: { status: ScreenshotStatus }) {
  if (status === "selected") {
    return <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">נבחר</span>;
  }
  if (status === "uploading") {
    return <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">מעלה...</span>;
  }
  if (status === "saved") {
    return <span className="rounded-full bg-profit/10 px-2 py-0.5 text-[10px] font-semibold text-profit">נשמר</span>;
  }
  if (status === "error") {
    return <span className="rounded-full bg-loss/10 px-2 py-0.5 text-[10px] font-semibold text-loss">שגיאה בהעלאה</span>;
  }
  if (status === "deleting") {
    return <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">מסיר...</span>;
  }
  return null;
}

function groupScreenshots(screenshots: ScreenshotRow[]) {
  return screenshots.reduce<Record<string, ScreenshotRow[]>>((groups, screenshot) => {
    const normalized = normalizeType(screenshot.screenshot_type ?? screenshot.kind);
    groups[normalized] = [...(groups[normalized] ?? []), screenshot];
    return groups;
  }, {});
}

function normalizeType(type: string | null | undefined) {
  if (type === "post") return "post_trade";
  return type ?? "other";
}
