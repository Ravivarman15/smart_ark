import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, Loader2, Music, Video } from "lucide-react";
import { estudyService } from "../services/estudy.service";
import type { StudyMaterial } from "../types/estudy.types";

interface StudyMaterialPreviewProps {
  material: StudyMaterial | null;
  open: boolean;
  onClose: () => void;
}

const getYoutubeEmbedUrl = (url?: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  if (match && match[2].length === 11) {
    return `https://www.youtube.com/embed/${match[2]}`;
  }
  return null;
};

export const StudyMaterialPreview = ({
  material,
  open,
  onClose,
}: StudyMaterialPreviewProps) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!material || !open) {
      setSignedUrl(null);
      return;
    }

    const loadUrl = async () => {
      if (!material.filePath) {
        setSignedUrl(material.url || null);
        return;
      }
      setLoading(true);
      try {
        const url = await estudyService.signedUrl(material.filePath);
        setSignedUrl(url);
      } catch (err) {
        console.error("Failed to generate signed URL", err);
      } finally {
        setLoading(false);
      }
    };

    loadUrl();
  }, [material, open]);

  if (!material) return null;

  const ytEmbedUrl = getYoutubeEmbedUrl(material.url);
  const isPdf = material.mimeType === "application/pdf" || material.fileName?.endsWith(".pdf");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col p-6 overflow-hidden bg-background border border-border rounded-xl">
        <DialogHeader className="flex-none pb-2 border-b border-border">
          <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground truncate">
            {material.title}
          </DialogTitle>
          {material.description && (
            <DialogDescription className="text-sm text-muted-foreground truncate">
              {material.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4 flex items-center justify-center bg-muted/20 rounded-lg border border-border/50 relative overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          ) : !signedUrl && !ytEmbedUrl ? (
            <div className="text-center p-6 max-w-sm space-y-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">No Preview Available</p>
                <p className="text-xs text-muted-foreground mt-1">
                  This type of resource cannot be previewed directly. You can open or download it using the actions below.
                </p>
              </div>
              {material.url && (
                <Button asChild size="sm" className="gap-2">
                  <a href={material.url} target="_blank" rel="noopener noreferrer">
                    Open Link <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Image Preview */}
              {material.kind === "image" && signedUrl && (
                <img
                  src={signedUrl}
                  alt={material.title}
                  className="max-h-full max-w-full object-contain rounded animate-in zoom-in-95 duration-200"
                />
              )}

              {/* PDF Viewer */}
              {material.kind === "notes" && isPdf && signedUrl && (
                <iframe
                  src={`${signedUrl}#toolbar=0`}
                  title={material.title}
                  className="w-full h-full border-none rounded animate-in fade-in duration-200"
                />
              )}

              {/* Fallback for non-PDF notes */}
              {material.kind === "notes" && !isPdf && (
                <div className="text-center p-6 space-y-4">
                  <FileText className="w-12 h-12 text-accent mx-auto" />
                  <div>
                    <p className="font-semibold">{material.fileName}</p>
                    <p className="text-xs text-muted-foreground">Document preview is only supported for PDFs.</p>
                  </div>
                  {signedUrl && (
                    <Button asChild size="sm" className="gap-2">
                      <a href={signedUrl} download>
                        Download Document <Download className="w-3.5 h-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              )}

              {/* Video Player */}
              {material.kind === "video" && (
                <div className="w-full h-full flex items-center justify-center">
                  {ytEmbedUrl ? (
                    <iframe
                      src={ytEmbedUrl}
                      title={material.title}
                      className="w-full h-full border-none rounded"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : signedUrl ? (
                    <video
                      src={signedUrl}
                      controls
                      className="max-h-full max-w-full rounded"
                    />
                  ) : null}
                </div>
              )}

              {/* Audio Player */}
              {material.kind === "audio" && signedUrl && (
                <div className="p-8 bg-card border border-border rounded-xl shadow-lg w-full max-w-md text-center space-y-6">
                  <div className="w-16 h-16 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto shadow-inner">
                    <Music className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-lg truncate">
                      {material.title}
                    </h3>
                    {material.fileName && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {material.fileName}
                      </p>
                    )}
                  </div>
                  <audio src={signedUrl} controls className="w-full" />
                </div>
              )}

              {/* External Link */}
              {material.kind === "link" && signedUrl && (
                <div className="text-center p-6 space-y-4 max-w-sm">
                  <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mx-auto">
                    <ExternalLink className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">External Link</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {material.url}
                    </p>
                  </div>
                  <Button asChild className="gap-2">
                    <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                      Visit Website <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex-none pt-4 border-t border-border flex items-center justify-between">
          <div className="text-xs text-muted-foreground flex gap-3">
            {material.subjectName && (
              <span>
                Subject: <strong className="text-foreground">{material.subjectName}</strong>
              </span>
            )}
            {material.batchName && (
              <span>
                Class/Batch: <strong className="text-foreground">{material.batchName}</strong>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {material.filePath && signedUrl && (
              <Button asChild variant="outline" className="gap-2">
                <a href={signedUrl} download={material.fileName}>
                  <Download className="w-4 h-4" /> Download
                </a>
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
