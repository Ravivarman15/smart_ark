import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Loader2, Plus, Crosshair, CheckCircle2, AlertTriangle, Trash2, Navigation,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  checkinService, parseMapsUrl, readDevicePosition, haversineMeters,
  DEFAULT_RADIUS_METERS,
  type CheckinLocation, type CheckinMode,
} from "../services/checkin.service";

// ──────────────────────────────────────────────────────────────────────────────
// SETTINGS → CHECK-IN & CHECK-OUT
//
// Replaces two GPS coordinates that were hardcoded in AppDataContext with an
// organization-scoped configuration. Every tenant chooses its own mode, its own
// locations and its own radius per location.
//
// ┌── WHY THERE IS AN "ENFORCE" TOGGLE INSIDE GEO MODE ────────────────────┐
// │ ARK's existing check-in RECORDS location and never blocks: the         │
// │ check-in succeeds inside the radius, outside it, and when the browser  │
// │ denies permission. Offering only Normal / Location-Verified would have │
// │ forced ARK into one of two behaviours it does not currently have —     │
// │ either losing its geofence or starting to reject staff.                │
// └────────────────────────────────────────────────────────────────────────┘
// ──────────────────────────────────────────────────────────────────────────────

const KEY_SETTINGS = ["checkin", "settings"] as const;
const KEY_LOCATIONS = ["checkin", "locations"] as const;

const ModeCard: React.FC<{
  selected: boolean; title: string; body: string; onSelect: () => void; disabled?: boolean;
}> = ({ selected, title, body, onSelect, disabled }) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={disabled}
    className={cn(
      "flex-1 rounded-lg border p-4 text-left transition-colors",
      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40",
      disabled && "cursor-not-allowed opacity-60",
    )}
  >
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span
        className={cn(
          "h-3.5 w-3.5 shrink-0 rounded-full border-2",
          selected ? "border-primary bg-primary" : "border-muted-foreground/40",
        )}
      />
      {title}
    </div>
    <p className="mt-1.5 text-xs text-muted-foreground">{body}</p>
  </button>
);

const LocationDialog: React.FC<{
  open: boolean;
  initial: CheckinLocation | null;
  onClose: () => void;
  onSaved: () => void;
}> = ({ open, initial, onClose, onSaved }) => {
  const blank = {
    name: "", address: "", mapsUrl: "",
    lat: "" as string, lng: "" as string,
    radius: String(DEFAULT_RADIUS_METERS),
    isCheckinLocation: true, isActive: true,
  };
  const [f, setF] = useState(blank);

  // Re-seed when the dialog opens on a different row.
  React.useEffect(() => {
    if (!open) return;
    setF(
      initial
        ? {
            name: initial.name, address: initial.address, mapsUrl: initial.mapsUrl,
            lat: initial.lat == null ? "" : String(initial.lat),
            lng: initial.lng == null ? "" : String(initial.lng),
            radius: String(initial.radiusMeters ?? DEFAULT_RADIUS_METERS),
            isCheckinLocation: initial.isCheckinLocation, isActive: initial.isActive,
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const applyMapsUrl = (value: string) => {
    const parsed = parseMapsUrl(value);
    if (parsed) {
      setF((p) => ({ ...p, mapsUrl: value, lat: String(parsed.lat), lng: String(parsed.lng) }));
      toast.success("Coordinates read from the link");
    } else {
      // Not a failure worth an error toast — short links genuinely carry no
      // coordinates. The point is that nothing is guessed.
      setF((p) => ({ ...p, mapsUrl: value }));
    }
  };

  const useMyLocation = async () => {
    const pos = await readDevicePosition();
    if (!pos.ok) {
      toast.error(
        pos.reason === "permission_denied"
          ? "Location permission denied — enter the coordinates instead."
          : "Location unavailable on this device — enter the coordinates instead.",
      );
      return;
    }
    setF((p) => ({ ...p, lat: String(pos.lat), lng: String(pos.lng) }));
    toast.success(`Coordinates captured (±${Math.round(pos.accuracy ?? 0)} m)`);
  };

  const save = useMutation({
    mutationFn: () =>
      checkinService.saveLocation({
        id: initial?.id,
        name: f.name,
        address: f.address,
        mapsUrl: f.mapsUrl,
        lat: f.lat === "" ? null : Number(f.lat),
        lng: f.lng === "" ? null : Number(f.lng),
        radiusMeters: f.radius === "" ? null : Number(f.radius),
        isActive: f.isActive,
        isCheckinLocation: f.isCheckinLocation,
      }),
    onSuccess: () => { toast.success("Location saved"); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const coordsOk = f.lat !== "" && f.lng !== "" &&
    Math.abs(Number(f.lat)) <= 90 && Math.abs(Number(f.lng)) <= 180;
  const addressOk = f.address.trim() !== "";
  const radiusOk = f.radius !== "" && Number.isFinite(Number(f.radius)) && Number(f.radius) >= 10;
  // A verified location is only usable when all three are present. Saving two
  // of the three would create a geofence nobody can audit.
  const verifiedReady = !f.isCheckinLocation || (coordsOk && addressOk && radiusOk);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit location" : "Add location"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="loc-name">Location name</Label>
            <Input id="loc-name" value={f.name} placeholder="Anna Nagar Branch"
              onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="loc-addr">
              Address {f.isCheckinLocation && <span className="text-destructive">*</span>}
            </Label>
            <Input id="loc-addr" value={f.address}
              placeholder="No 12, Second Avenue, Anna Nagar, Chennai 600040"
              onChange={(e) => setF({ ...f, address: e.target.value })} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Required for a verified location. Coordinates alone cannot be
              reviewed by a person — the address is how you confirm the geofence
              sits on the right building.
            </p>
          </div>

          <div>
            <Label htmlFor="loc-maps">Google Maps link</Label>
            <Input id="loc-maps" value={f.mapsUrl}
              placeholder="https://maps.google.com/… or 13.0059, 80.1961"
              onChange={(e) => applyMapsUrl(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Coordinates are read from the link when it contains them. Short
              links (maps.app.goo.gl) do not — open the link first, then paste
              the full URL, or enter the coordinates below.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label htmlFor="loc-lat">Latitude</Label>
              <Input id="loc-lat" value={f.lat} inputMode="decimal"
                onChange={(e) => setF({ ...f, lat: e.target.value.trim() })} />
            </div>
            <div>
              <Label htmlFor="loc-lng">Longitude</Label>
              <Input id="loc-lng" value={f.lng} inputMode="decimal"
                onChange={(e) => setF({ ...f, lng: e.target.value.trim() })} />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" onClick={useMyLocation}>
                <Crosshair className="mr-2 h-4 w-4" /> Use my location
              </Button>
            </div>
          </div>

          <div>
            <Label htmlFor="loc-radius">
              Allowed radius (metres) {f.isCheckinLocation && <span className="text-destructive">*</span>}
            </Label>
            <Input id="loc-radius" value={f.radius} inputMode="numeric"
              onChange={(e) => setF({ ...f, radius: e.target.value.trim() })} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Staff standing within this many metres of the address above are
              verified. 200 m means anyone inside a 200 m circle passes. A small
              campus might use 100 m; a large one 300 m.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="text-sm font-medium">Use for check-in</div>
              <p className="text-xs text-muted-foreground">
                Staff standing here can be verified. Needs coordinates.
              </p>
            </div>
            <Switch checked={f.isCheckinLocation}
              onCheckedChange={(v) => setF({ ...f, isCheckinLocation: v })} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="text-sm font-medium">Active</div>
            <Switch checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
          </div>

          {f.isCheckinLocation && !verifiedReady && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                A verified location needs
                {!addressOk && <strong> its address</strong>}
                {!addressOk && (!coordsOk || !radiusOk) && ","}
                {!coordsOk && <strong> valid coordinates</strong>}
                {!coordsOk && !radiusOk && " and"}
                {!radiusOk && <strong> a radius of at least 10 m</strong>}.
                Nothing is estimated — paste a Maps link, use your current
                location, or type the values in.
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !f.name.trim() || !verifiedReady}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Live check against the real configuration. Never writes attendance. */
const LocationTester: React.FC<{ locations: CheckinLocation[]; defaultRadius: number }> = ({
  locations, defaultRadius,
}) => {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    lat: number; lng: number; accuracy: number | null;
    nearest: CheckinLocation | null; distance: number | null; radius: number; ok: boolean;
  }>(null);

  const run = async () => {
    setBusy(true);
    try {
      const pos = await readDevicePosition();
      if (!pos.ok) {
        toast.error(
          pos.reason === "permission_denied"
            ? "Location permission denied."
            : "Location unavailable on this device.",
        );
        setResult(null);
        return;
      }
      // Computed client-side from the same rows the server uses. This is a
      // PREVIEW; the real check-in is resolved by the database, which is the
      // only place the answer counts.
      const usable = locations.filter((l) => l.isCheckinLocation && l.isActive && l.lat != null && l.lng != null);
      let nearest: CheckinLocation | null = null;
      let distance: number | null = null;
      for (const l of usable) {
        const d = haversineMeters(pos.lat, pos.lng, l.lat as number, l.lng as number);
        if (distance == null || d < distance) { distance = d; nearest = l; }
      }
      const radius = nearest?.radiusMeters ?? defaultRadius;
      setResult({
        lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy,
        nearest, distance, radius,
        ok: distance != null && distance <= radius,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Test location</div>
          <p className="text-xs text-muted-foreground">
            Checks where you are against the configuration. This is a test — no
            attendance is recorded.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4" />}
          Run test
        </Button>
      </div>

      {result && (
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Your coordinates</dt>
            <dd className="font-mono">{result.lat.toFixed(6)}, {result.lng.toFixed(6)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Reported accuracy</dt>
            <dd>{result.accuracy == null ? "—" : `±${Math.round(result.accuracy)} m`}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Nearest location</dt>
            <dd className="font-medium">{result.nearest?.name ?? "None configured"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Distance</dt>
            <dd>{result.distance == null ? "—" : `${Math.round(result.distance)} m`}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Allowed radius</dt>
            <dd>{result.radius} m</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Result</dt>
            <dd className={cn("font-semibold", result.ok ? "text-emerald-600" : "text-destructive")}>
              {result.ok ? "✓ Check-in permitted" : "Outside allowed location"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
};

export const CheckinSettingsPage: React.FC = () => {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; row: CheckinLocation | null }>({
    open: false, row: null,
  });

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: KEY_SETTINGS,
    queryFn: () => checkinService.settings(),
  });
  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: KEY_LOCATIONS,
    queryFn: () => checkinService.locations(),
  });

  const refresh = () => {
    checkinService.invalidate();
    qc.invalidateQueries({ queryKey: ["checkin"] });
  };

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof checkinService.saveSettings>[0]) =>
      checkinService.saveSettings(patch),
    onSuccess: () => { toast.success("Check-in settings saved"); refresh(); },
    // The database refuses geo mode with no configured location, and its
    // message names the reason — surfaced verbatim rather than replaced.
    onError: (e: Error) => toast.error(e.message),
  });

  if (loadingSettings || loadingLocations) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading check-in settings…
      </div>
    );
  }

  const mode: CheckinMode = settings?.mode ?? "normal";
  const usable = locations.filter((l) => l.isCheckinLocation && l.isActive && l.lat != null);
  const canEnableGeo = usable.length > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Check-in &amp; Check-out</h1>
        <p className="text-sm text-muted-foreground">
          How your staff record their attendance, and where they are allowed to do it.
        </p>
      </div>

      {/* ── Mode ── */}
      <section className="space-y-4 rounded-lg border border-border p-5">
        <div>
          <h2 className="text-sm font-semibold">Verification mode</h2>
          <p className="text-xs text-muted-foreground">Applies to your organization only.</p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <ModeCard
            selected={mode === "normal"}
            title="Normal"
            body="No location verification. Staff check in without granting location permission."
            onSelect={() => mode !== "normal" && save.mutate({ mode: "normal" })}
          />
          <ModeCard
            selected={mode === "geo"}
            title="Location verified"
            body="Staff must be at one of your configured locations. Their position is recorded with each check-in."
            onSelect={() => mode !== "geo" && save.mutate({ mode: "geo" })}
            disabled={!canEnableGeo && mode !== "geo"}
          />
        </div>

        {!canEnableGeo && mode !== "geo" && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Configure at least one verified location before enabling location verification.
          </p>
        )}

        {mode === "geo" && (
          <>
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <div className="text-sm font-medium">Reject check-ins outside a location</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Off: the position is recorded and flagged, and the check-in still goes
                  through for approval. On: staff outside every radius cannot check in at all.
                </p>
              </div>
              <Switch
                checked={settings?.enforced ?? false}
                onCheckedChange={(v) => save.mutate({ enforced: v })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="def-radius">Default radius (metres)</Label>
                <Input
                  id="def-radius"
                  defaultValue={String(settings?.defaultRadiusMeters ?? DEFAULT_RADIUS_METERS)}
                  inputMode="numeric"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 10 && v !== settings?.defaultRadiusMeters) {
                      save.mutate({ defaultRadiusMeters: v });
                    }
                  }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Used by locations that do not set their own.
                </p>
              </div>
              <div>
                <Label htmlFor="min-acc">Flag below accuracy (metres)</Label>
                <Input
                  id="min-acc"
                  defaultValue={settings?.minAccuracyMeters == null ? "" : String(settings.minAccuracyMeters)}
                  inputMode="numeric"
                  placeholder="Leave blank for no accuracy check"
                  onBlur={(e) => {
                    const raw = e.target.value.trim();
                    const v = raw === "" ? null : Number(raw);
                    if (v === null || Number.isFinite(v)) save.mutate({ minAccuracyMeters: v });
                  }}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A phone reporting ±2 km is not proof of anything. Poor readings are
                  flagged, not rejected — GPS is a signal, not identity verification.
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Locations ── */}
      <section className="space-y-4 rounded-lg border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Locations</h2>
            <p className="text-xs text-muted-foreground">
              {usable.length} verified · {locations.length} total
            </p>
          </div>
          <Button size="sm" onClick={() => setDialog({ open: true, row: null })}>
            <Plus className="mr-2 h-4 w-4" /> Add location
          </Button>
        </div>

        {locations.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No locations yet. Add one to enable location-verified check-in.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {locations.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 p-3">
                <MapPin
                  className={cn(
                    "h-4 w-4 shrink-0",
                    l.isCheckinLocation && l.isActive ? "text-primary" : "text-muted-foreground/50",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {l.name}
                    {l.isPrimary && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Primary
                      </span>
                    )}
                    {!l.isActive && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Disabled
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {l.isCheckinLocation
                      ? `${l.lat?.toFixed(5)}, ${l.lng?.toFixed(5)} · ${l.radiusMeters ?? settings?.defaultRadiusMeters ?? DEFAULT_RADIUS_METERS} m`
                      : l.address || "Not used for check-in"}
                  </div>
                </div>
                {l.isCheckinLocation && l.isActive && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                )}
                <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, row: l })}>
                  Edit
                </Button>
              </li>
            ))}
          </ul>
        )}

        <LocationTester
          locations={locations}
          defaultRadius={settings?.defaultRadiusMeters ?? DEFAULT_RADIUS_METERS}
        />
      </section>

      <LocationDialog
        open={dialog.open}
        initial={dialog.row}
        onClose={() => setDialog({ open: false, row: null })}
        onSaved={refresh}
      />
    </div>
  );
};

export default CheckinSettingsPage;
