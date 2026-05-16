export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string
        }
        Relationships: []
      }
      admin_checklist: {
        Row: {
          admin_id: string | null
          completed: boolean | null
          completed_at: string | null
          created_at: string
          date: string | null
          id: string
          item_name: string
        }
        Insert: {
          admin_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          date?: string | null
          id?: string
          item_name: string
        }
        Update: {
          admin_id?: string | null
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string
          date?: string | null
          id?: string
          item_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_checklist_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_calls: {
        Row: {
          admin_id: string | null
          assigned_to: string | null
          created_at: string
          date: string | null
          follow_up_date: string | null
          id: string
          interested_course: string | null
          interested_standard: string | null
          is_walkin: boolean | null
          notes: string | null
          phone: string | null
          priority: string
          prospect_name: string
          status: Database["public"]["Enums"]["call_status"] | null
        }
        Insert: {
          admin_id?: string | null
          assigned_to?: string | null
          created_at?: string
          date?: string | null
          follow_up_date?: string | null
          id?: string
          interested_course?: string | null
          interested_standard?: string | null
          is_walkin?: boolean | null
          notes?: string | null
          phone?: string | null
          priority?: string
          prospect_name: string
          status?: Database["public"]["Enums"]["call_status"] | null
        }
        Update: {
          admin_id?: string | null
          assigned_to?: string | null
          created_at?: string
          date?: string | null
          follow_up_date?: string | null
          id?: string
          interested_course?: string | null
          interested_standard?: string | null
          is_walkin?: boolean | null
          notes?: string | null
          phone?: string | null
          priority?: string
          prospect_name?: string
          status?: Database["public"]["Enums"]["call_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_calls_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_calls_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          message: string
          related_user_id: string | null
          reviewed: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: Database["public"]["Enums"]["alert_severity"] | null
          type: string | null
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          message: string
          related_user_id?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"] | null
          type?: string | null
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          message?: string
          related_user_id?: string | null
          reviewed?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"] | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_related_user_id_fkey"
            columns: ["related_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          avg_marks: number | null
          campus_id: string
          coordinator_id: string | null
          created_at: string
          health: Database["public"]["Enums"]["batch_health"] | null
          id: string
          name: string
          portion_complete: number | null
          retest_rate: number | null
          standard_id: string | null
          teacher_responsible: string | null
          timing_end: string | null
          timing_start: string | null
          weak_chapters: string[] | null
        }
        Insert: {
          avg_marks?: number | null
          campus_id: string
          coordinator_id?: string | null
          created_at?: string
          health?: Database["public"]["Enums"]["batch_health"] | null
          id?: string
          name: string
          portion_complete?: number | null
          retest_rate?: number | null
          standard_id?: string | null
          teacher_responsible?: string | null
          timing_end?: string | null
          timing_start?: string | null
          weak_chapters?: string[] | null
        }
        Update: {
          avg_marks?: number | null
          campus_id?: string
          coordinator_id?: string | null
          created_at?: string
          health?: Database["public"]["Enums"]["batch_health"] | null
          id?: string
          name?: string
          portion_complete?: number | null
          retest_rate?: number | null
          standard_id?: string | null
          teacher_responsible?: string | null
          timing_end?: string | null
          timing_start?: string | null
          weak_chapters?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_coordinator_id_fkey"
            columns: ["coordinator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          created_at: string
          geo_lat: number | null
          geo_lng: number | null
          id: string
          name: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          name: string
        }
        Update: {
          address?: string | null
          created_at?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      class_logs: {
        Row: {
          attendance_marked: boolean | null
          batch_id: string | null
          conducted: boolean | null
          created_at: string
          date: string
          id: string
          portion_completed_pct: number | null
          teacher_id: string
          unreported: boolean | null
        }
        Insert: {
          attendance_marked?: boolean | null
          batch_id?: string | null
          conducted?: boolean | null
          created_at?: string
          date?: string
          id?: string
          portion_completed_pct?: number | null
          teacher_id: string
          unreported?: boolean | null
        }
        Update: {
          attendance_marked?: boolean | null
          batch_id?: string | null
          conducted?: boolean | null
          created_at?: string
          date?: string
          id?: string
          portion_completed_pct?: number | null
          teacher_id?: string
          unreported?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "class_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_logs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      daily_checklists: {
        Row: {
          checked_items: Json | null
          date: string
          id: string
          sign_name: string | null
          signed_off: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_items?: Json | null
          date?: string
          id?: string
          sign_name?: string | null
          signed_off?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checked_items?: Json | null
          date?: string
          id?: string
          sign_name?: string | null
          signed_off?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_checklists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_report_log: {
        Row: {
          date: string
          id: string
          report_data: Json | null
          sent_at: string
          status: string
          trigger_type: string
        }
        Insert: {
          date?: string
          id?: string
          report_data?: Json | null
          sent_at?: string
          status?: string
          trigger_type?: string
        }
        Update: {
          date?: string
          id?: string
          report_data?: Json | null
          sent_at?: string
          status?: string
          trigger_type?: string
        }
        Relationships: []
      }
      escalation_log: {
        Row: {
          created_at: string
          date: string | null
          description: string | null
          escalated_to: string | null
          id: string
          issue_type: string
          raised_by: string | null
          status: Database["public"]["Enums"]["escalation_status"] | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          description?: string | null
          escalated_to?: string | null
          id?: string
          issue_type: string
          raised_by?: string | null
          status?: Database["public"]["Enums"]["escalation_status"] | null
        }
        Update: {
          created_at?: string
          date?: string | null
          description?: string | null
          escalated_to?: string | null
          id?: string
          issue_type?: string
          raised_by?: string | null
          status?: Database["public"]["Enums"]["escalation_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_log_escalated_to_fkey"
            columns: ["escalated_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_log_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: []
      }
      expense_transactions: {
        Row: {
          amount: number
          campus_id: string | null
          category: string | null
          created_at: string
          date: string | null
          description: string | null
          entered_by: string | null
          id: string
          payment_mode: string | null
          type: string
        }
        Insert: {
          amount?: number
          campus_id?: string | null
          category?: string | null
          created_at?: string
          date?: string | null
          description?: string | null
          entered_by?: string | null
          id?: string
          payment_mode?: string | null
          type?: string
        }
        Update: {
          amount?: number
          campus_id?: string | null
          category?: string | null
          created_at?: string
          date?: string | null
          description?: string | null
          entered_by?: string | null
          id?: string
          payment_mode?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_transactions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_transactions_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_installments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          receipt_no: string | null
          student_fee_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          receipt_no?: string | null
          student_fee_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          receipt_no?: string | null
          student_fee_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_installments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_installments_student_fee_id_fkey"
            columns: ["student_fee_id"]
            isOneToOne: false
            referencedRelation: "student_fees"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          academic_year_id: string | null
          campus_id: string | null
          course_type: string
          course_type_id: string | null
          created_at: string
          created_by: string | null
          fee_amount: number
          first_payment_amount: number
          id: string
          installment_count: number
          is_active: boolean
          name: string | null
          remark: string | null
          seat_confirmation_amount: number
          standard_id: string | null
          standard_name: string
          tax_id: string | null
          total_amount: number | null
          total_students: number
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          campus_id?: string | null
          course_type: string
          course_type_id?: string | null
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          first_payment_amount?: number
          id?: string
          installment_count?: number
          is_active?: boolean
          name?: string | null
          remark?: string | null
          seat_confirmation_amount?: number
          standard_id?: string | null
          standard_name: string
          tax_id?: string | null
          total_amount?: number | null
          total_students?: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          campus_id?: string | null
          course_type?: string
          course_type_id?: string | null
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          first_payment_amount?: number
          id?: string
          installment_count?: number
          is_active?: boolean
          name?: string | null
          remark?: string | null
          seat_confirmation_amount?: number
          standard_id?: string | null
          standard_name?: string
          tax_id?: string | null
          total_amount?: number | null
          total_students?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_transactions: {
        Row: {
          amount: number
          batch_name: string | null
          campus_id: string | null
          created_at: string
          date: string | null
          due_date: string | null
          due_since: string | null
          entered_by: string | null
          id: string
          mode: string | null
          paid: boolean | null
          paid_at: string | null
          student_id: string | null
          student_name: string | null
        }
        Insert: {
          amount?: number
          batch_name?: string | null
          campus_id?: string | null
          created_at?: string
          date?: string | null
          due_date?: string | null
          due_since?: string | null
          entered_by?: string | null
          id?: string
          mode?: string | null
          paid?: boolean | null
          paid_at?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Update: {
          amount?: number
          batch_name?: string | null
          campus_id?: string | null
          created_at?: string
          date?: string | null
          due_date?: string | null
          due_since?: string | null
          entered_by?: string | null
          id?: string
          mode?: string | null
          paid?: boolean | null
          paid_at?: string | null
          student_id?: string | null
          student_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_transactions_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_transactions_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_transactions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_trend: {
        Row: {
          campus_id: string | null
          collected: number | null
          created_at: string
          id: string
          month: string
          target: number | null
        }
        Insert: {
          campus_id?: string | null
          collected?: number | null
          created_at?: string
          id?: string
          month: string
          target?: number | null
        }
        Update: {
          campus_id?: string | null
          collected?: number | null
          created_at?: string
          id?: string
          month?: string
          target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_trend_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      ihi_trend: {
        Row: {
          annotation: string | null
          campus_id: string | null
          created_at: string
          id: string
          ihi: number | null
          week: string
        }
        Insert: {
          annotation?: string | null
          campus_id?: string | null
          created_at?: string
          id?: string
          ihi?: number | null
          week: string
        }
        Update: {
          annotation?: string | null
          campus_id?: string | null
          created_at?: string
          id?: string
          ihi?: number | null
          week?: string
        }
        Relationships: [
          {
            foreignKeyName: "ihi_trend_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_snapshots: {
        Row: {
          academic_execution_score: number | null
          admission_score: number | null
          attendance_score: number | null
          campus_id: string | null
          checklist_score: number | null
          created_at: string
          fee_score: number | null
          final_kpi: number | null
          id: string
          ihi_score: number | null
          marks_sla_score: number | null
          month: number | null
          portion_score: number | null
          retest_score: number | null
          role: Database["public"]["Enums"]["app_role"] | null
          student_care_score: number | null
          student_improvement_score: number | null
          user_id: string | null
          year: number | null
        }
        Insert: {
          academic_execution_score?: number | null
          admission_score?: number | null
          attendance_score?: number | null
          campus_id?: string | null
          checklist_score?: number | null
          created_at?: string
          fee_score?: number | null
          final_kpi?: number | null
          id?: string
          ihi_score?: number | null
          marks_sla_score?: number | null
          month?: number | null
          portion_score?: number | null
          retest_score?: number | null
          role?: Database["public"]["Enums"]["app_role"] | null
          student_care_score?: number | null
          student_improvement_score?: number | null
          user_id?: string | null
          year?: number | null
        }
        Update: {
          academic_execution_score?: number | null
          admission_score?: number | null
          attendance_score?: number | null
          campus_id?: string | null
          checklist_score?: number | null
          created_at?: string
          fee_score?: number | null
          final_kpi?: number | null
          id?: string
          ihi_score?: number | null
          marks_sla_score?: number | null
          month?: number | null
          portion_score?: number | null
          retest_score?: number | null
          role?: Database["public"]["Enums"]["app_role"] | null
          student_care_score?: number | null
          student_improvement_score?: number | null
          user_id?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_snapshots_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_snapshots_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      override_log: {
        Row: {
          approved_by: string | null
          approved_by_name: string | null
          comment: string | null
          created_at: string
          id: string
          override_type: string | null
          reason: string
          requested_by: string | null
          requested_by_name: string | null
          status: Database["public"]["Enums"]["override_status"] | null
          user_name: string | null
          violation_id: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_by_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          override_type?: string | null
          reason: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: Database["public"]["Enums"]["override_status"] | null
          user_name?: string | null
          violation_id?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_by_name?: string | null
          comment?: string | null
          created_at?: string
          id?: string
          override_type?: string | null
          reason?: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: Database["public"]["Enums"]["override_status"] | null
          user_name?: string | null
          violation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "override_log_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "override_log_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "override_log_violation_id_fkey"
            columns: ["violation_id"]
            isOneToOne: false
            referencedRelation: "violations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          campus_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          subject: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campus_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          subject?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campus_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          subject?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          assigned_to: string | null
          content: string | null
          created_at: string
          created_by: string | null
          date: string | null
          due_date: string | null
          id: string
          items: Json | null
          linked_alert_id: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          title: string
        }
        Insert: {
          assigned_to?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          due_date?: string | null
          id?: string
          items?: Json | null
          linked_alert_id?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          title: string
        }
        Update: {
          assigned_to?: string | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          due_date?: string | null
          id?: string
          items?: Json | null
          linked_alert_id?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_linked_alert_id_fkey"
            columns: ["linked_alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      retests: {
        Row: {
          allocated_at: string | null
          allocated_by: string | null
          batch_name: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          improvement_pct: number | null
          original_test_id: string | null
          retest_date: string | null
          retest_marks: number | null
          status: Database["public"]["Enums"]["retest_status"] | null
          student_id: string
          subject: string | null
          teacher_id: string | null
        }
        Insert: {
          allocated_at?: string | null
          allocated_by?: string | null
          batch_name?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          improvement_pct?: number | null
          original_test_id?: string | null
          retest_date?: string | null
          retest_marks?: number | null
          status?: Database["public"]["Enums"]["retest_status"] | null
          student_id: string
          subject?: string | null
          teacher_id?: string | null
        }
        Update: {
          allocated_at?: string | null
          allocated_by?: string | null
          batch_name?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          improvement_pct?: number | null
          original_test_id?: string | null
          retest_date?: string | null
          retest_marks?: number | null
          status?: Database["public"]["Enums"]["retest_status"] | null
          student_id?: string
          subject?: string | null
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retests_allocated_by_fkey"
            columns: ["allocated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retests_original_test_id_fkey"
            columns: ["original_test_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retests_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_action_rights: {
        Row: {
          action_key: string
          created_at: string
          id: string
          is_allowed: boolean
          profile_id: string
        }
        Insert: {
          action_key: string
          created_at?: string
          id?: string
          is_allowed?: boolean
          profile_id: string
        }
        Update: {
          action_key?: string
          created_at?: string
          id?: string
          is_allowed?: boolean
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_action_rights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          id: string
          permissions: Json
          profile_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          permissions?: Json
          profile_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          permissions?: Json
          profile_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_rights: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module_name: string
          profile_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_name: string
          profile_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module_name?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_rights_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      standards: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      student_attendance: {
        Row: {
          batch_id: string | null
          created_at: string
          date: string
          id: string
          marked_by: string | null
          status: string
          student_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          status?: string
          student_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_attendance_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fees: {
        Row: {
          amount_pending: number
          amount_received: number
          batch_name: string | null
          created_at: string
          created_by: string | null
          discount_amount: number
          due_date: string | null
          fee_structure_id: string | null
          first_payment_amount: number
          id: string
          installment_count: number
          seat_confirmation_amount: number
          status: string
          student_id: string
          student_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_pending?: number
          amount_received?: number
          batch_name?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          fee_structure_id?: string | null
          first_payment_amount?: number
          id?: string
          installment_count?: number
          seat_confirmation_amount?: number
          status?: string
          student_id: string
          student_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_pending?: number
          amount_received?: number
          batch_name?: string | null
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          due_date?: string | null
          fee_structure_id?: string | null
          first_payment_amount?: number
          id?: string
          installment_count?: number
          seat_confirmation_amount?: number
          status?: string
          student_id?: string
          student_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          admission_date: string | null
          batch_id: string | null
          campus_id: string | null
          course_type_id: string | null
          created_at: string
          date_of_birth: string | null
          deactivation_reason: string | null
          fee_structure_id: string | null
          id: string
          is_active: boolean
          last_test_date: string | null
          name: string
          parent_contact: string | null
          parent_contact2: string | null
          parent_email: string | null
          parent_name: string | null
          retest_status: Database["public"]["Enums"]["retest_status"] | null
          risk_level: Database["public"]["Enums"]["student_risk"] | null
          roll_number: string | null
          spi: number | null
          standard_id: string | null
        }
        Insert: {
          admission_date?: string | null
          batch_id?: string | null
          campus_id?: string | null
          course_type_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          deactivation_reason?: string | null
          fee_structure_id?: string | null
          id?: string
          is_active?: boolean
          last_test_date?: string | null
          name: string
          parent_contact?: string | null
          parent_contact2?: string | null
          parent_email?: string | null
          parent_name?: string | null
          retest_status?: Database["public"]["Enums"]["retest_status"] | null
          risk_level?: Database["public"]["Enums"]["student_risk"] | null
          roll_number?: string | null
          spi?: number | null
          standard_id?: string | null
        }
        Update: {
          admission_date?: string | null
          batch_id?: string | null
          campus_id?: string | null
          course_type_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          deactivation_reason?: string | null
          fee_structure_id?: string | null
          id?: string
          is_active?: boolean
          last_test_date?: string | null
          name?: string
          parent_contact?: string | null
          parent_contact2?: string | null
          parent_email?: string | null
          parent_name?: string | null
          retest_status?: Database["public"]["Enums"]["retest_status"] | null
          risk_level?: Database["public"]["Enums"]["student_risk"] | null
          roll_number?: string | null
          spi?: number | null
          standard_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_campus_id_fkey"
            columns: ["campus_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_course_type_id_fkey"
            columns: ["course_type_id"]
            isOneToOne: false
            referencedRelation: "course_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          id: string
          name: string
          standard_id: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string
          id?: string
          name: string
          standard_id?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          standard_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          status_by_user: Json | null
          title: string
        }
        Insert: {
          assigned_to?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status_by_user?: Json | null
          title: string
        }
        Update: {
          assigned_to?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status_by_user?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      taxes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          percentage: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          percentage?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          percentage?: number
        }
        Relationships: []
      }
      teacher_attendance: {
        Row: {
          check_in_time: string | null
          check_out_status: string | null
          check_out_time: string | null
          checkout_geo_valid: boolean | null
          created_at: string
          date: string
          geo_lat: number | null
          geo_lng: number | null
          geo_valid: boolean | null
          id: string
          override_id: string | null
          status: Database["public"]["Enums"]["checkin_status"] | null
          teacher_id: string
        }
        Insert: {
          check_in_time?: string | null
          check_out_status?: string | null
          check_out_time?: string | null
          checkout_geo_valid?: boolean | null
          created_at?: string
          date?: string
          geo_lat?: number | null
          geo_lng?: number | null
          geo_valid?: boolean | null
          id?: string
          override_id?: string | null
          status?: Database["public"]["Enums"]["checkin_status"] | null
          teacher_id: string
        }
        Update: {
          check_in_time?: string | null
          check_out_status?: string | null
          check_out_time?: string | null
          checkout_geo_valid?: boolean | null
          created_at?: string
          date?: string
          geo_lat?: number | null
          geo_lng?: number | null
          geo_valid?: boolean | null
          id?: string
          override_id?: string | null
          status?: Database["public"]["Enums"]["checkin_status"] | null
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          marks: number | null
          marks_pct: number | null
          risk_level: Database["public"]["Enums"]["student_risk"] | null
          sla_status: Database["public"]["Enums"]["sla_status"] | null
          spi: number | null
          student_id: string
          teacher_id: string | null
          test_date: string | null
          total_marks: number | null
          uploaded_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          marks?: number | null
          marks_pct?: number | null
          risk_level?: Database["public"]["Enums"]["student_risk"] | null
          sla_status?: Database["public"]["Enums"]["sla_status"] | null
          spi?: number | null
          student_id: string
          teacher_id?: string | null
          test_date?: string | null
          total_marks?: number | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          marks?: number | null
          marks_pct?: number | null
          risk_level?: Database["public"]["Enums"]["student_risk"] | null
          sla_status?: Database["public"]["Enums"]["sla_status"] | null
          spi?: number | null
          student_id?: string
          teacher_id?: string | null
          test_date?: string | null
          total_marks?: number | null
          uploaded_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_results_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_results_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      violations: {
        Row: {
          auto_generated: boolean | null
          created_at: string
          date: string | null
          description: string | null
          id: string
          override_id: string | null
          resolved: boolean | null
          type: Database["public"]["Enums"]["violation_type"]
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          auto_generated?: boolean | null
          created_at?: string
          date?: string | null
          description?: string | null
          id?: string
          override_id?: string | null
          resolved?: boolean | null
          type: Database["public"]["Enums"]["violation_type"]
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          auto_generated?: boolean | null
          created_at?: string
          date?: string | null
          description?: string | null
          id?: string
          override_id?: string | null
          resolved?: boolean | null
          type?: Database["public"]["Enums"]["violation_type"]
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          material_due_date: string | null
          portion_completed: string | null
          portion_planned: string | null
          status: Database["public"]["Enums"]["plan_status"] | null
          teacher_id: string
          test_date: string | null
          week_start: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          material_due_date?: string | null
          portion_completed?: string | null
          portion_planned?: string | null
          status?: Database["public"]["Enums"]["plan_status"] | null
          teacher_id: string
          test_date?: string | null
          week_start?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          material_due_date?: string | null
          portion_completed?: string | null
          portion_planned?: string | null
          status?: Database["public"]["Enums"]["plan_status"] | null
          teacher_id?: string
          test_date?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_plans_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_read: boolean
          message: string
          reference_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message: string
          reference_id?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_read?: boolean
          message?: string
          reference_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_financial_summary: { Args: { p_campus_id?: string }; Returns: Json }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_severity: "critical" | "warning" | "info"
      app_role: "teacher" | "admin" | "management" | "coordinator"
      batch_health: "strong" | "moderate" | "risk"
      call_status: "interested" | "follow_up" | "converted" | "not_interested"
      checkin_status: "on_time" | "late" | "absent"
      escalation_status: "open" | "resolved"
      override_status: "pending" | "approved" | "rejected"
      plan_status: "pending" | "completed" | "delayed"
      report_status: "pending" | "completed" | "overdue"
      retest_status: "pending" | "allocated" | "completed" | "delayed"
      sla_status: "within" | "breached"
      student_risk: "safe" | "watch" | "high_risk" | "critical"
      violation_type:
        | "marks_sla"
        | "retest_delay"
        | "late_checkin"
        | "checklist_miss"
        | "fee_target"
        | "attendance_gap"
        | "walk_in_miss"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["critical", "warning", "info"],
      app_role: ["teacher", "admin", "management", "coordinator"],
      batch_health: ["strong", "moderate", "risk"],
      call_status: ["interested", "follow_up", "converted", "not_interested"],
      checkin_status: ["on_time", "late", "absent"],
      escalation_status: ["open", "resolved"],
      override_status: ["pending", "approved", "rejected"],
      plan_status: ["pending", "completed", "delayed"],
      report_status: ["pending", "completed", "overdue"],
      retest_status: ["pending", "allocated", "completed", "delayed"],
      sla_status: ["within", "breached"],
      student_risk: ["safe", "watch", "high_risk", "critical"],
      violation_type: [
        "marks_sla",
        "retest_delay",
        "late_checkin",
        "checklist_miss",
        "fee_target",
        "attendance_gap",
        "walk_in_miss",
      ],
    },
  },
} as const
