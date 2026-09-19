import { supabase } from "./supabase";
import type { SkillRow } from "./database.types";

export const OTHER_CATEGORY = "Other";

export type SkillWithUsage = SkillRow & {
  candidateCount: number;
  requestCount: number;
  usageCount: number;
};

export async function fetchSkillsWithUsage(): Promise<SkillWithUsage[]> {
  const [skillsRes, candRes, reqRes] = await Promise.all([
    supabase.from("skills").select("id, name, category, created_at"),
    supabase.from("candidate_skills").select("skill_id"),
    supabase.from("client_request_skills").select("skill_id"),
  ]);
  if (skillsRes.error) throw skillsRes.error;
  if (candRes.error) throw candRes.error;
  if (reqRes.error) throw reqRes.error;

  const candCounts = new Map<string, number>();
  for (const row of (candRes.data ?? []) as Array<{ skill_id: string }>) {
    candCounts.set(row.skill_id, (candCounts.get(row.skill_id) ?? 0) + 1);
  }
  const reqCounts = new Map<string, number>();
  for (const row of (reqRes.data ?? []) as Array<{ skill_id: string }>) {
    reqCounts.set(row.skill_id, (reqCounts.get(row.skill_id) ?? 0) + 1);
  }

  return ((skillsRes.data ?? []) as SkillRow[])
    .map((s) => {
      const candidateCount = candCounts.get(s.id) ?? 0;
      const requestCount = reqCounts.get(s.id) ?? 0;
      return { ...s, candidateCount, requestCount, usageCount: candidateCount + requestCount };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export function distinctCategories(skills: SkillRow[]): string[] {
  const set = new Set<string>();
  for (const s of skills) if (s.category) set.add(s.category);
  set.add(OTHER_CATEGORY);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function updateSkill(
  id: string,
  patch: { name?: string; category?: string | null },
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Skill name is required");
    payload.name = name;
  }
  if (patch.category !== undefined) payload.category = patch.category;
  if (Object.keys(payload).length === 0) return;

  const { error } = await supabase.from("skills").update(payload).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      throw new Error("Another skill already has that name — merge them instead.");
    }
    throw error;
  }
}

export async function deleteSkill(id: string): Promise<void> {
  const [candRes, reqRes] = await Promise.all([
    supabase.from("candidate_skills").select("skill_id").eq("skill_id", id).limit(1),
    supabase.from("client_request_skills").select("skill_id").eq("skill_id", id).limit(1),
  ]);
  if (candRes.error) throw candRes.error;
  if (reqRes.error) throw reqRes.error;
  if ((candRes.data ?? []).length > 0 || (reqRes.data ?? []).length > 0) {
    throw new Error(
      "This skill is still linked to candidates or requests. Merge it into another skill instead of deleting it.",
    );
  }
  const { error } = await supabase.from("skills").delete().eq("id", id);
  if (error) throw error;
}

export async function mergeSkills(sourceIds: string[], targetId: string): Promise<void> {
  const sources = sourceIds.filter((id) => id !== targetId);
  if (sources.length === 0) throw new Error("Pick at least one other skill to merge in");
  const { error } = await supabase.rpc("admin_merge_skills", {
    p_source_ids: sources,
    p_target_id: targetId,
  });
  if (error) {
    if (error.code === "42883" || /function .*admin_merge_skills/i.test(error.message)) {
      throw new Error(
        "The merge function isn't installed on the database yet — run the admin_merge_skills SQL first.",
      );
    }
    throw error;
  }
}
