import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { Activity, BookOpen, DollarSign, TrendingDown, PieChart as PieChartIcon, ArrowRightLeft } from "lucide-react";
import StudentIntelligence from "@/pages/management/StudentIntelligence";

const AnalysisReports: React.FC = () => {
  const [activeTab, setActiveTab] = useState("profit-loss");
  const { feeRecords, expenses, students } = useAppData();

  const tabs = [
    { id: "activity", label: "Students All Activity Reports", icon: Activity },
    { id: "performance", label: "Track Students Performance", icon: BookOpen },
    { id: "enquiry", label: "Students Enquiry Analysis Reports", icon: ArrowRightLeft },
    { id: "fees", label: "Fees Analysis Reports", icon: DollarSign },
    { id: "expense", label: "Expense Analysis Reports", icon: TrendingDown },
    { id: "profit-loss", label: "Profit/Loss Analysis Reports", icon: PieChartIcon },
  ];

  // Profit/Loss Calculations
  const totalFeeCollected = feeRecords.reduce((acc, f) => acc + (f.received || 0), 0);
  const totalFeeRefund = feeRecords.reduce((acc, f) => acc + (f.refund || 0), 0);
  const totalExtraIncome = expenses.filter(e => e.type === "income").reduce((acc, e) => acc + e.amount, 0);
  const totalExpense = expenses.filter(e => e.type === "expense").reduce((acc, e) => acc + e.amount, 0);
  const profitLoss = (totalFeeCollected + totalExtraIncome) - (totalFeeRefund + totalExpense);

  const profitLossData = [
    {
      name: "Current Year",
      "Fee Collection": totalFeeCollected,
      "Fee Refund": totalFeeRefund,
      "Extra Income": totalExtraIncome,
      "Expense": totalExpense,
    }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "performance":
        return <StudentIntelligence />;
        
      case "profit-loss":
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 bg-card border border-border/50 p-4 rounded-xl shadow-sm">
                <div className="text-center p-3 border-r border-border/50">
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Fee Collection</p>
                    <p className="text-lg font-bold text-ark-success mt-1">₹{totalFeeCollected.toLocaleString()}</p>
                </div>
                <div className="text-center p-3 border-r border-border/50">
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Fee Refund</p>
                    <p className="text-lg font-bold text-ark-warning mt-1">₹{totalFeeRefund.toLocaleString()}</p>
                </div>
                <div className="text-center p-3 border-r border-border/50">
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Extra Income</p>
                    <p className="text-lg font-bold text-blue-500 mt-1">₹{totalExtraIncome.toLocaleString()}</p>
                </div>
                <div className="text-center p-3 border-r lg:border-r-0 border-border/50">
                    <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Total Expense</p>
                    <p className="text-lg font-bold text-ark-danger mt-1">₹{totalExpense.toLocaleString()}</p>
                </div>
                <div className={`text-center p-3 col-span-2 lg:col-span-1 rounded-lg ${profitLoss >= 0 ? "bg-ark-success/10" : "bg-ark-danger/10"}`}>
                    <p className={`text-xs uppercase font-bold tracking-wider ${profitLoss >= 0 ? "text-ark-success" : "text-ark-danger"}`}>
                      Profit/Loss
                    </p>
                    <p className={`text-xl font-black mt-1 ${profitLoss >= 0 ? "text-ark-success" : "text-ark-danger"}`}>
                      ₹{profitLoss.toLocaleString()}
                    </p>
                </div>
             </div>

             <div className="glass-card p-6">
               <h3 className="font-semibold text-lg text-foreground mb-6">Profit/Loss Chart</h3>
               <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profitLossData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))'}} />
                      <YAxis stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))'}} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Legend wrapperStyle={{ paddingTop: "20px" }} />
                      <Bar dataKey="Fee Collection" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Fee Refund" fill="hsl(47.9 95.8% 53.1%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Extra Income" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Expense" fill="hsl(0 84.2% 60.2%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
               </div>
             </div>
          </div>
        );

      case "fees":
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <h2 className="text-xl font-bold mb-4">Fees Analysis Reports</h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-5 border-l-4 border-l-ark-success">
                   <p className="text-sm text-muted-foreground font-medium">Total Fees Collected</p>
                   <p className="text-3xl font-black mt-2 text-foreground">₹{totalFeeCollected.toLocaleString()}</p>
                </div>
                <div className="glass-card p-5 border-l-4 border-l-ark-danger">
                   <p className="text-sm text-muted-foreground font-medium">Total Pending Dues</p>
                   <p className="text-3xl font-black mt-2 text-foreground">₹{feeRecords.reduce((a, b) => a + (b.pending || 0), 0).toLocaleString()}</p>
                </div>
                <div className="glass-card p-5 border-l-4 border-l-ark-warning">
                   <p className="text-sm text-muted-foreground font-medium">Total Refunds Processed</p>
                   <p className="text-3xl font-black mt-2 text-foreground">₹{totalFeeRefund.toLocaleString()}</p>
                </div>
             </div>
          </div>
        );

      case "expense":
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <h2 className="text-xl font-bold mb-4">Expense Analysis Reports</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="glass-card p-5 border-l-4 border-l-ark-danger">
                   <p className="text-sm text-muted-foreground font-medium">Total Expenditures</p>
                   <p className="text-3xl font-black mt-2 text-foreground">₹{totalExpense.toLocaleString()}</p>
                </div>
                <div className="glass-card p-5 border-l-4 border-l-blue-500">
                   <p className="text-sm text-muted-foreground font-medium">Total Extra Income generated</p>
                   <p className="text-3xl font-black mt-2 text-foreground">₹{totalExtraIncome.toLocaleString()}</p>
                </div>
             </div>
          </div>
        );

      case "activity":
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <h2 className="text-xl font-bold mb-4">Students All Activity Reports</h2>
             <div className="glass-card p-6">
                 <div className="relative border-l border-border/50 ml-3 space-y-6 pb-4">
                     {/* System Aggregated Feed */}
                     {feeRecords.slice(0, 3).map((f, i) => (
                         <div key={`fee-${i}`} className="relative pl-6">
                            <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-ark-success ring-4 ring-background"></div>
                            <p className="text-sm font-medium text-foreground">Fee Payment Received</p>
                            <p className="text-xs text-muted-foreground mt-0.5">₹{f.received} received from {f.student} ({f.batch})</p>
                            <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider">{f.paidDate || 'Recently'}</p>
                         </div>
                     ))}
                     {students.filter(s => s.lastTestDate).slice(0, 3).map((s, i) => (
                         <div key={`test-${i}`} className="relative pl-6">
                            <div className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-background"></div>
                            <p className="text-sm font-medium text-foreground">Test Marks Recorded</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.name} scored {s.spi}% - Status: {s.risk}</p>
                            <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider">{s.lastTestDate}</p>
                         </div>
                     ))}
                 </div>
             </div>
          </div>
        );

      case "enquiry":
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
             <h2 className="text-xl font-bold mb-4">Students Enquiry Analysis Reports</h2>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="glass-card p-6">
                     <h3 className="font-semibold text-lg mb-4">Enquiry Pipeline</h3>
                     <div className="space-y-4">
                         <div className="p-4 rounded-lg bg-ark-success/10 border border-ark-success/20 flex justify-between items-center">
                             <div>
                                 <p className="font-bold text-ark-success text-xl">124</p>
                                 <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Converted</p>
                             </div>
                             <ArrowRightLeft className="w-8 h-8 text-ark-success opacity-50" />
                         </div>
                         <div className="p-4 rounded-lg bg-ark-warning/10 border border-ark-warning/20 flex justify-between items-center">
                             <div>
                                 <p className="font-bold text-ark-warning text-xl">45</p>
                                 <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Follow-up Pending</p>
                             </div>
                             <Activity className="w-8 h-8 text-ark-warning opacity-50" />
                         </div>
                         <div className="p-4 rounded-lg bg-ark-danger/10 border border-ark-danger/20 flex justify-between items-center">
                             <div>
                                 <p className="font-bold text-ark-danger text-xl">18</p>
                                 <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Dropped / Lost</p>
                             </div>
                             <TrendingDown className="w-8 h-8 text-ark-danger opacity-50" />
                         </div>
                     </div>
                 </div>
                 <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
                     <div className="w-24 h-24 rounded-full border-4 border-accent border-r-transparent flex items-center justify-center mb-4">
                         <span className="text-2xl font-black text-accent">73%</span>
                     </div>
                     <p className="font-bold text-lg text-foreground mb-1">Conversion Rate</p>
                     <p className="text-sm text-muted-foreground">Of all valid enquiries over the last 30 days were successfully converted into admissions.</p>
                 </div>
             </div>
          </div>
        );

      default:
    }
  };

  return (
    <div className="space-y-6 min-h-[80vh]">
      <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Analysis Reports</h1>

      <div className="flex flex-col md:flex-row gap-6 h-full">
        {/* Sidebar Nav */}
        <div className="w-full md:w-72 flex-shrink-0">
          <div className="glass-card p-3 space-y-1 sticky top-24">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab.id
                    ? "bg-accent/15 text-accent shadow-sm ring-1 ring-accent/30"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? "text-accent" : "text-muted-foreground"}`} />
                <span className="text-left leading-tight">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default AnalysisReports;
