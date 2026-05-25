import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LifeBuoy, Send } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { HelpPageShell, PriorityChip, TicketStatusPill } from "../components";
import { useCreateTicket } from "../hooks";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  SLA_DEFAULTS,
  formatDuration,
} from "../utils/helpCalc";
import type {
  TicketCategory,
  TicketPriority,
} from "../types/help.types";

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  general: "General",
  fee: "Fees & payments",
  exam: "Exams",
  attendance: "Attendance",
  student: "Student",
  staff: "Staff",
  login: "Login / access",
  app_bug: "App bug",
  feature_request: "Feature request",
  other: "Other",
};

const baseHistoryPath = (role?: string): string => {
  if (role === "admin") return "/admin/help/history";
  if (role === "management") return "/management/help/history";
  if (role === "coordinator") return "/coordinator/help/history";
  return "/teacher/help/history";
};

export const SupportRequestPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const create = useCreateTicket();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TicketCategory>("general");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [phone, setPhone] = useState("");
  const sla = SLA_DEFAULTS[priority];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 3) {
      toast({ title: "Subject is too short", variant: "destructive" });
      return;
    }
    try {
      const ticket = await create.mutateAsync({
        subject: subject.trim(),
        description: description.trim() || undefined,
        category,
        priority,
        requesterPhone: phone.trim() || undefined,
        pagePath: location.pathname,
      });
      toast({
        title: `Ticket #${ticket.ticketNo ?? ""} raised`,
        description: "Our support team has been notified.",
      });
      navigate(`${baseHistoryPath(user?.role)}/${ticket.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please try again.";
      toast({
        title: "Could not raise ticket",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <HelpPageShell
      title="Raise a support request"
      description="Tell us what's wrong. We'll triage and reply within the response SLA."
      icon={<LifeBuoy className="w-5 h-5" />}
    >
      <Card className="p-6 max-w-3xl mx-auto">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="subject">Subject *</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short summary of the issue"
              required
              minLength={3}
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TicketCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      <span className="capitalize">{p}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Describe the issue</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Steps to reproduce, what you expected vs what happened, any error message…"
              maxLength={8000}
            />
          </div>

          <div>
            <Label htmlFor="phone">Contact phone (optional)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="If we need to call you back"
              maxLength={40}
            />
          </div>

          <Card className="p-3 bg-sky-50 border-sky-200 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sky-700 font-medium">Expected SLA:</span>
              <PriorityChip priority={priority} />
              <TicketStatusPill status="open" />
              <span className="text-sky-700">
                · first response in {formatDuration(sla.firstResponse)}, resolution within{" "}
                {formatDuration(sla.resolution)}
              </span>
            </div>
          </Card>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(baseHistoryPath(user?.role))}
            >
              View my tickets
            </Button>
            <Button type="submit" disabled={create.isPending}>
              <Send className="w-4 h-4 mr-2" />
              {create.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        </form>
      </Card>
    </HelpPageShell>
  );
};

export default SupportRequestPage;
