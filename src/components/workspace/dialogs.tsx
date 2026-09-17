import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  assignOrChangeCourse,
  changeRecruiter,
  deactivateCandidate,
  fetchPublishedCourses,
  listRecruiters,
  removeCourse,
  updateCandidate,
  type CandidateDetail,
} from "@/lib/queries";

export function ChangeCourseDialog({
  open,
  onOpenChange,
  candidate,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidate: CandidateDetail;
  onChanged: () => void;
}) {
  const enrollment = candidate.candidate_courses?.[0];
  const courses = useQuery({
    queryKey: ["published-courses"],
    queryFn: fetchPublishedCourses,
    enabled: open,
  });
  const [courseId, setCourseId] = useState<string>(enrollment?.course_id ?? "");
  const mut = useMutation({
    mutationFn: () => assignOrChangeCourse(candidate.id, courseId, enrollment?.id),
    onSuccess: () => {
      toast.success(enrollment ? "Course changed" : "Course assigned");
      onChanged();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const removeMut = useMutation({
    mutationFn: () => removeCourse(enrollment!.id),
    onSuccess: () => {
      toast.success("Course removed");
      onChanged();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const pending = mut.isPending || removeMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{enrollment ? "Change Course" : "Assign Course"}</DialogTitle>
          <DialogDescription>Pick a published VetPod course.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Course</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger><SelectValue placeholder="Select a course" /></SelectTrigger>
            <SelectContent>
              {(courses.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="sm:justify-between">
          {enrollment ? (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmRemove) removeMut.mutate();
                else setConfirmRemove(true);
              }}
              disabled={pending}
            >
              {removeMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {confirmRemove ? "Click again to confirm" : "Remove course"}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={() => mut.mutate()} disabled={!courseId || pending}>
              {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChangeRecruiterDialog({
  open,
  onOpenChange,
  candidate,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidate: CandidateDetail;
  onChanged: () => void;
}) {
  const recruiters = useQuery({
    queryKey: ["recruiters"],
    queryFn: listRecruiters,
    enabled: open,
  });
  const [recruiterId, setRecruiterId] = useState<string>(candidate.recruiter_id ?? "__none__");
  const mut = useMutation({
    mutationFn: () =>
      changeRecruiter(candidate.id, recruiterId === "__none__" ? null : recruiterId),
    onSuccess: () => {
      toast.success("Recruiter updated");
      onChanged();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Recruiter</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Recruiter</Label>
          <Select value={recruiterId} onValueChange={setRecruiterId}>
            <SelectTrigger><SelectValue placeholder="Select a recruiter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Unassigned</SelectItem>
              {(recruiters.data ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.full_name ?? "Unnamed"}
                  {r.agency_name ? ` · ${r.agency_name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeactivateDialog({
  open,
  onOpenChange,
  candidate,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidate: CandidateDetail;
  onChanged: () => void;
}) {
  const mut = useMutation({
    mutationFn: () => deactivateCandidate(candidate.id),
    onSuccess: () => {
      toast.success("Candidate deactivated");
      onChanged();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate this candidate?</DialogTitle>
          <DialogDescription>
            The candidate's status will be set to <code>inactive</code>. This can be reverted by
            re-assigning a status later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
          >
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReactivateDialog({
  open,
  onOpenChange,
  candidate,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidate: CandidateDetail;
  onChanged: () => void;
}) {
  const targetStatus = candidate.candidate_courses?.[0] ? "training_in_progress" : "invited";
  const mut = useMutation({
    mutationFn: () => updateCandidate(candidate.id, { status: targetStatus }),
    onSuccess: () => {
      toast.success("Candidate reactivated");
      onChanged();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !mut.isPending && onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reactivate this candidate?</DialogTitle>
          <DialogDescription>
            This sets the candidate's status back to active so they re-appear in the active pool. You can fine-tune the exact status later from Edit candidate.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
