import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { REJECTION_REASONS, labelize } from "@/lib/crm-queries";
import type { RejectionReason } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Shared "Reject candidate" dialog: pick one of the rejection_reason enum
 * values plus an optional note. The caller performs the actual
 * reject_candidate_match call in onConfirm.
 */
export function RejectReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
  title = "Reject candidate",
  description = "Record why this candidate didn't fit.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: RejectionReason, note: string) => void;
  pending?: boolean;
  title?: string;
  description?: string;
}) {
  const [reason, setReason] = useState<RejectionReason>("skill_mismatch");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setReason("skill_mismatch");
      setNote("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(v: string) => setReason(v as RejectionReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {labelize(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason, note)} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
