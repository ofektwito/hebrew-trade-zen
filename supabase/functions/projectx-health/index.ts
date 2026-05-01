import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabaseAdmin.ts";
import {
  assertSyncSecret,
  ProjectXClient,
  readProjectXConfig,
} from "../_shared/projectxClient.ts";
import { updateSyncStatus } from "../_shared/syncPersistence.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createAdminClient();

  try {
    assertSyncSecret(req);
    const client = new ProjectXClient(readProjectXConfig());
    await client.healthCheck();
    await updateSyncStatus(supabase, "ok", "עודכן עכשיו");
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ProjectX health error.";
    await updateSyncStatus(supabase, "error", message).catch(() => undefined);
    return jsonResponse(
      { ok: false, error: message },
      error instanceof Error && error.name === "Unauthorized" ? 401 : 500,
    );
  }
});

