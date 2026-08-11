import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { OrgLogo } from "@/features/branding/components/OrgLogo";
import {
    ClipboardList, Users, LogOut, BookOpen, PhoneCall, Calendar, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

const navItems = [
    { to: "/coordinator", icon: ClipboardList, label: "Task Management", end: true },
    { to: "/coordinator/teachers", icon: Users, label: "Teachers" },
    { to: "/coordinator/academic", icon: BookOpen, label: "Academic Control" },
    { to: "/coordinator/enquiries", icon: PhoneCall, label: "Enquiries" },
    { to: "/coordinator/timetable", icon: Calendar, label: "Timetable" },
];

interface Props { collapsed: boolean; onToggle: () => void; onNavigate?: () => void; }

const CoordinatorSidebar: React.FC<Props> = ({ collapsed, onToggle, onNavigate }) => {
    const { logout, user } = useAuth();
    const location = useLocation();

    return (
        <aside className={`h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-sidebar-border min-h-[60px]">
                <OrgLogo className="w-8 h-8 rounded-lg flex-shrink-0" />
                {!collapsed && (
                    <div className="min-w-0">
                        <span className="font-display font-bold text-foreground text-sm block truncate">ARK Coordinator</span>
                        <span className="text-[10px] text-accent uppercase tracking-widest">Coordinator Portal</span>
                    </div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-3 overflow-y-auto scrollbar-thin">
                <div className="space-y-0.5 px-2">
                    {navItems.map((item) => {
                        const isActive = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                title={collapsed ? item.label : undefined}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                                    isActive
                                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                                }`}
                                onClick={onNavigate}
                            >
                                <item.icon className="w-4 h-4 flex-shrink-0" />
                                {!collapsed && <span className="truncate">{item.label}</span>}
                            </NavLink>
                        );
                    })}
                </div>
            </nav>

            {/* Footer */}
            <div className="border-t border-sidebar-border">
                {!collapsed && user && (
                    <div className="px-4 py-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-[11px] font-bold text-accent">{user.name?.[0]?.toUpperCase()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-foreground truncate">{user.name}</p>
                            <p className="text-[10px] text-accent uppercase tracking-wider">Coordinator</p>
                        </div>
                    </div>
                )}
                <div className="px-2 pb-3 space-y-0.5">
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive w-full transition-colors"
                        title={collapsed ? "Logout" : undefined}
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0" />
                        {!collapsed && <span>Logout</span>}
                    </button>
                    <button
                        onClick={onToggle}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground w-full transition-colors"
                        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        {collapsed ? <PanelLeftOpen className="w-4 h-4 flex-shrink-0" /> : <PanelLeftClose className="w-4 h-4 flex-shrink-0" />}
                        {!collapsed && <span className="text-xs">Collapse</span>}
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default CoordinatorSidebar;
