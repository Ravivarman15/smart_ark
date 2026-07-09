import React, { useMemo } from "react";
import { MessageSquareText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCanDo } from "@/features/rbac";
import { StatTile } from "../components/comms/shared";
import { HealthCenter } from "../components/comms/HealthCenter";
import { MissingContactCenter } from "../components/comms/MissingContactCenter";
import { BulkResend } from "../components/comms/BulkResend";
import { DeliveryDashboard } from "../components/comms/DeliveryDashboard";
import { ReminderSettings } from "../components/comms/ReminderSettings";
import { ReportsPanel } from "../components/comms/ReportsPanel";
import { useFeeContacts, useFeeDelivery, useFeeReceipts } from "../hooks/useFeeComms";
import {
  aggregateDelivery,
  buildContactHealth,
  communicationHealthScore,
  groupDeliveryByDay,
  groupDeliveryByMonth,
  isValidEmail,
  isValidMobile,
} from "../utils/feeCommsCalc";

// ─────────────────────────────────────────────────────────────────────────────
// Fee Communication Center — the Phase-B enterprise console. Composes the
// existing engines: feeCommsService (reads over message_queue/students/
// installments), feeReceiptDeliveryService (resend), commsAutomationSettings
// (reminders) and the shared reports export engine. Zero new backend.
// ─────────────────────────────────────────────────────────────────────────────

const FeeCommunicationCenter: React.FC = () => {
  const { canDo } = useCanDo();
  const canView = canDo("fee.comms.view_dashboard");
  const canEditContacts = canDo("fee.comms.update_email");
  const canResend = canDo("fee.comms.resend");

  const { data: contacts = [], isLoading: contactsLoading } = useFeeContacts();
  const { data: deliveryRows = [], isLoading: deliveryLoading } = useFeeDelivery(120);
  const { data: receipts = [] } = useFeeReceipts({});

  const contactHealth = useMemo(() => buildContactHealth(contacts), [contacts]);
  const delivery = useMemo(() => aggregateDelivery(deliveryRows), [deliveryRows]);
  const daily = useMemo(() => groupDeliveryByDay(deliveryRows), [deliveryRows]);
  const monthly = useMemo(() => groupDeliveryByMonth(deliveryRows), [deliveryRows]);
  const score = useMemo(() => communicationHealthScore(contactHealth, delivery), [contactHealth, delivery]);

  // Enterprise dashboard "today" tallies.
  const today = new Date().toISOString().slice(0, 10);
  const todayEmails = deliveryRows.filter((r) => r.channel === "email" && r.createdAt.slice(0, 10) === today).length;
  const todayWa = deliveryRows.filter((r) => r.channel !== "email" && r.createdAt.slice(0, 10) === today).length;
  const todayReceipts = receipts.filter((r) => r.date === today).length;
  const missingContacts = contacts.filter(
    (c) => !c.email || !isValidEmail(c.email) || !c.mobile || !isValidMobile(c.mobile),
  ).length;
  const openRate = delivery.total ? Math.round(((delivery.delivered + delivery.read) / delivery.total) * 100) : 0;
  const readRate = delivery.total ? Math.round((delivery.read / delivery.total) * 100) : 0;

  if (!canView) {
    return (
      <div className="glass-card p-8 text-center text-muted-foreground">
        You don’t have permission to view the Fee Communication Center.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MessageSquareText className="w-6 h-6 text-accent" />
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold text-foreground">Fee Communication Center</h1>
          <p className="text-sm text-muted-foreground">
            Enterprise receipt delivery, health monitoring and contact management — reusing the Communication Center.
          </p>
        </div>
      </div>

      {/* Enterprise dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatTile label="Today's Receipts" value={todayReceipts} />
        <StatTile label="Today's Emails" value={todayEmails} />
        <StatTile label="Today's WhatsApp" value={todayWa} />
        <StatTile label="Delivery Success" value={delivery.delivered + delivery.read} tone="good" />
        <StatTile label="Delivery Failure" value={delivery.failed} tone={delivery.failed ? "bad" : "good"} />
        <StatTile label="Open Rate" value={`${openRate}%`} hint="delivered / total" />
        <StatTile label="Read Rate" value={`${readRate}%`} hint="read / total" />
        <StatTile label="Missing Contacts" value={missingContacts} tone={missingContacts ? "warn" : "good"} />
        <StatTile label="Health Score" value={`${score}%`} tone={score >= 85 ? "good" : score >= 60 ? "warn" : "bad"} />
        <StatTile label="Pending Queue" value={delivery.pending} tone={delivery.pending ? "warn" : "default"} />
      </div>

      <Tabs defaultValue="health" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="health">Health Center</TabsTrigger>
          <TabsTrigger value="contacts">Missing Contacts</TabsTrigger>
          <TabsTrigger value="resend">Bulk Resend</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Dashboard</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-4">
          <HealthCenter
            contact={contactHealth}
            delivery={delivery}
            score={score}
            daily={daily}
            monthly={monthly}
            loading={contactsLoading || deliveryLoading}
          />
        </TabsContent>
        <TabsContent value="contacts" className="mt-4">
          <MissingContactCenter contacts={contacts} canEdit={canEditContacts} />
        </TabsContent>
        <TabsContent value="resend" className="mt-4">
          <BulkResend canResend={canResend} />
        </TabsContent>
        <TabsContent value="delivery" className="mt-4">
          <DeliveryDashboard delivery={delivery} />
        </TabsContent>
        <TabsContent value="reminders" className="mt-4">
          <ReminderSettings canEdit={canResend} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportsPanel receipts={receipts} contacts={contacts} delivery={delivery} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FeeCommunicationCenter;
