// ──────────────────────────────────────────────────────────────────────────────
// Help analytics — KPI overview pulled from tickets + feedback. All maths
// live in `aggregateAnalytics` (utils/helpCalc.ts); this service is a thin
// fetch-and-aggregate layer with graceful pre-migration degrade.
// ──────────────────────────────────────────────────────────────────────────────

import { BaseService } from "@/shared/services";
import { ticketsService, type TicketFilter } from "./tickets.service";
import { feedbackService } from "./feedback.service";
import { aggregateAnalytics } from "../utils/helpCalc";
import type { HelpAnalytics } from "../types/help.types";

export interface HelpAnalyticsScope {
  ticketFilter?: TicketFilter;
  feedbackPublicOnly?: boolean;
}

class HelpAnalyticsService extends BaseService {
  async overview(scope: HelpAnalyticsScope = {}): Promise<HelpAnalytics> {
    const [tickets, feedback] = await Promise.all([
      ticketsService.list({ limit: 1000, ...scope.ticketFilter }),
      feedbackService.list({ limit: 1000, publicOnly: scope.feedbackPublicOnly }),
    ]);
    return aggregateAnalytics(tickets, feedback);
  }
}

export const helpAnalyticsService = new HelpAnalyticsService();
