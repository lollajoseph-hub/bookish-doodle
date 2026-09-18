import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/** Exact values of the Postgres `rejection_reason` enum. */
export const REJECTION_REASONS = [
  { value: "skill_mismatch", label: "Skill mismatch" },
  { value: "availability_conflict", label: "Availability conflict" },
  { value: "culture_fit", label: "Culture fit" },
  { value: "other", label: "Other" },
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number]["value"];

export function RejectCandidateDialog({
  matchId,
  candidateName,
  onClose,
  onRejected,
}: {
  matchId: string | null;
  candidateName?: string | null;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState<RejectionReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (matchId) {
      setReason(null);
      setNote("");
    }
  }, [matchId]);

  async function submit() {
    if (!matchId || !reason) return;
    setBusy(true);
    const { error } = await supabase.rpc("reject_candidate_match", {
      p_match_id: matchId,
      p_reason: reason,
      p_note: note.trim() ? note.trim() : null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Candidate rejected");
    onRejected();
  }

  return (
    <Dialog open={!!matchId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {candidateName || "candidate"}</DialogTitle>
          <DialogDescription>
            Please tell us why — this helps us find better matches for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Reason (required)</Label>
          <div className="grid gap-2">
            {REJECTION_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setReason(r.value)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  reason === r.value
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-input hover:bg-accent"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reject-note">Additional notes (optional)</Label>
            <Textarea
              id="reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Anything else we should know?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!reason || busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Reject candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
