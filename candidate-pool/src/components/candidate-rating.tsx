import { useEffect, useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function CandidateRating({
  matchId,
  interviewCompletedAt,
  rating,
  note,
  onSaved,
}: {
  matchId: string;
  interviewCompletedAt: string | null;
  rating: number | null;
  note: string | null;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState<number>(rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(rating ?? 0);
    setText(note ?? "");
  }, [rating, note]);

  if (!interviewCompletedAt) return null;
  const dirty = value !== (rating ?? 0) || text.trim() !== (note ?? "").trim();

  async function save() {
    if (!value) return;
    setSaving(true);
    const { error } = await supabase.rpc("client_rate_candidate", {
      p_match_id: matchId,
      p_rating: value,
      p_note: text.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(rating ? "Rating updated" : "Rating saved");
    onSaved?.();
  }

  const shown = hover || value;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {rating ? "Your interview rating" : "Rate this interview"}
      </p>
      <div className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="rounded p-0.5 transition-transform duration-300 hover:scale-110"
            onMouseEnter={() => setHover(n)}
            onClick={() => setValue(n)}
          >
            <Star className={cn("h-5 w-5", n <= shown ? "fill-amber text-amber" : "text-foreground/15")} />
          </button>
        ))}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Optional note"
        rows={2}
        className="text-sm"
      />
      {dirty && (
        <Button size="sm" disabled={!value || saving} onClick={save}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {rating ? "Update rating" : "Save rating"}
        </Button>
      )}
    </div>
  );
}
