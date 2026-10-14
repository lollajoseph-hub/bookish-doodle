import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// DISABLED. This was temporary QA-only scaffolding used once to generate a
// magic-link sign-in for the seeded test client contact during the Candidate
// Pool client-app end-to-end verification pass. The QA pass is complete and
// this function no longer does anything. There is no delete-function tool
// available via this MCP session, so it's neutered in place rather than left
// live; it should be deleted properly from the Supabase dashboard (Edge
// Functions -> qa-generate-test-link -> Delete) at Lola's convenience.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({ error: "disabled: QA-only function, no longer active" }), {
    status: 410,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
