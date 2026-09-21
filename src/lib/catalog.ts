import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface JobRole {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
}

/** Exact, case-sensitive `skills.category` values that exist in the backend today. */
export const SKILL_CATEGORIES = ["Software", "Customer Service", "Languages"] as const;
export const LANGUAGE_CATEGORY = "Languages";

export const ENGAGEMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "project", label: "Project" },
] as const;

export const DAYS_OF_WEEK = [
  { value: "Mon", label: "Monday" },
  { value: "Tue", label: "Tuesday" },
  { value: "Wed", label: "Wednesday" },
  { value: "Thu", label: "Thursday" },
  { value: "Fri", label: "Friday" },
  { value: "Sat", label: "Saturday" },
  { value: "Sun", label: "Sunday" },
] as const;

export const INDUSTRIES = [
  "Accounting & Finance",
  "Advertising & Marketing",
  "Agriculture",
  "Automotive",
  "Construction",
  "Consulting",
  "Consumer Goods",
  "E-commerce & Retail",
  "Education",
  "Energy & Utilities",
  "Entertainment & Media",
  "Financial Services",
  "Government & Public Sector",
  "Healthcare",
  "Hospitality & Tourism",
  "Human Resources & Staffing",
  "Information Technology",
  "Insurance",
  "Legal",
  "Logistics & Supply Chain",
  "Manufacturing",
  "Non-Profit",
  "Pharmaceuticals & Biotech",
  "Professional Services",
  "Real Estate",
  "Software / SaaS",
  "Telecommunications",
  "Transportation",
  "Wholesale Trade",
] as const;


export interface Catalog {
  roles: JobRole[];
  skills: Skill[];
  languageSkills: Skill[];
  nonLanguageSkills: Skill[];
  loading: boolean;
  error: string | null;
}

/** Loads the `job_roles` and `skills` reference data used by every request form. */
export function useCatalog(): Catalog {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [rolesRes, skillsRes] = await Promise.all([
        supabase
          .from("job_roles")
          .select("id,name,description,is_active")
          .eq("is_active", true)
          .order("name"),
        supabase.from("skills").select("id,name,category").order("name"),
      ]);
      if (cancelled) return;
      const err = rolesRes.error ?? skillsRes.error;
      if (err) setError(err.message);
      setRoles((rolesRes.data as JobRole[] | null) ?? []);
      setSkills((skillsRes.data as Skill[] | null) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    roles,
    skills,
    languageSkills: skills.filter((s) => s.category === LANGUAGE_CATEGORY),
    nonLanguageSkills: skills.filter((s) => s.category !== LANGUAGE_CATEGORY),
    loading,
    error,
  };
}
