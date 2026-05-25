import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  count: number;
  voted: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export const VoteButton = ({ count, voted, disabled, onClick }: Props) => (
  <Button
    variant={voted ? "default" : "outline"}
    size="sm"
    onClick={onClick}
    disabled={disabled}
    className={voted ? "bg-emerald-600 hover:bg-emerald-700" : ""}
  >
    <ThumbsUp className="w-4 h-4 mr-1" />
    {count}
  </Button>
);
