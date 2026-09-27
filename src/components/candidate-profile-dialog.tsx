import { CandidateFullProfileView } from "@/components/candidate-full-profile-view";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function CandidateProfileDialog({
  candidateId,
  matchId,
  matchStatus,
  onClose,
}: {
  candidateId: string | null;
  matchId?: string | null;
  matchStatus: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!candidateId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="card-amber max-h-[90vh] max-w-2xl overflow-hidden bg-card p-0">
        <CandidateFullProfileView
          candidateId={candidateId}
          matchId={matchId}
          matchStatus={matchStatus}
          scrollable
        />
      </DialogContent>
    </Dialog>
  );
}