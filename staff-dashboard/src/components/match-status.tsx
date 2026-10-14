import { Badge } from "@/components/ui/badge";
import { labelize } from "@/lib/crm-queries";
import type { MatchStatus, RequestPriority } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const PILL = "h-[25px] rounded-full border-transparent px-2.5 py-0 text-[11.5px] font-semibold whitespace-nowrap";

const STYLES: Record<MatchStatus, string> = {
  recommended: "bg-primary-soft text-primary",
  shortlisted: "bg-amber-soft text-gold-ink",
  interview_requested: "bg-amber-soft text-gold-ink",
  interview_confirmed: "bg-primary-soft text-primary",
  interview_completed: "bg-primary-soft text-primary",
  hire_requested: "bg-amber-soft text-gold-ink",
  offer_extended: "bg-amber-soft text-gold-ink",
  hired: "bg-[#e9f2ea] text-[#2f5f35]",
  rejected: "bg-foreground/[0.06] text-secondary-foreground",
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return (
    <Badge variant="outline" className={cn(PILL, STYLES[status])}>
      {labelize(status)}
    </Badge>
  );
}

const REQUEST_STYLES: Record<string, string> = {
  open: "bg-primary-soft text-primary",
  needs_attention: "bg-amber-soft text-gold-ink",
  fulfilled: "bg-[#e9f2ea] text-[#2f5f35]",
  closed: "bg-foreground/[0.06] text-secondary-foreground",
};

export function RequestStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn(PILL, REQUEST_STYLES[status])}>
      {labelize(status)}
    </Badge>
  );
}

export function CuratedBadge({ source }: { source?: string | null }) {
  if (source !== "staff_curated") return null;
  return (
    <Badge variant="outline" className={cn(PILL, "bg-amber-soft text-gold-ink")}>
      Staff-curated
    </Badge>
  );
}

const PRIORITY_STYLES: Record<Exclude<RequestPriority, "normal">, string> = {
  high: "bg-amber-soft text-gold-ink",
  urgent: "bg-destructive/10 text-destructive",
};

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (priority !== "high" && priority !== "urgent") return null;
  return (
    <Badge variant="outline" className={cn(PILL, PRIORITY_STYLES[priority])}>
      {priority === "high" ? "High Priority" : "Urgent"}
    </Badge>
  );
}
