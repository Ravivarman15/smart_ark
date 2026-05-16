import React, { useState } from "react";
import { useAppData } from "@/contexts/AppDataContext";
import {
    ClipboardList, Plus, X, CheckCircle2, Clock, Calendar, ChevronDown, ChevronUp,
} from "lucide-react";

const TaskManagement: React.FC = () => {
    const { tasks, addTask, getTeacherById, teachers } = useAppData();
    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
    const [formError, setFormError] = useState("");
    const [expandedTask, setExpandedTask] = useState<string | null>(null);

    const toggleTeacher = (id: string) => {
        setSelectedTeachers((prev) =>
            prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim() || !dueDate || selectedTeachers.length === 0) {
            setFormError("Please fill all fields and select at least one teacher.");
            return;
        }
        addTask({ title: title.trim(), description: description.trim(), dueDate, assignedTo: selectedTeachers });
        setTitle("");
        setDescription("");
        setDueDate("");
        setSelectedTeachers([]);
        setFormError("");
        setShowForm(false);
    };

    const getOverallStatus = (task: typeof tasks[0]) => {
        const statuses = Object.values(task.statusByTeacher);
        if (statuses.length === 0) return "pending";
        return statuses.every((s) => s === "completed") ? "completed" : "pending";
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-accent" />
                        Task Management
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">Assign and track tasks across your teacher team</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 gradient-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-accent/20"
                >
                    {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {showForm ? "Cancel" : "Assign Task"}
                </button>
            </div>

            {/* Create Task Form */}
            {showForm && (
                <div className="glass-card p-6 animate-slide-up">
                    <h2 className="font-semibold text-foreground mb-4">New Task</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Task Title</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="e.g. Submit Progress Reports"
                                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                placeholder="Describe the task in detail..."
                                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all resize-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-muted-foreground mb-2 block">Assign To Teachers</label>
                            <div className="flex flex-wrap gap-2">
                                {teachers.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => toggleTeacher(t.id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${selectedTeachers.includes(t.id)
                                            ? "bg-accent text-accent-foreground border-accent shadow-lg shadow-accent/20"
                                            : "bg-muted/30 text-muted-foreground border-border hover:border-accent/50"
                                            }`}
                                    >
                                        {t.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {formError && <p className="text-ark-danger text-xs">{formError}</p>}
                        <button
                            type="submit"
                            className="gradient-accent text-accent-foreground font-semibold px-6 py-2.5 rounded-lg hover:opacity-90 transition-opacity shadow-lg shadow-accent/20 text-sm"
                        >
                            Assign Task
                        </button>
                    </form>
                </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Total Tasks", value: tasks.length, color: "text-accent" },
                    {
                        label: "Pending",
                        value: tasks.filter((t) => getOverallStatus(t) === "pending").length,
                        color: "text-ark-warning",
                    },
                    {
                        label: "Completed",
                        value: tasks.filter((t) => getOverallStatus(t) === "completed").length,
                        color: "text-ark-success",
                    },
                ].map((stat) => (
                    <div key={stat.label} className="glass-card p-4 text-center">
                        <p className={`text-2xl font-display font-bold ${stat.color}`}>{stat.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Tasks List */}
            <div className="space-y-3">
                <h2 className="font-semibold text-foreground text-sm uppercase tracking-wider text-muted-foreground">
                    All Tasks ({tasks.length})
                </h2>
                {tasks.length === 0 && (
                    <div className="glass-card p-8 text-center text-muted-foreground text-sm">
                        No tasks assigned yet. Click "Assign Task" to get started.
                    </div>
                )}
                {tasks.map((task) => {
                    const isExpanded = expandedTask === task.id;
                    const completedCount = Object.values(task.statusByTeacher).filter((s) => s === "completed").length;
                    const totalCount = task.assignedTo.length;
                    const overall = getOverallStatus(task);

                    return (
                        <div key={task.id} className="glass-card overflow-hidden">
                            <div
                                className="p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/10 transition-colors"
                                onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                            >
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${overall === "completed" ? "bg-ark-success/20" : "bg-ark-warning/20"
                                    }`}>
                                    {overall === "completed"
                                        ? <CheckCircle2 className="w-5 h-5 text-ark-success" />
                                        : <Clock className="w-5 h-5 text-ark-warning" />
                                    }
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground text-sm truncate">{task.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <div className="text-right hidden sm:block">
                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Calendar className="w-3 h-3" /> {task.dueDate}
                                        </p>
                                        <p className="text-xs font-medium text-foreground">{completedCount}/{totalCount} done</p>
                                    </div>
                                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${overall === "completed"
                                        ? "bg-ark-success/20 text-ark-success"
                                        : "bg-ark-warning/20 text-ark-warning"
                                        }`}>
                                        {overall === "completed" ? "Complete" : "Pending"}
                                    </span>
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2 bg-muted/5">
                                    <p className="text-xs text-muted-foreground">{task.description}</p>
                                    <div className="mt-3 space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status by Teacher</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {task.assignedTo.map((tid) => {
                                                const teacher = getTeacherById(tid);
                                                const status = task.statusByTeacher[tid];
                                                return (
                                                    <div key={tid} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                                                        <span className="text-sm text-foreground">{teacher?.name || tid}</span>
                                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status === "completed"
                                                            ? "bg-ark-success/20 text-ark-success"
                                                            : "bg-ark-warning/20 text-ark-warning"
                                                            }`}>
                                                            {status === "completed" ? "✓ Completed" : "Pending"}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TaskManagement;
