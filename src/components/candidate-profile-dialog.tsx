import { CandidateFullProfileView } from "@/components/candidate-full-profile-view";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function CandidateProfileDialog({
  candidateId,
  matchId,
  matchStatus,
  matchReason,
  requiredSkills,
  candidateSkills,
  onClose,
}: {
  candidateId: string | null;
  matchId?: string | null;
  matchStatus: string | null;
  matchReason?: string | null;
  requiredSkills?: string[];
  candidateSkills?: string[];
  onClose: () => void;
}) {
  return (
    // Slides in from the right (approved mockup). Same open/close behaviour as before.
    <Sheet open={!!candidateId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-hidden border-0 bg-transparent p-3 shadow-none data-[state=open]:duration-700 data-[state=closed]:duration-300 sm:max-w-[720px]"
      >
        <SheetTitle className="sr-only">Candidate profile</SheetTitle>
        <div className="h-full overflow-hidden rounded-[30px] border border-white/70 bg-white/95 shadow-[0_40px_90px_-30px_rgb(46_16_73/0.55)] backdrop-blur-xl [&_.candidate-profile-scroll]:max-h-[calc(100dvh-1.5rem)]">
        <CandidateFullProfileView
          candidateId={candidateId}
          matchId={matchId}
          matchStatus={matchStatus}
          matchReason={matchReason}
          requiredSkills={requiredSkills}
          candidateSkills={candidateSkills}
          scrollable
        />
        </div>
      </SheetContent>
    </Sheet>
  );
}