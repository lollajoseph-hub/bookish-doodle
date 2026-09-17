import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import {
  fetchCandidateAiProfile,
  fetchCandidateRoleplay,
  type RoleplaySession,
} from "@/lib/queries";

const CATEGORY_LABELS: Record<string, string> = {
  communication: "Communication",
  professionalism: "Professionalism",
  empathy: "Empathy",
  listening: "Listening",
  problem_solving: "Problem Solving",
  confidence: "Confidence",
  customer_service: "Customer Service",
  accuracy: "Accuracy",
  scenario_completion: "Scenario Completion",
  instruction_following: "Instruction Following",
};
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

function isGraded(s: RoleplaySession): boolean {
  return typeof s.score === "number" || (s.ai_feedback && typeof s.ai_feedback === "object" && (typeof s.ai_feedback.percentage === "number" || s.ai_feedback.category_scores));
}

function dedupe(items: any[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    const v = typeof it === "string" ? it.trim() : String(it ?? "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function AiAnalysisTab({ candidateId }: { candidateId: string }) {
  const roleplay = useQuery({
    queryKey: ["roleplay", candidateId],
    queryFn: () => fetchCandidateRoleplay(candidateId),
  });
  const ai = useQuery({
    queryKey: ["ai-profile", candidateId],
    queryFn: () => fetchCandidateAiProfile(candidateId),
  });
  const aiScore = useQuery({
    queryKey: ["ai-score", candidateId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_candidate_ai_score", { p_candidate: candidateId });
      if (error) throw error;
      return data as number | null;
    },
  });

  if (roleplay.isLoading || ai.isLoading || aiScore.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const sessions = (roleplay.data ?? []).filter(isGraded);

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border p-10 text-center">
        <h3 className="font-semibold">No roleplay AI analysis yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          It appears here once the candidate's roleplay scenarios are graded.
        </p>
        {aiScore.data != null && (
          <p className="text-sm mt-3">
            AI Score:{" "}
            <span className="font-semibold">{aiScore.data}</span>
          </p>
        )}
      </div>
    );
  }

  // Overall percentage: best score per distinct scenario, then averaged
  const bestByScenario = new Map<string, number>();
  for (const s of sessions) {
    const p = s.ai_feedback?.percentage;
    const val = typeof p === "number" ? p : (typeof s.score === "number" ? s.score : null);
    if (val == null) continue;
    const key = (s.scenario_name ?? "").trim().toLowerCase();
    if (!key) continue;
    const prev = bestByScenario.get(key);
    if (prev == null || val > prev) bestByScenario.set(key, val);
  }
  const pcts = [...bestByScenario.values()];
  const overall = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;

  // Category aggregation
  const catTotals: Record<string, { sum: number; count: number; max: number | null }> = {};
  for (const k of CATEGORY_KEYS) catTotals[k] = { sum: 0, count: 0, max: null };
  for (const s of sessions) {
    const cs = s.ai_feedback?.category_scores ?? {};
    const cm = s.ai_feedback?.category_max ?? {};
    for (const k of CATEGORY_KEYS) {
      const v = cs[k];
      if (typeof v === "number") {
        catTotals[k].sum += v;
        catTotals[k].count += 1;
      }
      if (typeof cm[k] === "number" && catTotals[k].max == null) {
        catTotals[k].max = cm[k];
      }
    }
  }

  const strengths = dedupe(sessions.flatMap((s) => (Array.isArray(s.ai_feedback?.strengths) ? s.ai_feedback.strengths : [])));
  const weaknesses = dedupe(sessions.flatMap((s) => (Array.isArray(s.ai_feedback?.weaknesses) ? s.ai_feedback.weaknesses : [])));

  return (
    <div className="space-y-5">
      <section className="rounded-xl border p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Overall Roleplay Score</div>
          <div className="text-3xl font-semibold tabular-nums mt-1">
            {overall != null ? `${overall}%` : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Best score per scenario, averaged across {pcts.length} scenario{pcts.length === 1 ? "" : "s"}
          </div>
        </div>
        {aiScore.data != null && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">AI Score</div>
            <div className="text-2xl font-semibold tabular-nums">{aiScore.data}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Roleplay + exam + experience + strengths</div>
          </div>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <h4 className="font-semibold mb-3">Category Scores</h4>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CATEGORY_KEYS.map((k) => {
            const t = catTotals[k];
            if (t.count === 0) {
              return (
                <div key={k} className="rounded-lg border p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">{CATEGORY_LABELS[k]}</div>
                  <div className="text-sm italic text-muted-foreground mt-1">No data</div>
                </div>
              );
            }
            const avg = t.sum / t.count;
            return (
              <div key={k} className="rounded-lg border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{CATEGORY_LABELS[k]}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {avg.toFixed(1)}
                  {t.max != null && <span className="text-sm font-normal text-muted-foreground"> / {t.max}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4">
        <ListBlock title="Strengths" items={strengths} />
        <ListBlock title="Improvement Opportunities" items={weaknesses} />
      </div>

      <section className="space-y-3">
        <h4 className="font-semibold">Coaching & Detailed Feedback</h4>
        {sessions.map((s) => (
          <ScenarioBlock key={s.id} session={s} />
        ))}
      </section>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border p-4">
      <h4 className="font-semibold mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">None recorded.</p>
      ) : (
        <ul className="list-disc pl-5 text-sm space-y-1">
          {items.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      )}
    </div>
  );
}

function ScenarioBlock({ session: s }: { session: RoleplaySession }) {
  const fb = s.ai_feedback ?? {};
  const title = fb.scenario || s.scenario_name || "Roleplay scenario";
  const pct = typeof fb.percentage === "number" ? fb.percentage : (typeof s.score === "number" ? s.score : null);
  const verdict = typeof fb.verdict === "string" ? fb.verdict : null;
  const cs = fb.category_scores ?? {};
  const cm = fb.category_max ?? {};
  const catEntries = CATEGORY_KEYS.filter((k) => typeof cs[k] === "number");
  const strengths: string[] = Array.isArray(fb.strengths) ? fb.strengths : [];
  const weaknesses: string[] = Array.isArray(fb.weaknesses) ? fb.weaknesses : [];
  const recruiterSummary: string | null = typeof fb.recruiter_summary === "string" && fb.recruiter_summary.trim()
    ? fb.recruiter_summary
    : (typeof fb.summary === "string" ? fb.summary : null);

  return (
    <article className="rounded-xl border p-4 space-y-3">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h5 className="font-semibold truncate">{title}</h5>
        </div>
        <div className="flex items-center gap-2">
          {verdict && (
            <Badge variant="outline" className="capitalize">{verdict}</Badge>
          )}
          {pct != null && (
            <span className="text-sm font-semibold tabular-nums">{pct}%</span>
          )}
        </div>
      </header>

      {catEntries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {catEntries.map((k) => (
            <div key={k} className="rounded-md border p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{CATEGORY_LABELS[k]}</div>
              <div className="text-sm font-semibold tabular-nums">
                {cs[k]}
                {typeof cm[k] === "number" && <span className="text-xs font-normal text-muted-foreground"> / {cm[k]}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(strengths.length > 0 || weaknesses.length > 0) && (
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          {strengths.length > 0 && (
            <div>
              <div className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">Strengths</div>
              <ul className="list-disc pl-5 space-y-1">
                {strengths.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div>
              <div className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">Weaknesses</div>
              <ul className="list-disc pl-5 space-y-1">
                {weaknesses.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {recruiterSummary && (
        <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
          <div className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Recruiter Summary
          </div>
          <p className="whitespace-pre-wrap">{recruiterSummary}</p>
        </div>
      )}
    </article>
  );
}
