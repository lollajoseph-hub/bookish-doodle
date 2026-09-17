import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileText, Image, Video, IdCard, Paperclip, Trash2, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCandidateFile,
  fetchCandidateFiles,
  getCandidateFileUrl,
  labelize,
  uploadCandidateFile,
} from "@/lib/crm-queries";
import type { CandidateFileRow, CandidateFileType } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FILE_TYPES: CandidateFileType[] = [
  "resume",
  "profile_photo",
  "intro_video",
  "id_document",
  "reference",
  "other",
];

function iconFor(type: string) {
  if (type === "resume") return FileText;
  if (type === "profile_photo") return Image;
  if (type === "intro_video") return Video;
  if (type === "id_document") return IdCard;
  return Paperclip;
}

function prettySize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CandidateFilesCard({
  candidateId,
  canEdit,
}: {
  candidateId: string;
  canEdit: boolean;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileType, setFileType] = useState<CandidateFileType>("resume");

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["candidate-files", candidateId],
    queryFn: () => fetchCandidateFiles(candidateId),
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadCandidateFile({ candidateId, file, fileType, uploadedBy: profile?.id ?? null }),
    onSuccess: () => {
      toast.success("File uploaded");
      queryClient.invalidateQueries({ queryKey: ["candidate-files", candidateId] });
    },
    onError: (e: Error) => toast.error(e.message || "Upload failed"),
  });

  const remove = useMutation({
    mutationFn: (file: CandidateFileRow) => deleteCandidateFile(file),
    onSuccess: () => {
      toast.success("File removed");
      queryClient.invalidateQueries({ queryKey: ["candidate-files", candidateId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openFile = async (file: CandidateFileRow) => {
    try {
      const url = await getCandidateFileUrl(file);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message || "Could not open file");
    }
  };

  return (
    <section className="card-amber rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">Files</h2>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Select value={fileType} onValueChange={(v: string) => setFileType(v as CandidateFileType)}>
              <SelectTrigger className="h-8 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {labelize(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1 h-3.5 w-3.5" />
              )}
              Upload
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading files…</p>}
        {files.map((f) => {
          const Icon = iconFor(f.file_type);
          return (
            <div
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-xl border p-3 transition-colors hover:border-amber"
            >
              <button
                onClick={() => openFile(f)}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{f.file_name || f.storage_path}</div>
                  <div className="text-xs text-muted-foreground">
                    {labelize(f.file_type)} {prettySize(f.size_bytes)}
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant="secondary">{labelize(f.file_type)}</Badge>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Delete file"
                    onClick={() => remove.mutate(f)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {!isLoading && !files.length && (
          <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
        )}
      </div>
    </section>
  );
}
