// String → Lucide icon map.
//
// The navigation config stores icons as STRINGS (e.g. "GraduationCap") so
// the menu config can live in a pure data file (no React deps) — useful
// when the menu eventually moves to the database. This registry is the
// single place that resolves those strings to actual React components.
//
// Adding a new icon: import it from lucide-react and add a line below.
// Unknown keys fall back to `Circle` so missing entries are visible, not silent.

import {
  Activity,
  AlertTriangle,
  Bell,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarRange,
  Circle,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileBarChart2,
  FolderOpen,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  ListChecks,
  ListTodo,
  Megaphone,
  PhoneCall,
  Receipt,
  RotateCcw,
  Settings,
  Shield,
  ShieldCheck,
  Tag,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  Activity,
  AlertTriangle,
  Bell,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileBarChart2,
  FolderOpen,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Layers,
  LifeBuoy,
  ListChecks,
  ListTodo,
  Megaphone,
  PhoneCall,
  Receipt,
  RotateCcw,
  Settings,
  Shield,
  ShieldCheck,
  Tag,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
};

export const resolveIcon = (key?: string): LucideIcon =>
  (key && ICONS[key]) || Circle;
