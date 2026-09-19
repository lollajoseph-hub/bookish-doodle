import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export function InterviewRequestDialog({
  matchId,
  candidateName,
  onClose,
  onRequested,
}: {
  matchId: string | null;
  candidateName?: string | null;
  onClose: () => void;
  onRequested: () => void;
}) {
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    setDate(undefined);
    setTime("");
    setBusy(false);
  }, [matchId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!matchId || !date || !time) {
      toast.error("Choose a proposed date and time.");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const proposedAt = new Date(date);
    proposedAt.setHours(hours, minutes, 0, 0);
    if (proposedAt.getTime() <= Date.now()) {
      toast.error("Choose a future date and time.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("client_request_interview", {
      p_match_id: matchId,
      p_proposed_at: proposedAt.toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Interview time proposed");
    onRequested();
  }

  return (
    <Dialog open={!!matchId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="card-amber max-h-[92vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Request an interview</DialogTitle>
            <DialogDescription>
              Propose a time to meet {candidateName || "this candidate"}. ScaleSource will confirm it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Proposed date</Label>
              <div className="flex justify-center rounded-md border bg-card">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={{ before: new Date() }}
                  initialFocus
                  className="pointer-events-auto p-3"
                  classNames={{
                    day_button:
                      "transition-[background-color,color,transform,box-shadow] duration-300 data-[selected-single=true]:scale-105 data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[selected-single=true]:shadow-md",
                  }}
                />
              </div>
              {date && <p className="text-xs text-muted-foreground">{format(date, "EEEE, MMMM d, yyyy")}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="interview-time">Proposed time</Label>
              <Input
                id="interview-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Shown in your current timezone.</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!date || !time || busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-1.5 h-4 w-4" />}
              Propose time
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}