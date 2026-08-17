// Service layer of the Payroll feature.

export { payrollConfigService } from "./payrollConfig.service";
export { payrollRunService } from "./payrollRun.service";
export { payrollFinanceService } from "./payrollFinance.service";
export {
  payrollNotifyService,
  type NotifyResult,
} from "./payrollNotify.service";
export { payrollAnalyticsService } from "./payrollAnalytics.service";
export {
  payrollAuditService,
  type PayrollAuditActor,
} from "./payrollAudit.service";
export { payrollApprovalService } from "./payrollApproval.service";
export {
  payrollEmailService,
  summarisePayslipDelivery,
  type PayslipEmailResult,
  type PayslipDelivery,
} from "./payrollEmail.service";
