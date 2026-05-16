import React from "react";
import { useAppData } from "@/contexts/AppDataContext";
import { Users, CheckCircle2, Clock, BookOpen } from "lucide-react";

const TeacherOverview: React.FC = () => {
    const { getTasksForTeacher, teachers } = useAppData();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
                    <Users className="w-6 h-6 text-accent" />
                    Teacher Overview
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Monitor your team's assigned tasks and workload</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {teachers.map((teacher) => {
                    const teacherTasks = getTasksForTeacher(teacher.id);
                    const completed = teacherTasks.filter(
                        (t) => t.statusByTeacher[teacher.id] === "completed"
                    ).length;
                    const pending = teacherTasks.length - completed;

                    return (
                        <div key={teacher.id} className="glass-card p-5 space-y-4">
                            {/* Teacher Header */}
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center text-accent font-bold text-lg flex-shrink-0">
                                    {teacher.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-foreground truncate">{teacher.name}</p>
                                    <p className="text-xs text-muted-foreground">{teacher.email}</p>
                                </div>
                                <div className="flex items-center gap-1.5 bg-accent/10 rounded-lg px-2 py-1">
                                    <BookOpen className="w-3 h-3 text-accent" />
                                    <span className="text-xs text-accent font-medium">{teacher.className}</span>
                                </div>
                            </div>

                            {/* Task Stats */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-muted/20 rounded-lg p-2.5 text-center">
                                    <p className="text-lg font-bold text-foreground">{teacherTasks.length}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                                </div>
                                <div className="bg-ark-warning/10 rounded-lg p-2.5 text-center">
                                    <p className="text-lg font-bold text-ark-warning">{pending}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pending</p>
                                </div>
                                <div className="bg-ark-success/10 rounded-lg p-2.5 text-center">
                                    <p className="text-lg font-bold text-ark-success">{completed}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Done</p>
                                </div>
                            </div>

                            {/* Tasks */}
                            {teacherTasks.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tasks</p>
                                    {teacherTasks.map((task) => {
                                        const status = task.statusByTeacher[teacher.id];
                                        return (
                                            <div key={task.id} className="flex items-center gap-2 bg-muted/10 rounded-lg px-3 py-2">
                                                {status === "completed"
                                                    ? <CheckCircle2 className="w-4 h-4 text-ark-success flex-shrink-0" />
                                                    : <Clock className="w-4 h-4 text-ark-warning flex-shrink-0" />
                                                }
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-foreground truncate">{task.title}</p>
                                                    <p className="text-[11px] text-muted-foreground">Due: {task.dueDate}</p>
                                                </div>
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${status === "completed"
                                                    ? "bg-ark-success/20 text-ark-success"
                                                    : "bg-ark-warning/20 text-ark-warning"
                                                    }`}>
                                                    {status === "completed" ? "Done" : "Pending"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {teacherTasks.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-2">No tasks assigned yet</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TeacherOverview;
