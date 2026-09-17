import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchCandidateFiles, getSignedUrl } from "@/lib/queries";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const TYPE_LABEL: Record<string, string> = {
  profile_photo: "Passport Photo",
  id_document: "Photo ID",
  original_resume: "Resume / CV",
  intro_video: "Introduction Video",
  other: "Supporting Document",
};

export function FilePreviewDialog({
  candidateId,
  candidateName,
  open,
  onOpenChange,
}: {
  candidateId: string | null;
  candidateName?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const files = useQuery({
    queryKey: ["candidate-files", candidateId],
    queryFn: () => fetchCandidateFiles(candidateId!),
    enabled: !!candidateId && open,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setSignedUrl(null);
    }
  }, [open]);

  useEffect(() => {
    const f = files.data?.find((x) => x.id === selected);
    if (!f) {
      setSignedUrl(null);
      return;
    }
    getSignedUrl(f.bucket_id, f.storage_path).then(setSignedUrl);
  }, [selected, files.data]);

  const current = files.data?.find((x) => x.id === selected);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{candidateName ? `Files — ${candidateName}` : "Candidate files"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 min-h-[400px] overflow-hidden">
          <div className="border rounded-xl overflow-y-auto max-h-[60vh]">
            {files.isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : !files.data?.length ? (
              <div className="p-6 text-sm text-muted-foreground text-center">No files uploaded.</div>
            ) : (
              <ul className="divide-y">
                {files.data.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => setSelected(f.id)}
                      className={`w-full text-left p-3 hover:bg-secondary text-sm flex items-start gap-2 ${
                        selected === f.id ? "bg-secondary" : ""
                      }`}
                    >
                      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{TYPE_LABEL[f.file_type] ?? f.file_type}</div>
                        <div className="text-xs text-muted-foreground truncate">{f.file_name}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border rounded-xl overflow-hidden flex flex-col bg-secondary/30 min-h-[400px]">
            {!current ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a file to preview
              </div>
            ) : !signedUrl ? (
              <div className="flex-1 flex items-center justify-center">
                <Skeleton className="h-32 w-32" />
              </div>
            ) : (
              <Preview file={current} url={signedUrl} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Preview({ file, url }: { file: { mime_type: string | null; file_name: string }; url: string }) {
  const mime = file.mime_type ?? "";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isPdf = mime === "application/pdf";

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center justify-between p-2 border-b bg-card">
        <div className="text-xs text-muted-foreground truncate">{file.file_name}</div>
        <Button asChild size="sm" variant="ghost">
          <a href={url} target="_blank" rel="noreferrer">
            Open <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        </Button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-3">
        {isImage ? (
          <img src={url} alt={file.file_name} className="max-w-full max-h-[60vh] rounded-lg" />
        ) : isVideo ? (
          <video src={url} controls className="max-w-full max-h-[60vh] rounded-lg" />
        ) : isPdf ? (
          <iframe src={url} title={file.file_name} className="w-full h-[60vh] rounded-lg bg-white" />
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline text-sm"
          >
            Download {file.file_name}
          </a>
        )}
      </div>
    </div>
  );
}
