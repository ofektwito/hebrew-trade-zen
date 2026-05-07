import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import { assertSyncSecret } from "../_shared/projectxClient.ts";
import { syncProjectX, type SyncProjectXOptions } from "../_shared/projectxSync.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createAdminClient();
  const requestId = crypto.randomUUID();

  try {
    assertSyncSecret(req);
    const body = req.method === "POST" ? ((await req.json().catch(() => ({}))) as SyncProjectXOptions) : {};
    const result = await syncProjectX(supabase, { ...body, requestId });
    return jsonResponse(result);
  } catch (error) {
    const message = safeErrorMessage(error);
    const statusCode = error instanceof Error && error.name === "Unauthorized" ? 401 : 500;
    console.log(JSON.stringify({
      scope: "projectx_sync_http",
      requestId,
      event: "error",
      errorName: error instanceof Error ? error.name : typeof error,
      message,
    }));

    return jsonResponse({ ok: false, error: message }, statusCode);
  }
});

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((part) => typeof part === "string" && part.length > 0);
    if (parts.length > 0) return parts.join(" | ");
    return JSON.stringify(record);
  }
  return "Unknown ProjectX sync error.";
}
