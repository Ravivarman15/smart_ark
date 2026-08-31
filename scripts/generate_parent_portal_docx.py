"""
Script to generate the complete, comprehensive Enterprise Parent Portal Word Document (.docx).
Includes custom styling, headers, footers, callout boxes, tables with alternating colors,
and in-depth explanations of all architecture, security, modules, workflows, and configurations.
"""

import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=140, bottom=140, left=180, right=180):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(
        f'<w:tcMar {nsdecls("w")}>'
        f'<w:top w:w="{top}" w:type="dxa"/>'
        f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
        f'<w:left w:w="{left}" w:type="dxa"/>'
        f'<w:right w:w="{right}" w:type="dxa"/>'
        f'</w:tcMar>'
    )
    tcPr.append(tcMar)

def add_callout(doc, text, title="NOTE", border_color="1E3A8A", bg_color="F0F4F8"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl.autofit = False
    
    cell = tbl.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=160, bottom=160, left=240, right=200)
    
    # Border on left only
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:top w:val="none"/>'
        f'<w:left w:val="single" w:sz="36" w:space="0" w:color="{border_color}"/>'
        f'<w:bottom w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    
    r_title = p.add_run(f"[{title}]  ")
    r_title.bold = True
    r_title.font.name = "Calibri"
    r_title.font.size = Pt(10)
    r_title.font.color.rgb = RGBColor.from_string(border_color)
    
    r_text = p.add_run(text)
    r_text.font.name = "Calibri"
    r_text.font.size = Pt(10)
    r_text.font.color.rgb = RGBColor(50, 60, 75)
    
    # Add spacing after table
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(0)
    p_after.paragraph_format.space_after = Pt(4)

def style_table(table, col_widths, headers, data, header_bg="1E3A8A", alt_bg="F8FAFC"):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    # Header row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].width = Inches(col_widths[i])
        set_cell_background(hdr_cells[i], header_bg)
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(title)
        r.bold = True
        r.font.name = "Calibri"
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(255, 255, 255)
    
    # Set header row repeat
    trPr = table.rows[0]._tr.get_or_add_trPr()
    trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))
    
    # Data rows
    for row_idx, row_data in enumerate(data):
        row = table.add_row()
        # prevent row split across pages
        rPr = row._tr.get_or_add_trPr()
        rPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))
        
        bg = alt_bg if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(row_data):
            cell = row.cells[col_idx]
            cell.width = Inches(col_widths[col_idx])
            set_cell_background(cell, bg)
            set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
            
            # Subtle cell borders
            tcPr = cell._tc.get_or_add_tcPr()
            borders = parse_xml(
                f'<w:tcBorders {nsdecls("w")}>'
                f'<w:top w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
                f'<w:left w:val="none"/>'
                f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>'
                f'<w:right w:val="none"/>'
                f'</w:tcBorders>'
            )
            tcPr.append(borders)
            
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            r = p.add_run(str(text))
            r.font.name = "Calibri"
            r.font.size = Pt(9.5)
            r.font.color.rgb = RGBColor(30, 41, 59)

def add_heading_1(doc, text):
    h = doc.add_heading(text, level=1)
    h.paragraph_format.space_before = Pt(16)
    h.paragraph_format.space_after = Pt(6)
    h.paragraph_format.keep_with_next = True
    r = h.runs[0]
    r.font.name = "Calibri"
    r.font.size = Pt(18)
    r.bold = True
    r.font.color.rgb = RGBColor(30, 58, 138) # Deep Navy
    return h

def add_heading_2(doc, text):
    h = doc.add_heading(text, level=2)
    h.paragraph_format.space_before = Pt(12)
    h.paragraph_format.space_after = Pt(4)
    h.paragraph_format.keep_with_next = True
    r = h.runs[0]
    r.font.name = "Calibri"
    r.font.size = Pt(14)
    r.bold = True
    r.font.color.rgb = RGBColor(14, 116, 144) # Slate Teal
    return h

def add_heading_3(doc, text):
    h = doc.add_heading(text, level=3)
    h.paragraph_format.space_before = Pt(8)
    h.paragraph_format.space_after = Pt(2)
    h.paragraph_format.keep_with_next = True
    r = h.runs[0]
    r.font.name = "Calibri"
    r.font.size = Pt(11.5)
    r.bold = True
    r.font.color.rgb = RGBColor(51, 65, 85) # Slate
    return h

def add_body_p(doc, text, bold_prefix=None, italic=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    if bold_prefix:
        r_b = p.add_run(bold_prefix)
        r_b.bold = True
        r_b.font.name = "Calibri"
        r_b.font.size = Pt(10.5)
        r_b.font.color.rgb = RGBColor(15, 23, 42)
    r = p.add_run(text)
    r.font.name = "Calibri"
    r.font.size = Pt(10.5)
    r.italic = italic
    r.font.color.rgb = RGBColor(30, 41, 59)
    return p

def add_bullet_point(doc, bold_title, text):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    r_b = p.add_run(bold_title)
    r_b.bold = True
    r_b.font.name = "Calibri"
    r_b.font.size = Pt(10)
    r_b.font.color.rgb = RGBColor(15, 23, 42)
    
    r_t = p.add_run(f" {text}")
    r_t.font.name = "Calibri"
    r_t.font.size = Pt(10)
    r_t.font.color.rgb = RGBColor(51, 65, 85)
    return p

def create_document():
    doc = docx.Document()
    
    # Page setup - 1 inch margins
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)
        
        # Header / Footer
        footer = section.footer
        p_f = footer.paragraphs[0]
        p_f.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        p_f.paragraph_format.space_before = Pt(0)
        r_f = p_f.add_run("Smart ARK Educational Platform | Enterprise Parent Portal Guide")
        r_f.font.name = "Calibri"
        r_f.font.size = Pt(8.5)
        r_f.font.color.rgb = RGBColor(148, 163, 184)
        
        header = section.header
        p_h = header.paragraphs[0]
        p_h.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_h.paragraph_format.space_after = Pt(0)
        r_h = p_h.add_run("CONFIDENTIAL & PROPRIETARY — SYSTEM SPECIFICATION & USER MANUAL")
        r_h.font.name = "Calibri"
        r_h.font.size = Pt(8.5)
        r_h.font.color.rgb = RGBColor(148, 163, 184)

    # ═══════════════════════════════════════════════════════════════════════════
    # COVER / TITLE BLOCK
    # ═══════════════════════════════════════════════════════════════════════════
    p_pre = doc.add_paragraph()
    p_pre.paragraph_format.space_before = Pt(36)
    p_pre.paragraph_format.space_after = Pt(4)
    r_pre = p_pre.add_run("SMART ARK ENTERPRISE EDUCATIONAL SUITE")
    r_pre.bold = True
    r_pre.font.name = "Calibri"
    r_pre.font.size = Pt(11)
    r_pre.font.color.rgb = RGBColor(14, 116, 144)
    
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(8)
    r_title = p_title.add_run("Parent Portal: Complete System Architecture, Module Guide & User Manual")
    r_title.bold = True
    r_title.font.name = "Calibri"
    r_title.font.size = Pt(24)
    r_title.font.color.rgb = RGBColor(30, 58, 138)
    
    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(16)
    r_sub = p_sub.add_run("A comprehensive blueprint detailing the read-only projection architecture, 16 parent modules, Row-Level Security (RLS) isolation model, multi-child switcher, and tenant presentation controls.")
    r_sub.font.name = "Calibri"
    r_sub.font.size = Pt(12)
    r_sub.italic = True
    r_sub.font.color.rgb = RGBColor(71, 85, 105)

    # Metadata Table
    meta_tbl = doc.add_table(rows=1, cols=4)
    meta_widths = [1.5, 1.75, 1.5, 1.75]
    meta_data = [
        ["Version", "2.4.0 (Enterprise)", "Platform Route", "/parent/*"],
        ["Target Audience", "Parents, Admins, Staff", "Security Scope", "Strict RLS (is_parent_of)"],
        ["Engine Type", "React 18 + Supabase", "Realtime Channels", "1 Multiplexed (RLS-gated)"]
    ]
    style_table(meta_tbl, meta_widths, ["Attribute", "Value", "Attribute", "Value"], meta_data, header_bg="1E3A8A")

    doc.add_page_break()

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 1: EXECUTIVE SUMMARY & CORE PHILOSOPHY
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading_1(doc, "1. Executive Summary & Core Architectural Philosophy")
    
    add_body_p(doc, "The Smart ARK Parent Portal represents a modern, responsive, and high-security communication window bridging educational institutions and families. Built with a focus on real-time academic transparency, the portal provides parents with an all-in-one platform to monitor their child's holistic educational journey—from daily attendance and live online classes to examination analytics, fee ledgers, and official documents.")
    
    add_heading_2(doc, "1.1 The Zero-Duplication Projection Architecture")
    add_body_p(doc, "Unlike legacy ERP systems that duplicate database tables and build siloed parent services, the Smart ARK Parent Portal is built as a pure, high-performance read-only projection layer over existing institute modules. It owns no redundant domain data, introduces no duplicated business services, and maintains 100% data consistency with teacher and administrator records in real time.")

    add_callout(
        doc,
        "Zero-Duplication Principle: The parent portal directly queries foundational tables (students, student_attendance, exams, exam_results, student_fees, etc.) through Postgres Row-Level Security (RLS). When a teacher marks attendance or publishes an exam score, the parent views the update immediately without data synchronization delays or ETL pipelines.",
        title="CORE ARCHITECTURAL PILLAR",
        border_color="0D9488",
        bg_color="F0FDFA"
    )

    add_body_p(doc, "Key architectural advantages include:")
    add_bullet_point(doc, "Zero Redundancy:", "No duplicate services or database models for marks, fees, or attendance.")
    add_bullet_point(doc, "Unified Cache & High Performance:", "Client-side TanStack React Query caching shares query keys across views. Opening the Home dashboard pre-warms the cache for Academics, Attendance, Messages, and Documents, achieving sub-50ms transitions.")
    add_bullet_point(doc, "Multi-Tenant Presentation Governance:", "Each educational institution can configure which modules are available to its parents via administrative settings without altering database security policies.")
    add_bullet_point(doc, "Realtime Reactive Updates:", "A single multiplexed Supabase Realtime channel (parent-portal-<accountId>) listens to 10 underlying tables, dynamically updating UI tiles upon database change events.")

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 2: SECURITY & DATA ISOLATION (RLS BOUNDARY)
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading_1(doc, "2. Security Architecture & Data Isolation Model")
    
    add_body_p(doc, "The Smart ARK Parent Portal implements an uncompromising enterprise defense-in-depth security model. The boundary of protection is strictly enforced at the PostgreSQL database level via Row Level Security (RLS) rather than relying on application code or UI routing.")

    add_heading_2(doc, "2.1 The Hard-Deny Security Transformation")
    add_body_p(doc, "In traditional multi-tenant architectures, authenticated policies often allow broad reads (e.g., 'FOR SELECT TO authenticated USING (true)'). While harmless when only institute employees hold user accounts, the introduction of parent logins creates a critical data leakage risk. Smart ARK resolved this by tightening default database policies:")
    
    add_bullet_point(doc, "Default Denial for Non-Staff:", "All universal read policies were rewritten from USING (true) to USING (public.is_staff()). Employees holding an active profiles row retain access, while parents receive a strict hard-deny across all unauthorized tables by default.")
    add_bullet_point(doc, "Explicit Grant by Student Lineage:", "Additive RLS policies are attached specifically for the is_parent() role, funneling all queries strictly through the deterministic is_parent_of(student_id) function.")
    add_bullet_point(doc, "Complete Exclusion of Sensitive Entities:", "Parents possess zero read rights to the employee profiles directory, payroll tables, financial ledgers, staff notes, internal inquiry CRM leads, or system RBAC permissions.")

    add_heading_2(doc, "2.2 Postgres Security Helper Functions")
    add_body_p(doc, "The database enforces lineage verification through 7 hardened SECURITY DEFINER STABLE functions with search_path pinned to public:")

    sec_tbl = doc.add_table(rows=1, cols=3)
    sec_widths = [2.2, 1.4, 2.9]
    sec_data = [
        ["is_staff()", "boolean", "Returns true if auth.uid() exists in active profiles table."],
        ["current_parent_account_id()", "uuid | null", "Returns caller's active parent account ID if status='active'."],
        ["is_parent()", "boolean", "Returns true if current_parent_account_id() is non-null."],
        ["parent_child_ids()", "SETOF uuid", "Returns exact list of student IDs linked to current parent."],
        ["is_parent_of(student_uuid)", "boolean", "Validates if specified student belongs to linked children."],
        ["parent_has_child_in_batch(id)", "boolean", "Validates if any of parent's children belong to batch."],
        ["parent_has_child_in_standard(id)", "boolean", "Validates if any of parent's children belong to standard/class."]
    ]
    style_table(sec_tbl, sec_widths, ["Security Function", "Return Type", "Verification Purpose"], sec_data, header_bg="1E3A8A")

    add_heading_2(doc, "2.3 Storage & File Object Security")
    add_body_p(doc, "Student documents, ID cards, certificates, and attachments stored in Supabase Storage (the student-documents bucket) are guarded by path-level security policies. Parents can only generate signed URLs or view documents whose first storage folder path segment matches their verified child's UUID (uuid_match AND is_parent_of(folder_id)).")

    add_heading_2(doc, "2.4 Route Protection & Session Cohesion")
    add_body_p(doc, "At the application layer, ParentProtectedRoute acts as a client gate. If a staff user navigates to a parent route, they are automatically redirected to their designated staff workspace. If a parent attempts to access /admin, /teacher, or /coordinator, the staff ProtectedRoute blocks the request and routes them to /parent.")

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 3: AUTHENTICATION, ONBOARDING & MULTI-CHILD SWITCHING
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading_1(doc, "3. Authentication, Onboarding & Multi-Child Session Flow")

    add_heading_2(doc, "3.1 Parent Authentication Flow")
    add_body_p(doc, "Parents log into Smart ARK using the standard institutional login interface (/login). No custom OTP portals or secondary auth servers are required.")
    
    add_bullet_point(doc, "Standardized Sign-In:", "Parents enter their registered email address and secure password.")
    add_bullet_point(doc, "Smart Role Resolution:", "The application checks the profiles table. If no staff profile is found, it automatically queries parent_auth_accounts WHERE status='active'. Upon confirmation, AuthContext assigns portal='parent'.")
    add_bullet_point(doc, "Immediate Redirection:", "AuthRedirect automatically transfers the session to /parent.")

    add_heading_2(doc, "3.2 Account Provisioning Workflow")
    add_body_p(doc, "Parent accounts are provisioned systematically during student admission or through the Communication Center:")
    add_bullet_point(doc, "Automated Generation:", "The student-parent-accounts edge function matches sibling records using parent mobile numbers and emails, preventing duplicate parent accounts.")
    add_bullet_point(doc, "Multi-Child Auto-Linking:", "Siblings enrolled in different classes or batches within the institution are linked to the same parent_auth_accounts record via parent_student_links.")
    add_bullet_point(doc, "Credential Delivery:", "Initial login credentials and secure temporary passwords are delivered to parents via automated WhatsApp, SMS, or Email templates.")

    add_heading_2(doc, "3.3 ActiveChildProvider & Instant Child Switcher")
    add_body_p(doc, "For families with multiple children enrolled in the school, Smart ARK provides a seamless, zero-friction child switching experience:")
    add_bullet_point(doc, "Active Context Provider:", "ActiveChildProvider maintains the currently viewed child across all portal routes.")
    add_bullet_point(doc, "Global Child Switcher Component:", "Located in the top header and sidebar, displaying child avatars, names, grades, and section badges.")
    add_bullet_point(doc, "Instant Cached Transitions:", "Switching children changes the studentId parameter across data hooks. Because queries are cached per student ID, switching between siblings is instantaneous with zero screen flicker.")

    doc.add_page_break()

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 4: IN-DEPTH BREAKDOWN OF ALL 16 PORTAL MODULES
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading_1(doc, "4. Comprehensive Breakdown of All 16 Parent Portal Modules")
    add_body_p(doc, "The Smart ARK Parent Portal provides a complete suite of 16 purpose-built modules. Each module is designed to provide maximum clarity, actionable insights, and transparent academic tracking for families.")

    # Table of Modules
    mod_overview_tbl = doc.add_table(rows=1, cols=4)
    mod_widths = [0.8, 1.8, 1.7, 2.2]
    mod_data = [
        ["1", "Home Dashboard", "/parent", "Daily overview, Today strip, 8 insight cards, sibling row."],
        ["2", "Attendance Tracking", "/parent/attendance", "Color-coded calendar, monthly rollups, term percentage."],
        ["3", "Academics & Analytics", "/parent/academics", "Health score, subject marks, thirds-based trend analysis."],
        ["4", "Exams & Results", "/parent/exams", "Upcoming timetable, published results, ranks, report cards."],
        ["5", "Online Tests (MCQ)", "/parent/online-tests", "Interactive test runner, timer, instant question review."],
        ["6", "Classes & Timetable", "/parent/classes", "Daily schedule, ±15m gated live links, lecture notes."],
        ["7", "Fees & Receipts", "/parent/fees", "Fee ledger, installment schedules, tax receipts, balance."],
        ["8", "Messages & Comms", "/parent/messages", "Two-way thread, SMS/WhatsApp broadcast history, status."],
        ["9", "Document Center", "/parent/documents", "Digital student archives, signed URLs, audited downloads."],
        ["10", "Activity Timeline", "/parent/timeline", "Unified chronological stream of 7 academic & fee events."],
        ["11", "Academic Calendar", "/parent/calendar", "Institution events, holidays, PTM dates, exam periods."],
        ["12", "AI Query Assistant", "/parent/assistant", "Deterministic natural-language Q&A engine for student data."],
        ["13", "Student Profile 360°", "/parent/profile", "Enrolment details, personal data, emergency contacts."],
        ["14", "Transport & Hostel", "/parent/services", "Route numbers, pickup stops, hostel blocks, wardens."],
        ["15", "Reports & Analytics", "/parent/reports", "12-section 360° PDF/Excel progress report generator."],
        ["16", "Parent Settings", "/parent/settings", "Language selector, dark mode, granular notification matrix."]
    ]
    style_table(mod_overview_tbl, mod_widths, ["#", "Module Name", "Route Path", "Primary Functional Scope"], mod_data, header_bg="1E3A8A")

    # MODULE 1
    add_heading_2(doc, "Module 1: Home Dashboard (/parent)")
    add_body_p(doc, "The Home Dashboard serves as the central command center for the parent. When parents log in, they are greeted with a personalized, scannable overview designed to present high-priority information within seconds.")
    
    add_heading_3(doc, "Core Components & Visual Layout:")
    add_bullet_point(doc, "Active Child Header:", "Displays the current child's photo, name, class/standard, section, roll number, and academic status.")
    add_bullet_point(doc, "The 'Today' Quick Strip:", "A horizontal strip of 6 compact status tiles that highlight real-time daily metrics: Today's Attendance Status (Present/Absent/Late), Classes Scheduled Today, Active Live Class indicator, Upcoming Exam Countdown, Outstanding Fee Balance, and Latest Unread Message.")
    add_bullet_point(doc, "8 Deep Insight Cards:", "Dedicated analytical panels covering:")
    add_body_p(doc, "  1. Academic Health & AI Summary: Displays overall performance score (0-100), risk band badge (Good / Attention / Critical), and an automated executive narrative.\n"
                    "  2. Attendance Trend: Monthly percentage calculation with a stacked bar visual comparing present vs absent vs late days.\n"
                    "  3. Marks Trajectory: Subject-wise marks distribution with statistical trend indicators (improving, stable, declining).\n"
                    "  4. Exam Urgency & Schedule: Next upcoming examination with subject syllabus, days remaining, and venue details.\n"
                    "  5. Fee Status & Payment Summary: Total billed fee, total payments recorded, remaining balance, and next installment due date.\n"
                    "  6. Teacher Remarks & Observations: Recent qualitative feedback logged by subject teachers during classroom evaluations.\n"
                    "  7. Co-Curricular & Achievements: Honors, competition medals, and downloadable extracurricular certificates.\n"
                    "  8. Parent Engagement Health: Frequency of portal visits, communication receipt confirmation, and engagement score.")
    add_bullet_point(doc, "Quick Action Bar:", "One-tap shortcuts to download official progress reports, view fee receipts, join online classes, check academic calendars, or consult the AI Assistant.")
    add_bullet_point(doc, "Sibling Navigation Row:", "Miniature profile cards for other enrolled siblings, allowing the parent to switch active child views in one click.")
    add_bullet_point(doc, "Institutional Announcement Modal:", "Integrated emergency alerts, holiday notices, and circulars broadcast by school management.")

    # MODULE 2
    add_heading_2(doc, "Module 2: Attendance Tracking (/parent/attendance)")
    add_body_p(doc, "The Attendance Tracking module provides real-time visibility into the student's daily presence, punctuality, and long-term attendance habits.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Interactive Monthly Calendar:", "Visual color-coded monthly calendar (Green = Present, Red = Absent, Amber = Late Arrival, Blue = Half Day / Excused, Gray = Official Holiday / Sunday).")
    add_bullet_point(doc, "Term Attendance KPI Cards:", "High-level summary tiles displaying Total Working Days, Days Present, Days Absent, Late Arrivals Count, and Cumulative Term Percentage.")
    add_bullet_point(doc, "Attendance Threshold Indicators:", "Automatic warning banners if the student's attendance falls below the mandatory institutional requirement (e.g., 75% or 80%).")
    add_bullet_point(doc, "Detailed Attendance Log:", "Chronological tabular list with recorded timestamps, check-in mode (RFID / biometric / manual teacher roll-call), and teacher-submitted remarks or leave explanations.")

    # MODULE 3
    add_heading_2(doc, "Module 3: Academics & Performance Analytics (/parent/academics)")
    add_body_p(doc, "The Academics module translates raw classroom marks into actionable educational intelligence, helping parents identify strengths and areas requiring additional academic support.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Academic Health Score Engine:", "Proprietary algorithm evaluating overall performance on a scale of 0 to 100 based on weighted continuous assessments, unit tests, and terminal examinations.")
    add_bullet_point(doc, "Subject-Wise Score Breakdown:", "Detailed subject cards showing the child's score, maximum marks, class highest score, class average, assigned letter grade, and assigned faculty member.")
    add_bullet_point(doc, "Thirds-Based Performance Trend:", "Advanced statistical trajectory analysis dividing historical tests into equal thirds to determine genuine academic progression (Improving / Steady / Requires Intervention), filtering out single-test anomalies.")
    add_bullet_point(doc, "Subject Strengths & Focus Areas:", "Automatic categorization highlighting subjects where the student excels vs subjects where scores are lagging.")
    add_bullet_point(doc, "Progress Report Generator Shortcut:", "Direct trigger to generate the comprehensive 12-section Student 360° Progress Report.")

    # MODULE 4
    add_heading_2(doc, "Module 4: Examination & Published Results (/parent/exams)")
    add_body_p(doc, "The Exams module serves as the authoritative archive for all past and upcoming formal written and practical evaluations.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Upcoming Exam Timetable:", "Date-wise schedule of forthcoming exams, including subject name, start/end time, duration, maximum marks, minimum passing marks, classroom venue, and detailed syllabus guidelines.")
    add_bullet_point(doc, "Published Results Archive:", "Historic archive of completed term exams (Mid-term, Quarterly, Half-Yearly, Annual Board Pre-finals).")
    add_bullet_point(doc, "Performance Metrics:", "Subject-wise marks, percentage, percentile, section rank (when published by school administration), overall grade, and principal remarks.")
    add_bullet_point(doc, "Official Marksheet Downloads:", "Download authentic, institution-stamped PDF marksheets directly to mobile or desktop devices.")

    # MODULE 5
    add_heading_2(doc, "Module 5: Online Tests & MCQ Assessment Runner (/parent/online-tests)")
    add_body_p(doc, "Designed specifically for digital assessments, this module separates actionable, time-sensitive online quizzes and mock tests from historical exam archives.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Three-Stage Workflow:", "Organized into tabbed buckets: Available (Active tests open for submission now), Upcoming (Scheduled for future date/time windows), and Completed (Finished tests with evaluated scores).")
    add_bullet_point(doc, "Integrated ExamRunner Interface:", "Full-screen test environment featuring individual question timers, question palette navigation (Answered, Flagged for Review, Unvisited), and responsive multi-choice radio selections.")
    add_bullet_point(doc, "Security & Integrity Guards:", "Server-side eligibility validation, strict countdown enforcement, auto-submission on timer expiry, and window blur detection.")
    add_bullet_point(doc, "Instant Result & Solution Breakdown:", "Immediate display of total score, accuracy percentage, time spent per question, and in-depth step-by-step answer explanations upon test completion.")

    # MODULE 6
    add_heading_2(doc, "Module 6: Classes & Timetable (/parent/classes)")
    add_body_p(doc, "Provides parents with full visibility into the student's daily routine, weekly academic timetable, and live digital classrooms.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Daily & Weekly Timetable:", "Interactive schedule detailing period timings, subject names, assigned teacher, and physical room/lab locations.")
    add_bullet_point(doc, "Live Online Class Integration:", "Direct launch links for scheduled virtual sessions (Zoom, Google Meet, Microsoft Teams, or Smart ARK Live).")
    add_bullet_point(doc, "Gated Join Window (Security Control):", "Join buttons are strictly activated only within ±15 minutes of the scheduled class time to prevent unauthorized access or expired links.")
    add_bullet_point(doc, "Class Recordings & Lecture Resources:", "Access recorded video lectures, teacher slide decks, and downloadable homework worksheets associated with each class session.")

    # MODULE 7
    add_heading_2(doc, "Module 7: Fees, Ledger & Receipts (/parent/fees)")
    add_body_p(doc, "The Fees module offers 100% financial transparency, detailing fee structures, recorded transactions, outstanding dues, and official receipts.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Comprehensive Fee Ledger:", "Itemized breakdown of all applicable fee components (Tuition Fee, Transportation, Hostel & Mess, Lab & Library Fees, Examination Charges, and Extracurricular Fees).")
    add_bullet_point(doc, "Real-Time Payment Summary:", "KPI cards tracking Total Applicable Fees, Concessions/Scholarships Applied, Total Amount Paid, and Remaining Balance Due.")
    add_bullet_point(doc, "Installment Schedule:", "Milestone-based installment planner showing upcoming due dates, grace periods, and late fee policies.")
    add_bullet_point(doc, "Official Receipt Generation:", "Instant download of official, GST-compliant payment receipts complete with transaction reference IDs, bank payment modes, and authorized digital signatures.")
    add_bullet_point(doc, "Annual Financial Statements:", "One-click export of annual fee clearance certificates for income tax deduction (Section 80C) verification.")

    # MODULE 8
    add_heading_2(doc, "Module 8: Messages & Communication Center (/parent/messages)")
    add_body_p(doc, "A unified two-way messaging hub connecting parents with school teachers, coordinators, and administrative departments.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Omnichannel Message History:", "Chronological stream aggregating all outbound WhatsApp messages, SMS alerts, official email circulars, and portal notifications sent by the institute.")
    add_bullet_point(doc, "Interactive Two-Way Messaging:", "Enables parents to initiate inquiries, reply to teacher notices, and request parent-teacher conferences.")
    add_bullet_point(doc, "Delivery & Read Receipts:", "Full transparency on message dispatch status (Sent, Delivered, Read timestamps).")
    add_bullet_point(doc, "Category Filtering:", "Quick filters to sort messages by Academic Alerts, Fee Reminders, Event Circulars, or Emergency Notices.")

    # MODULE 9
    add_heading_2(doc, "Module 9: Document Center (/parent/documents)")
    add_body_p(doc, "A secure, encrypted digital repository housing all official student documents and institutional certificates.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Centralized Student Archive:", "Houses student ID cards, Bonafide certificates, Admission confirmation orders, Transfer Certificates (TC), Medical health records, and Extracurricular achievements.")
    add_bullet_point(doc, "Time-Limited Signed URLs:", "File downloads are generated via cryptographically signed, short-lived URLs (expiring in 60 seconds) to prevent unauthorized link sharing.")
    add_bullet_point(doc, "Audit Trail Logging:", "Every document access and file download event is automatically recorded in the parent_portal_audit database table for compliance.")

    # MODULE 10
    add_heading_2(doc, "Module 10: Activity Timeline (/parent/timeline)")
    add_body_p(doc, "A chronological single-column activity stream synthesizing all major events occurring across the child's academic journey.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Synthesis of 7 Data Streams:", "Consolidates Daily Attendance records, Exam mark releases, Fee installment receipts, Live class attendance, Communication dispatches, Document issuances, and Teacher disciplinary notes.")
    add_bullet_point(doc, "Intelligent Event Suppression:", "Automatically suppresses repetitive routine events (e.g., standard 'Present' attendance days) to highlight anomalies like late arrivals, leaves, and sudden mark changes.")
    add_bullet_point(doc, "Zero New Queries:", "Built entirely by merging pre-cached React Query data, generating zero additional network overhead.")

    # MODULE 11
    add_heading_2(doc, "Module 11: Academic Calendar (/parent/calendar)")
    add_body_p(doc, "Keeps families organized and prepared for all institutional schedules, academic milestones, and holidays.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Color-Coded Event Taxonomy:", "Distinguishes between Official Government & School Holidays, Term Examination Windows, Parent-Teacher Meetings (PTM), Sports & Annual Days, and Project Submission Deadlines.")
    add_bullet_point(doc, "Multi-View Flexibility:", "Switch between full Monthly Grid View, Weekly Agenda View, and Upcoming Events List.")
    add_bullet_point(doc, "Cohort-Specific Filtering:", "Displays institute-wide events alongside class-specific milestones relevant only to the active child's standard and section.")

    # MODULE 12
    add_heading_2(doc, "Module 12: AI Query Assistant (/parent/assistant)")
    add_body_p(doc, "A private, deterministic natural language inquiry assistant designed to answer common parent questions instantly.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Deterministic Privacy-First Architecture:", "Unlike external LLMs that expose student data to third-party APIs, the Smart ARK Assistant uses a local deterministic engine that computes answers directly against the parent's authenticated data scope.")
    add_bullet_point(doc, "Natural Language Understanding:", "Answers complex queries such as:\n"
                    "  - 'How is Rahul doing in Mathematics?'\n"
                    "  - 'What is his attendance percentage for this month?'\n"
                    "  - 'Are there any pending fee installments?'\n"
                    "  - 'When is the next science exam scheduled?'\n"
                    "  - 'What remarks did the class teacher give last week?'")
    add_bullet_point(doc, "Direct Contextual Navigation:", "Provides clickable action buttons directly inside assistant responses, guiding parents straight to the relevant detailed module.")

    # MODULE 13
    add_heading_2(doc, "Module 13: Student Profile 360° (/parent/profile)")
    add_body_p(doc, "Displays the student's official master record and institutional enrolment parameters.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Academic Enrolment Demographics:", "Admission number, Student registration code, Standard, Section, Assigned Academic Batch, and Roll Number.")
    add_bullet_point(doc, "Personal & Medical Attributes:", "Full legal name, Date of birth, Blood group, Gender, Known medical conditions/allergies, and Emergency contact numbers.")
    add_bullet_point(doc, "Parent & Guardian Information:", "Primary guardian name, relationship, registered contact number, email address, and home residential address.")

    # MODULE 14
    add_heading_2(doc, "Module 14: Transport & Hostel Services (/parent/services)")
    add_body_p(doc, "Specialized auxiliary services dashboard providing logistical details for commuting and residential students.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Transport Logistics:", "Assigned bus/van route number, vehicle registration number, assigned pickup and drop-off bus stops, morning pickup time, evening drop time, and driver/attendant contact numbers.")
    add_bullet_point(doc, "Hostel & Residential Details:", "Hostel building name, block/wing number, assigned room and bed number, resident warden name, and mess/dining hall schedule.")
    add_bullet_point(doc, "Tenant Visibility Control:", "Day-schools or tuition academies that do not operate fleets or hostels can cleanly deactivate this module in settings, removing it completely from the parent menu.")

    # MODULE 15
    add_heading_2(doc, "Module 15: Reports & Analytics (/parent/reports)")
    add_body_p(doc, "A centralized report generation center empowering parents to produce official academic and administrative documentation.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Student 360° Comprehensive Progress Report:", "Generates an exhaustive 12-section report including Attendance analytics, Subject mastery matrices, Continuous assessment performance, AI behavioral assessment, Extracurricular achievements, and Teacher sign-offs.")
    add_bullet_point(doc, "Custom Export Formats:", "High-resolution branded PDF printouts with institution letterhead, crest, and watermarks, as well as raw Excel (.xlsx) data spreadsheets.")
    add_bullet_point(doc, "Custom Date-Range Statements:", "Generate customized attendance logs or financial clearance ledgers over specific date ranges.")

    # MODULE 16
    add_heading_2(doc, "Module 16: Parent Settings & Preferences (/parent/settings)")
    add_body_p(doc, "Provides complete personalization and security management for the parent user account.")
    
    add_heading_3(doc, "Key Capabilities & Features:")
    add_bullet_point(doc, "Multilingual Localization:", "Language selector supporting English, Tamil, Hindi, and regional languages.")
    add_bullet_point(doc, "Visual Theme Preferences:", "Toggle between System Default, Clean High-Contrast Light Mode, and Sleek Modern Dark Mode.")
    add_bullet_point(doc, "Granular Notification Matrix:", "Allows parents to customize opt-in/opt-out preferences across SMS, WhatsApp, and Email channels for specific event types (Attendance alerts, Exam results, Fee reminders, General circulars).")
    add_bullet_point(doc, "Account Security & Passwords:", "Self-service password change interface with password strength validation and active session audit log showing recent login timestamps and IP locations.")

    doc.add_page_break()

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 5: TENANT PRESENTATION GOVERNANCE & CONFIGURATION
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading_1(doc, "5. Multi-Tenant Presentation Governance & Administration")
    
    add_body_p(doc, "Every educational institution operating on Smart ARK has complete administrative control over which portal modules are surfaced to its parents. This allows schools to tailor the parent portal to their unique operational model.")

    add_heading_2(doc, "5.1 Presentation Policy vs Database Security")
    add_body_p(doc, "Smart ARK strictly separates presentation governance from database security:")
    add_bullet_point(doc, "Presentation Layer:", "Disabling a module (such as Fees or Transport) removes it from the parent sidebar, hides related dashboard tiles, and replaces the route outlet with an informative notice.")
    add_bullet_point(doc, "Security Layer:", "Database Row-Level Security (RLS) remains the sole authoritative access control. A hidden module is protected by RLS on the server, ensuring presentation toggles are never misused as security gates.")

    add_heading_2(doc, "5.2 Precedence & Fail-Open Resolution Hierarchy")
    add_body_p(doc, "The resolution of visible parent modules follows a strict 5-layer precedence hierarchy executed by resolveParentModules():")

    prec_tbl = doc.add_table(rows=1, cols=3)
    prec_widths = [0.8, 1.8, 3.9]
    prec_data = [
        ["0", "Platform Plan Entitlement", "If the school's commercial plan excludes the Parent Portal or underlying module (e.g. Live Classes), it is hidden across all parents."],
        ["1", "Essential Floor", "Home (/parent) and Settings (/parent/settings) are immutable and cannot be disabled, preventing parents from ever being locked in a dead end."],
        ["2", "Submodule Entitlement", "If the school lacks entitlement to a feature (e.g., Fees), the parent module is automatically withdrawn."],
        ["3", "Organization Configuration", "Institution-specific toggle: Admin/Management disables selected optional modules in Settings -> Parent Portal."],
        ["4", "Default State", "All non-disabled, entitled modules are enabled by default (silence means yes)."]
    ]
    style_table(prec_tbl, prec_widths, ["Level", "Governance Layer", "Resolution Effect"], prec_data, header_bg="1E3A8A")

    add_heading_2(doc, "5.3 Storage Architecture in organization_settings")
    add_body_p(doc, "Module visibility preferences are stored in the organization_settings table under key='parent_portal_modules' with JSON format: { 'disabled': ['services', 'assistant'] }. By storing disabled keys rather than enabled ones, any newly released module automatically appears for existing customers without requiring manual database migrations.")

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 6: TECHNICAL SPECIFICATIONS & PERFORMANCE METRICS
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading_1(doc, "6. Technical Specifications & Performance Benchmarks")

    tech_tbl = doc.add_table(rows=1, cols=3)
    tech_widths = [2.0, 2.0, 2.5]
    tech_data = [
        ["Frontend Framework", "React 18 / TypeScript / Vite", "Modular SPA with Vite code splitting"],
        ["Client Bundle Footprint", "11.4 kB Shell + 3-11 kB Lazy Pages", "Gzipped, zero impact on staff bundles"],
        ["State & Cache Layer", "TanStack Query v5 (React Query)", "60s stale time, instant cached child switches"],
        ["Database & Backend", "Supabase PostgreSQL + pgvector", "8 security helper functions, strict RLS"],
        ["Realtime Multiplexing", "1 Realtime Channel per parent", "Postgres change filters across 10 tables"],
        ["Auditing & Compliance", "parent_portal_audit table", "Logs logins, child switches, and downloads"],
        ["Automated Test Coverage", "616 / 616 Unit & Security Tests", "100% pass rate with zero regressions"]
    ]
    style_table(tech_tbl, tech_widths, ["Architecture Layer", "Technology Stack", "Performance Characteristic"], tech_data, header_bg="1E3A8A")

    add_heading_2(doc, "6.1 Summary of Verification & Security Test Suites")
    add_body_p(doc, "The parent portal implementation is backed by comprehensive automated test suites:")
    add_bullet_point(doc, "parentPortalSecurity.test.ts (30 tests):", "Validates helper definitions, SECURITY DEFINER attributes, pinned search_path, RLS predicate correctness, storage folder UUID isolation, and complete staff directory lockdown.")
    add_bullet_point(doc, "dashboardCards.test.ts (39 tests):", "Asserts relative-day formatting, thirds-based marks progression trends, engagement calculations, and live class time boundaries.")
    add_bullet_point(doc, "parentAssistant.test.ts (18 tests):", "Validates deterministic query routing, attendance/fee question parsing, and multi-period date windowing.")
    add_bullet_point(doc, "parentModules.test.ts (14 tests):", "Guarantees complete registry alignment between routing gates, sidebar navigation, and tenant administration toggles.")

    # ═══════════════════════════════════════════════════════════════════════════
    # SECTION 7: USER GUIDE & NAVIGATION CHEAT SHEET
    # ═══════════════════════════════════════════════════════════════════════════
    add_heading_1(doc, "7. Parent User Guide & Navigation Cheat Sheet")

    add_body_p(doc, "Below is a quick reference guide designed to assist parents in navigating their daily portal workflows:")

    guide_tbl = doc.add_table(rows=1, cols=3)
    guide_widths = [1.8, 1.8, 2.9]
    guide_data = [
        ["Check Today's Schedule", "Home / Classes", "View morning Today strip or click Classes to see live timetable and video meeting links."],
        ["Verify Attendance", "Attendance", "Open calendar to view daily color-coded markers and review cumulative attendance percentage."],
        ["Download Report Card", "Exams / Reports", "Navigate to Exams to view published term marks or generate a full 360° PDF Progress Report."],
        ["Take an Online Test", "Online Tests", "Click 'Available' tab, verify instructions, and click 'Start Test' to enter the interactive runner."],
        ["Review Fee Due & Receipts", "Fees & Receipts", "Inspect fee balance, check installment milestones, and download official payment receipts."],
        ["Communicate with School", "Messages", "Review official school broadcasts or reply directly to teachers within the message thread."],
        ["Switch Between Siblings", "Top Header / Sidebar", "Click the Child Switcher dropdown at any time to switch views between enrolled children."],
        ["Change App Theme/Language", "Settings", "Select preferred language (English, Tamil, Hindi) or toggle between Light and Dark modes."]
    ]
    style_table(guide_tbl, guide_widths, ["Parent Objective", "Portal Module", "Action Steps"], guide_data, header_bg="1E3A8A")

    # Document Footer Note
    add_callout(
        doc,
        "For additional support or technical inquiries regarding the Smart ARK Parent Portal, please reach out to your institution's administrative office or contact Smart ARK Support at support@smartark.io.",
        title="SUPPORT & ASSISTANCE",
        border_color="1E3A8A",
        bg_color="F8FAFC"
    )

    output_path = os.path.abspath("Smart_ARK_Enterprise_Parent_Portal_Full_Documentation.docx")
    doc.save(output_path)
    print(f"Document successfully created at: {output_path}")

if __name__ == "__main__":
    create_document()
