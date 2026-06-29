import { useState } from "react";
import { History, Search, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommsPageShell } from "../components/CommsPageShell";
import { CommunicationTimeline } from "../components/CommunicationTimeline";
import { useStudentCandidates } from "../hooks/useRecipientCandidates";

interface Selected {
  studentId?: string;
  phone?: string;
  name: string;
}

const CommunicationTimelinePage = () => {
  const [search, setSearch] = useState("");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const { data: students = [], isLoading } = useStudentCandidates({ search });

  return (
    <CommsPageShell
      title="Communication Timeline"
      description="Complete WhatsApp / email history for any student or parent — date, event, channel, template, provider, delivery, read and retries. Reads the live message queue."
      icon={<History className="w-5 h-5" />}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Find a recipient</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Search students / parents</Label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="Name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-72 overflow-auto rounded-md border divide-y">
              {isLoading ? (
                <p className="text-xs text-muted-foreground p-3">Searching…</p>
              ) : students.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No matches.</p>
              ) : (
                students.slice(0, 50).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelected({ studentId: s.id, phone: s.phone, name: s.name })}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 ${
                      selected?.studentId === s.id ? "bg-muted" : ""
                    }`}
                  >
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="truncate">{s.name}</span>
                    {s.phone && <span className="ml-auto text-[11px] text-muted-foreground">{s.phone}</span>}
                  </button>
                ))
              )}
            </div>

            <div>
              <Label className="text-xs">…or look up by phone</Label>
              <Input
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && phone.trim()) setSelected({ phone: phone.trim(), name: phone.trim() });
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selected ? `History — ${selected.name}` : "History"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CommunicationTimeline studentId={selected?.studentId} phone={selected?.phone} />
          </CardContent>
        </Card>
      </div>
    </CommsPageShell>
  );
};

export default CommunicationTimelinePage;
