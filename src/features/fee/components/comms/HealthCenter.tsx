import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ProgressRing, StatTile, PanelHeading } from "./shared";
import type { ContactHealth, DeliveryStats, DayPoint } from "../../utils/feeCommsCalc";

// ─────────────────────────────────────────────────────────────────────────────
// Fee Communication Health Center — contact quality + delivery health at a
// glance. Pure presentation: every number is computed by feeCommsCalc and
// passed in. No data logic here.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  contact: ContactHealth;
  delivery: DeliveryStats;
  score: number;
  daily: DayPoint[];
  monthly: DayPoint[];
  loading?: boolean;
}

export const HealthCenter: React.FC<Props> = ({ contact, delivery, score, daily, monthly, loading }) => {
  return (
    <div className="space-y-6">
      <PanelHeading
        title="Communication Health Center"
        desc="Contact reachability and receipt delivery across Email + WhatsApp."
      />

      {/* Rings */}
      <div className="glass-card p-6 grid grid-cols-2 md:grid-cols-4 gap-4 place-items-center">
        <ProgressRing value={score} label="Health Score" sub="contacts + delivery" />
        <ProgressRing value={contact.contactScore} label="Contact Score" sub={`${contact.total} students`} />
        <ProgressRing value={delivery.emailSuccessRate} label="Email Success" sub={`${delivery.emailTotal} sent`} />
        <ProgressRing value={delivery.whatsappSuccessRate} label="WhatsApp Success" sub={`${delivery.whatsappTotal} sent`} />
      </div>

      {/* Contact KPI grid */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contacts</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <StatTile label="Total Students" value={contact.total} />
          <StatTile label="Parent Email" value={contact.emailAvailable} tone="good" />
          <StatTile label="Parent WhatsApp" value={contact.whatsappAvailable} tone="good" />
          <StatTile label="Missing Email" value={contact.missingEmail} tone={contact.missingEmail ? "warn" : "good"} />
          <StatTile label="Missing Mobile" value={contact.missingMobile} tone={contact.missingMobile ? "warn" : "good"} />
          <StatTile label="Invalid Email" value={contact.invalidEmail} tone={contact.invalidEmail ? "bad" : "good"} />
          <StatTile label="Invalid Mobile" value={contact.invalidMobile} tone={contact.invalidMobile ? "bad" : "good"} />
          <StatTile label="Duplicate Email" value={contact.duplicateEmail} tone={contact.duplicateEmail ? "warn" : "good"} />
          <StatTile label="Duplicate Mobile" value={contact.duplicateMobile} tone={contact.duplicateMobile ? "warn" : "good"} />
        </div>
      </div>

      {/* Delivery KPI grid */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Delivery</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <StatTile label="Delivered" value={delivery.delivered + delivery.read} tone="good" />
          <StatTile label="Read" value={delivery.read} tone="good" />
          <StatTile label="Failed" value={delivery.failed} tone={delivery.failed ? "bad" : "good"} />
          <StatTile label="Bounced Emails" value={delivery.bounced} tone={delivery.bounced ? "bad" : "good"} />
          <StatTile label="Retry Queue" value={delivery.retrying} tone={delivery.retrying ? "warn" : "good"} />
          <StatTile label="Pending Queue" value={delivery.pending} tone={delivery.pending ? "warn" : "good"} />
        </div>
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Daily Delivery</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : daily.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No delivery activity yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={daily} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={10} tickFormatter={(d) => String(d).slice(5)} />
                <YAxis fontSize={10} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="success" stroke="#16a34a" fill="#16a34a22" name="Success" />
                <Area type="monotone" dataKey="failed" stroke="#dc2626" fill="#dc262622" name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="glass-card p-4">
          <p className="text-sm font-semibold text-foreground mb-3">Monthly Success Rate</p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : monthly.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">No monthly data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={monthly} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis fontSize={10} domain={[0, 100]} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line type="monotone" dataKey="successRate" stroke="#2563eb" strokeWidth={2} name="Success %" dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Channel volume */}
      <div className="glass-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3">Channel Volume</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={[
              { channel: "Email", total: delivery.emailTotal },
              { channel: "WhatsApp", total: delivery.whatsappTotal },
            ]}
            margin={{ top: 4, right: 8, bottom: 4, left: -20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="channel" fontSize={11} />
            <YAxis fontSize={10} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} name="Messages" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
