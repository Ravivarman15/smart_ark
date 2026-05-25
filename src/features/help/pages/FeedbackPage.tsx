import { useState, type FormEvent } from "react";
import { Heart, Send, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { HelpPageShell } from "../components";
import { useCreateFeedback } from "../hooks";
import type { FeedbackKind } from "../types/help.types";

const KIND_LABEL: Record<FeedbackKind, string> = {
  suggestion: "Suggestion / idea",
  bug: "Bug report",
  praise: "Praise",
  complaint: "Complaint",
  nps: "Rate the product (NPS)",
};

const MODULES = [
  "general",
  "students",
  "fees",
  "exams",
  "attendance",
  "communication",
  "reports",
  "finance",
  "setup",
  "settings",
];

export const FeedbackPage = () => {
  const { toast } = useToast();
  const create = useCreateFeedback();
  const [kind, setKind] = useState<FeedbackKind>("suggestion");
  const [module, setModule] = useState<string>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [score, setScore] = useState<number>(8);
  const [anon, setAnon] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (kind !== "nps" && !title.trim() && !body.trim()) {
      toast({ title: "Add a title or details", variant: "destructive" });
      return;
    }
    await create.mutateAsync({
      kind,
      module: module === "general" ? undefined : module,
      title: title.trim() || undefined,
      body: body.trim() || undefined,
      score: kind === "nps" ? score : undefined,
      isAnonymous: anon,
      isPublic,
    });
    toast({ title: "Thanks — feedback recorded" });
    setTitle("");
    setBody("");
  };

  return (
    <HelpPageShell
      title="Share feedback"
      description="Suggest improvements, flag bugs, or tell us how likely you'd recommend ARK."
      icon={<Heart className="w-5 h-5" />}
    >
      <Card className="p-6 max-w-3xl mx-auto">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Feedback type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as FeedbackKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as FeedbackKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Module (optional)</Label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {kind === "nps" ? (
            <div>
              <Label>How likely are you to recommend ARK? (0–10)</Label>
              <div className="flex gap-1 mt-2 flex-wrap">
                {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(n)}
                    className={`w-9 h-9 rounded-md border text-sm font-medium ${
                      score === n
                        ? "bg-violet-600 text-white border-violet-700"
                        : "bg-white hover:bg-violet-50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                0 = not at all · 10 = extremely likely
              </p>
            </div>
          ) : (
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary"
                maxLength={200}
              />
            </div>
          )}

          <div>
            <Label htmlFor="body">Details (optional)</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Anything else we should know?"
              maxLength={4000}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="anon" checked={anon} onCheckedChange={setAnon} />
                <Label htmlFor="anon" className="text-xs cursor-pointer">
                  Submit anonymously
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="public" checked={isPublic} onCheckedChange={setIsPublic} />
                <Label htmlFor="public" className="text-xs cursor-pointer">
                  Show on public board
                </Label>
              </div>
            </div>
            <Button type="submit" disabled={create.isPending}>
              <Send className="w-4 h-4 mr-2" />
              {create.isPending ? "Sending…" : "Send feedback"}
            </Button>
          </div>
        </form>
        <div className="mt-6 p-3 rounded-md bg-violet-50 border border-violet-200 text-xs text-violet-700 flex gap-2">
          <Sparkles className="w-4 h-4 mt-0.5" />
          <span>
            High-impact suggestions get added to the public roadmap and other
            users can upvote them.
          </span>
        </div>
      </Card>
    </HelpPageShell>
  );
};

export default FeedbackPage;
