import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Calendar as CalendarIcon, User } from "lucide-react";
import { EnquiryStatusBadge } from "./EnquiryStatusBadge";
import type { Enquiry } from "../types/enquiry.types";

interface Props {
  enquiry: Enquiry;
  className?: string;
}

// At-a-glance summary for an enquiry — drop into detail panes, drawers, etc.
export const AdmissionSummaryCard = ({ enquiry, className }: Props) => (
  <Card className={className}>
    <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
      <div>
        <CardTitle className="text-base flex items-center gap-2">
          <User className="w-4 h-4" />
          {enquiry.name}
        </CardTitle>
        <p className="text-xs text-muted-foreground capitalize mt-0.5">
          {enquiry.type ?? "call"} · {enquiry.priority ?? "medium"} priority
        </p>
      </div>
      <EnquiryStatusBadge status={enquiry.status} />
    </CardHeader>
    <CardContent className="space-y-1.5 text-sm">
      <div className="flex items-center gap-2">
        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{enquiry.phone || "—"}</span>
      </div>
      <div className="flex items-center gap-2">
        <CalendarIcon className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{enquiry.date}</span>
        {enquiry.followUpDate && (
          <span className="text-xs text-muted-foreground">
            (follow up: {enquiry.followUpDate})
          </span>
        )}
      </div>
      {enquiry.interestedStandard && (
        <p className="text-xs text-muted-foreground">
          Interested in {enquiry.interestedStandard}
          {enquiry.interestedCourse ? ` · ${enquiry.interestedCourse}` : ""}
        </p>
      )}
      {enquiry.notes && (
        <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{enquiry.notes}</p>
      )}
    </CardContent>
  </Card>
);
