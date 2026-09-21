import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { REJECTION_REASONS, type RejectionReason } from "@/lib/matches";

/**
 * Rejection always requires one of the four `rejection_reason` enum values —
 * the submit button stays disabled until one is chosen. The note is optional.
 */
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
    toast.success("Feedback sent — thanks");
    onRejected();
  }

  return (
    <Dialog open={!!matchId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Not a fit — {candidateName || "candidate"}</DialogTitle>
          <DialogDescription>
            Tell us why so we can find better matches for you. A reason is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason ?? undefined} onValueChange={(v) => setReason(v as RejectionReason)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
