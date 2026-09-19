import { ENGAGEMENT_TYPES, DAYS_OF_WEEK, type Catalog } from "@/lib/catalog";
import type { RequestForm } from "@/components/request-fields";

export interface RecapItem {
  label: string;
  value: string;
}

type ContactRecap = {
  first_name: string;
  last_name: string;
  email: string;
  position: string;
};

export function buildRequestRecap({
  request,
  catalog,
  completedThrough = 4,
  company,
  contact,
}: {
  request: RequestForm;
  catalog: Catalog;
  completedThrough?: number;
  company?: { name: string; industry: string };
  contact?: ContactRecap;
}): RecapItem[] {
  const role = catalog.roles.find((item) => item.id === request.role_id)?.name;
  const engagement = ENGAGEMENT_TYPES.find((item) => item.value === request.engagement_type)?.label;
  const days = request.days_of_week_needed
    .map((id) => DAYS_OF_WEEK.find((day) => day.value === id)?.label ?? id)
    .join(", ");
  const languages = request.language_skill_ids
    .map((id) => catalog.languageSkills.find((skill) => skill.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");
  const niceToHave = request.nice_to_have_skill_ids
    .map((id) => catalog.nonLanguageSkills.find((skill) => skill.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");

  const groups: RecapItem[][] = [
    [
      { label: "Company", value: company?.name ?? "" },
      { label: "Industry", value: company?.industry ?? "" },
    ],
    [
      { label: "First name", value: contact?.first_name ?? "" },
      { label: "Last name", value: contact?.last_name ?? "" },
      { label: "Email", value: contact?.email ?? "" },
      { label: "Position", value: contact?.position ?? "" },
    ],
    [
      { label: "Role", value: role ?? "" },
      { label: "Engagement", value: engagement ?? "" },
      { label: "Hires", value: request.hires_needed },
    ],
    [
      { label: "Hours", value: request.hours_needed },
      { label: "Days", value: days },
      { label: "Start date", value: formatRecapDate(request.desired_start_date) },
    ],
    [
      { label: "Must-have skills", value: request.must_have_skill_names.join(", ") },
      { label: "Languages", value: languages },
      { label: "Nice-to-have", value: niceToHave },
      {
        label: "Experience",
        value: request.years_experience_min
          ? `${request.years_experience_min} ${request.years_experience_min === "1" ? "year" : "years"}`
          : "",
      },
      { label: "Notes", value: request.notes },
    ],
  ];

  return groups
    .slice(0, completedThrough + 1)
    .flat()
    .filter((item) => item.value.trim());
}

function formatRecapDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}

export function RequestRecap({ items, expanded = false }: { items: RecapItem[]; expanded?: boolean }) {
  if (items.length === 0) return null;

  return (
    <dl
      aria-label="Your answers"
      className={
        expanded
          ? "grid w-full grid-cols-2 gap-x-5 gap-y-4 text-left sm:grid-cols-3"
          : "wizard-recap-enter flex min-w-max gap-5"
      }
    >
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="min-w-28 border-b border-primary/25 pb-1">
          <dt className="text-[10px] font-semibold uppercase text-muted-foreground">{item.label}</dt>
          <dd className="max-w-56 truncate text-sm font-medium text-primary" title={item.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}