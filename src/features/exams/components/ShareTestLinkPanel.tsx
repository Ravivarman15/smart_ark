import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useIssueTestLink,
  useRevokeTestLink,
  useTestLink,
} from "../hooks/useTestLink";
import { publicTestUrl, type IdentityField } from "../services/onlineTest.service";

// ─────────────────────────────────────────────────────────────────────────────
// SHARE PANEL — turning a test into a link anyone can open.
//
// The dangerous action here is not creating a link; it is REPLACING one. A
// panel that regenerated the token whenever it opened, or whenever a setting
// changed, would break the link every student is already holding — possibly
// while they are sitting the test. So rotation is a separate, confirmed action
// and everything else reuses the existing token.
// ─────────────────────────────────────────────────────────────────────────────

const ALL_FIELDS: { id: IdentityField; label: string; hint: string }[] = [
  { id: "name", label: "Name", hint: "Always asked — it is how results are labelled" },
  { id: "email", label: "Email", hint: "Ask only if you need to reach them afterwards" },
  { id: "mobile", label: "Mobile", hint: "Ask only if you need to reach them afterwards" },
];

interface Props {
  examId: string;
  examTitle: string;
}

export const ShareTestLinkPanel = ({ examId, examTitle }: Props) => {
  const { data: link, isLoading } = useTestLink(examId);
  const issue = useIssueTestLink(examId);
  const revoke = useRevokeTestLink(examId);
  const confirm = useConfirm();

  const [copied, setCopied] = useState(false);
  const [pin, setPin] = useState("");
  const [pinOn, setPinOn] = useState(false);

  const url = link?.token ? publicTestUrl(link.token) : "";

  const copy = async () => {
    if (!url) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (typeof document !== "undefined") {
        const textArea = document.createElement("textarea");
        textArea.value = url;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the link and copy it manually.");
    }
  };

  const toggleField = (field: IdentityField) => {
    const current = link?.identityFields ?? ["name"];
    const next = current.includes(field)
      ? current.filter((f) => f !== field)
      : [...current, field];
    // Name is the floor: without at least one identifying field, two takers
    // cannot be told apart and the attempt limit means nothing.
    issue.mutate({ identityFields: next.length > 0 ? next : ["name"] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading link…
      </div>
    );
  }

  // ── Nothing shared yet ────────────────────────────────────────────────────
  if (!link?.token) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-3">
          <Link2 className="w-5 h-5 text-accent" />
        </div>
        <p className="text-sm font-medium text-foreground">Share this test with a link</p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-sm mx-auto">
          Anyone with the link can take “{examTitle}”. They do not need an account,
          and they will see your institution’s branding — not ours.
        </p>
        <Button
          className="mt-4"
          size="sm"
          disabled={issue.isPending}
          onClick={() => issue.mutate({ identityFields: ["name"] })}
        >
          {issue.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating secure link...
            </>
          ) : (
            <>
              <Link2 className="w-4 h-4 mr-2" />
              Create link
            </>
          )}
        </Button>
      </div>
    );
  }

  const revoked = !!link.revokedAt;
  const expired =
    !!link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();

  return (
    <div className="space-y-5">
      {/* ── The link ───────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs font-semibold">Public link</Label>
          <StatusChip active={link.active} revoked={revoked} expired={expired} />
        </div>
        <div className="flex gap-2">
          <Input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={copy}
            className="shrink-0"
            title="Copy link"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 mr-1.5 text-accent" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 mr-1.5" />
                Copy link
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Open in a new tab"
            className="shrink-0"
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="w-4 h-4 mr-1.5" />
            Open test
          </Button>
        </div>
        {!link.active && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {revoked
              ? "This link has been turned off. Anyone opening it sees “not available”."
              : "This link has expired."}
          </p>
        )}
      </div>

      {/* ── Metadata summary ─────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Test:</span>
          <span className="font-medium text-foreground truncate max-w-[240px]">{examTitle}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Link status:</span>
          <span className="font-medium text-foreground">
            {link.active ? "Active" : revoked ? "Revoked" : expired ? "Expired" : "Inactive"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Expires:</span>
          <span className="font-medium text-foreground">
            {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "Never"}
          </span>
        </div>
      </div>

      {/* ── What we ask the taker ──────────────────────────────────────────── */}
      <div>
        <Label className="text-xs font-semibold">Ask each person for</Label>
        <div className="mt-2 space-y-2.5">
          {ALL_FIELDS.map((f) => (
            <div key={f.id} className="flex items-start gap-3">
              <Switch
                id={`field-${f.id}`}
                checked={link.identityFields.includes(f.id)}
                disabled={f.id === "name" || issue.isPending}
                onCheckedChange={() => toggleField(f.id)}
              />
              <div className="min-w-0">
                <Label htmlFor={`field-${f.id}`} className="text-sm cursor-pointer">
                  {f.label}
                </Label>
                <p className="text-[11px] text-muted-foreground">{f.hint}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-2.5">
          Collect only what you will actually use — every extra field is personal
          data you become responsible for.
        </p>
      </div>

      {/* ── PIN ────────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3">
          <Switch
            id="pin-on"
            checked={pinOn || link.requiresPin}
            onCheckedChange={(on) => {
              setPinOn(on);
              if (!on && link.requiresPin) issue.mutate({ pin: null });
            }}
          />
          <Label htmlFor="pin-on" className="text-sm cursor-pointer">
            Require a PIN
          </Label>
        </div>
        {(pinOn || link.requiresPin) && (
          <div className="flex gap-2 mt-2.5">
            <Input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder={link.requiresPin ? "PIN is set — type to change it" : "e.g. 4821"}
              className="max-w-[200px]"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!pin.trim() || issue.isPending}
              onClick={() => {
                issue.mutate({ pin: pin.trim() });
                setPin("");
                toast.success("PIN updated");
              }}
            >
              Save PIN
            </Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2">
          A PIN stops the link working if it is forwarded, but everyone shares the
          same one — it is a speed bump, not an identity check.
        </p>
      </div>

      {/* ── Dangerous controls ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
        {link.active ? (
          <Button
            variant="outline"
            size="sm"
            disabled={revoke.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: "Turn off this link?",
                description:
                  "Anyone opening it will see “not available”, including students " +
                  "part-way through. Attempts already submitted are unaffected.",
                confirmText: "Turn off link",
                type: "danger",
              });
              if (ok) revoke.mutate();
            }}
          >
            <ShieldAlert className="w-4 h-4 mr-2" /> Turn off link
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={issue.isPending}
            onClick={() => issue.mutate({})}
          >
            <Link2 className="w-4 h-4 mr-2" /> Turn link back on
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          disabled={issue.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: "Replace the link?",
              description:
                "The current link stops working immediately. Anyone who already " +
                "has it — including students sitting the test right now — will be " +
                "cut off and will need the new one.",
              confirmText: "Replace link",
              type: "danger",
            });
            if (ok) issue.mutate({ rotate: true });
          }}
        >
          <RefreshCw className="w-4 h-4 mr-2" /> Replace link
        </Button>
      </div>
    </div>
  );
};

const StatusChip = ({
  active,
  revoked,
  expired,
}: {
  active: boolean;
  revoked: boolean;
  expired: boolean;
}) => {
  const [label, cls] = active
    ? ["Live", "bg-accent/10 text-accent"]
    : revoked
      ? ["Turned off", "bg-destructive/10 text-destructive"]
      : expired
        ? ["Expired", "bg-muted text-muted-foreground"]
        : ["Not shared", "bg-muted text-muted-foreground"];

  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${cls}`}>
      {label}
    </span>
  );
};
