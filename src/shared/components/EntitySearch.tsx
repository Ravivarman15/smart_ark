import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

// Plain controlled search input. Debouncing is the caller's responsibility
// (use `useDebounce` from shared/hooks) so the same component can drive
// both client-side and server-side filtering.
export const EntitySearch = ({ value, onChange, placeholder = "Search...", className }: Props) => (
  <div className={`relative ${className ?? ""}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="pl-9"
    />
  </div>
);
