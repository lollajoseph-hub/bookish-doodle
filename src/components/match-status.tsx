import { Badge } from "@/components/ui/badge";
import { labelize } from "@/lib/crm-queries";
import type { MatchStatus } from "@/lib/database.types";

const STYLES: Record<MatchStatus, string> = {
  recommended: "bg-primary-soft text-primary border-primary/20",
  shortlisted: "bg-amber/15 text-amber-foreground border-amber/40",
  interview_requested: "bg-amber/20 text-amber-foreground border-amber/50",
  interview_confirmed: "bg-amber/30 text-amber-foreground border-amber",
  interview_completed: "bg-primary/15 text-primary-dark border-primary/30",
  offer_extended: "bg-amber/25 text-amber-foreground border-amber",
  hired: "bg-emerald-100 text-emerald-800 border-emerald-300",
  rejected: "bg-muted text-muted-foreground border-border",
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  return (
    <Badge variant="outline" className={STYLES[status] ?? ""}>
      {labelize(status)}
    </Badge>
  );
}

const REQUEST_STYLES: Record<string, string> = {
  open: "bg-primary-soft text-primary border-primary/20",
  needs_attention: "bg-amber/20 text-amber-foreground border-amber/50",
  fulfilled: "bg-emerald-100 text-emerald-800 border-emerald-300",
  closed: "bg-muted text-muted-foreground border-border",
};

export function RequestStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={REQUEST_STYLES[status] ?? ""}>
      {labelize(status)}
    </Badge>
  );
}
