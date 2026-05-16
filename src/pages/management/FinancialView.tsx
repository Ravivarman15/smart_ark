import React from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { useAuth } from "@/contexts/AuthContext";
import { DollarSign, TrendingUp, Lock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const FinancialView: React.FC = () => {
  const { feeRecords, feeTrend, admissionCalls, expenses, campuses } = useAppData();
  const { user } = useAuth();

  const role = user?.role || "admin";
  const isManagement = role === "management";
  const isCoordinator = role === "coordinator";

  const paid = feeRecords.filter(f => f.paid).length;
  const total = feeRecords.length;
  const feePercent = total > 0 ? Math.round((paid / total) * 100) : 0;
  const totalCollected = feeRecords.filter(f => f.paid).reduce((acc, f) => acc + f.amount, 0);
  const pendingAmount = feeRecords.filter(f => !f.paid).reduce((acc, f) => acc + f.amount, 0);
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netSurplus = totalCollected - totalExpenses;

  const converted = admissionCalls.filter(c => c.status === "converted").length;
  const admissionConversion = admissionCalls.length > 0 ? Math.round((converted / admissionCalls.length) * 100) : 0;

  const campusData = campuses.map(c => {
    const campusFees = feeRecords.filter(f => f.campus === c);
    const campusPaid = campusFees.filter(f => f.paid).length;
    const campusTotal = campusFees.length;
    return {
      campus: c.replace(" Campus", ""),
      collected: campusTotal > 0 ? Math.round((campusPaid / campusTotal) * 100) : 0,
      pending: campusFees.filter(f => !f.paid).reduce((acc, f) => acc + f.amount, 0) / 1000,
    };
  });

  const dayOfMonth = new Date().getDate();
  const collectionProgress = feePercent;

  // Admin should NOT see this page - show 403
  if (role === "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <Lock className="w-12 h-12 text-ark-danger/50" />
        <h1 className="text-xl font-display font-bold text-foreground">Access Restricted</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          Financial summary data is restricted to Management role only.
          Admin users can manage individual fee entries from the Fees & Admission page.
        </p>
        <p className="text-xs text-ark-danger">403 Forbidden — Insufficient permissions</p>
      </div>
    );
  }

  // Coordinator: show % only, no absolute values
  if (isCoordinator) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Financial Progress</h1>
        <div className="grid grid-cols-2 gap-3">
          <div className="metric-card border-accent/30">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Collection Progress</span>
            <p className="text-2xl font-display font-bold text-foreground">{feePercent}%</p>
            <div className="w-full bg-muted rounded-full h-2"><div className="bg-accent rounded-full h-2 transition-all" style={{ width: `${feePercent}%` }} /></div>
          </div>
          <div className="metric-card">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Conversion Rate</span>
            <p className="text-2xl font-display font-bold text-accent">{admissionConversion}%</p>
          </div>
        </div>
        <div className="glass-card p-4 md:p-5">
          <h2 className="font-display font-semibold text-foreground mb-3">Collection vs 7th Target (90%)</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="w-full bg-muted rounded-full h-4 relative overflow-hidden">
                <div className="bg-accent rounded-full h-4 transition-all duration-500" style={{ width: `${Math.min(100, (collectionProgress / 90) * 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Current: {collectionProgress}%</span>
                <span>Target: 90% by 7th</span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          <Lock className="w-3 h-3 inline mr-1" />Absolute financial values restricted to Management role
        </p>
      </div>
    );
  }

  // Management: Full visibility
  return (
    <div className="space-y-6">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Financial Stability View</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="metric-card border-accent/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Collection</span>
            <DollarSign className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-display font-bold text-foreground">{feePercent}%</p>
          <div className="w-full bg-muted rounded-full h-2"><div className="bg-accent rounded-full h-2 transition-all" style={{ width: `${feePercent}%` }} /></div>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Total Revenue</span>
          <p className="text-2xl font-display font-bold text-ark-success">₹{(totalCollected / 1000).toFixed(0)}K</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Pending</span>
          <p className="text-2xl font-display font-bold text-ark-warning">₹{(pendingAmount / 1000).toFixed(0)}K</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Expenses</span>
          <p className="text-2xl font-display font-bold text-ark-danger">₹{(totalExpenses / 1000).toFixed(0)}K</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Net Surplus</span>
          <p className={`text-2xl font-display font-bold ${netSurplus >= 0 ? "text-ark-success" : "text-ark-danger"}`}>₹{(netSurplus / 1000).toFixed(0)}K</p>
        </div>
        <div className="metric-card">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Conversion</span>
          <p className="text-2xl font-display font-bold text-accent">{admissionConversion}%</p>
          <p className="text-xs text-muted-foreground">{converted} admissions</p>
        </div>
      </div>

      {/* 7th Target Progress */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-3">Collection vs 7th Target (90%)</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="w-full bg-muted rounded-full h-4 relative overflow-hidden">
              <div className="bg-accent rounded-full h-4 transition-all duration-500" style={{ width: `${Math.min(100, (collectionProgress / 90) * 100)}%` }} />
              <div className="absolute right-[10%] top-0 h-4 w-0.5 bg-foreground/50" />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Current: {collectionProgress}%</span>
              <span>Target: 90% by 7th</span>
            </div>
          </div>
          <span className={`text-sm font-bold ${collectionProgress >= 90 ? "text-ark-success" : dayOfMonth <= 7 ? "text-accent" : "text-ark-danger"}`}>
            {dayOfMonth <= 7 ? `${7 - dayOfMonth} days left` : collectionProgress >= 90 ? "✓ Met" : "Missed"}
          </span>
        </div>
      </div>

      {/* Campus-wise comparison */}
      {campusData.length > 0 && (
        <div className="glass-card p-4 md:p-5">
          <h2 className="font-display font-semibold text-foreground mb-4">Campus-wise Fee Comparison</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {campusData.map((c, i) => (
              <div key={i} className="p-4 rounded-lg bg-muted/20 border border-border/50 text-center">
                <p className="font-medium text-foreground text-sm">{c.campus}</p>
                <p className={`text-2xl font-bold mt-1 ${c.collected >= 90 ? "text-ark-success" : c.collected >= 75 ? "text-accent" : "text-ark-danger"}`}>{c.collected}%</p>
                <p className="text-xs text-muted-foreground">Pending ₹{c.pending.toFixed(0)}K</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue Trend */}
      <div className="glass-card p-4 md:p-5">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" /> 6-Month Revenue Trend
        </h2>
        {feeTrend.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-lg">
            No revenue trend data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={feeTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(213 30% 25%)" />
              <XAxis dataKey="month" stroke="hsl(213 20% 60%)" fontSize={12} />
              <YAxis stroke="hsl(213 20% 60%)" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(213 60% 16%)", border: "1px solid hsl(213 30% 25%)", borderRadius: "8px", color: "#fff" }} />
              <Line type="monotone" dataKey="collected" name="Collected %" stroke="hsl(45 100% 51%)" strokeWidth={3} dot={{ fill: "hsl(45 100% 51%)", r: 4 }} />
              <Line type="monotone" dataKey="target" name="Target %" stroke="hsl(213 50% 28%)" strokeWidth={2} strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default FinancialView;
