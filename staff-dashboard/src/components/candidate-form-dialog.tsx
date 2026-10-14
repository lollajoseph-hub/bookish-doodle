import { CandidateForm } from "@/components/candidate-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CandidateFormDialog({
  open,
  onOpenChange,
  candidateId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidateId?: string;
  onSaved?: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{candidateId ? "Edit candidate" : "Add candidate"}</DialogTitle>
          <DialogDescription>
            Capture contact details, role fit, skills and background.
          </DialogDescription>
        </DialogHeader>

        <CandidateForm
          candidateId={candidateId}
          active={open}
          onCancel={() => onOpenChange(false)}
          onSaved={(id) => {
            onOpenChange(false);
            onSaved?.(id);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
