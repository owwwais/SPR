// Hand-written to mirror supabase/migrations/0001…0008 exactly.
// Replace with `supabase gen types typescript` output once a database is
// available (local Docker stack or linked project) — keep in sync until then.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Tenant-level role (0006). Platform staff are NOT in here — see D13. */
export type MemberRole = "owner" | "admin" | "hr" | "viewer";
export type OrgStatus =
  | "trial"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";
export type JobStatus = "draft" | "published" | "closed";
export type JobType =
  | "full_time"
  | "part_time"
  | "contract"
  | "remote"
  | "internship";
export type AppStatus =
  | "new"
  | "under_review"
  | "interview"
  | "accepted"
  | "rejected";
export type AnalysisStatus = "pending" | "processing" | "done" | "failed";
export type NitaqatBand =
  | "platinum"
  | "green_high"
  | "green_mid"
  | "green_low"
  | "yellow"
  | "red";

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

/** Mirrors the interview agent's lifecycle (0019). */
export type InterviewStatus =
  | "draft"
  | "planning"
  | "awaiting_review"
  | "scheduled"
  | "open"
  | "in_progress"
  | "submitted"
  | "evaluating"
  | "evaluated"
  | "expired"
  | "cancelled"
  | "failed";

/** The platform's record of a job's core question bank (0021). */
export type JobBankStatus =
  | "generating"
  | "awaiting_review"
  | "locked"
  | "failed"
  | "superseded";

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          logo_path: string | null;
          cover_path: string | null;
          about: string | null;
          website: string | null;
          industry: string | null;
          city: string | null;
          brand_color: string | null;
          status: OrgStatus;
          listed_publicly: boolean;
          // 0014/0016
          plan_code: string;
          monthly_analysis_quota: number | null;
          // 0021 (D33): interviews per month. NULL = uncapped, 0 = none.
          monthly_interview_quota: number | null;
          // 0025: copied from plans; NULL = uncapped. Not client-writable.
          max_active_jobs: number | null;
          max_seats: number | null;
          blind_screening: boolean;
          nitaqat_band: NitaqatBand | null;
          saudization_target: number | null;
          retention_months: number;
          created_by: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          logo_path?: string | null;
          cover_path?: string | null;
          about?: string | null;
          website?: string | null;
          industry?: string | null;
          city?: string | null;
          brand_color?: string | null;
          status?: OrgStatus;
          listed_publicly?: boolean;
          plan_code?: string;
          monthly_analysis_quota?: number | null;
          blind_screening?: boolean;
          nitaqat_band?: NitaqatBand | null;
          saudization_target?: number | null;
          retention_months?: number;
          created_by?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        // status is deliberately absent: the column grant (0006) keeps
        // subscription state out of a tenant's reach.
        Update: {
          slug?: string;
          name?: string;
          logo_path?: string | null;
          cover_path?: string | null;
          about?: string | null;
          website?: string | null;
          industry?: string | null;
          city?: string | null;
          brand_color?: string | null;
          listed_publicly?: boolean;
          plan_code?: string;
          monthly_analysis_quota?: number | null;
          blind_screening?: boolean;
          nitaqat_band?: NitaqatBand | null;
          saudization_target?: number | null;
          retention_months?: number;
        };
        Relationships: [];
      };
      memberships: {
        Row: {
          org_id: string;
          user_id: string;
          role: MemberRole;
          created_at: string;
        };
        Insert: {
          org_id: string;
          user_id: string;
          role?: MemberRole;
          created_at?: string;
        };
        Update: {
          role?: MemberRole;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          org_id: string;
          email: string;
          role: MemberRole;
          token_hash: string;
          status: InviteStatus;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          email: string;
          role?: MemberRole;
          token_hash: string;
          status?: InviteStatus;
          invited_by?: string | null;
          expires_at?: string;
          created_at?: string;
        };
        // Only the status is ever changed by a client (revoke); acceptance
        // goes through accept_invitation().
        Update: {
          status?: InviteStatus;
          role?: MemberRole;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: { user_id: string; note: string | null; created_at: string };
        Insert: { user_id: string; note?: string | null; created_at?: string };
        Update: { note?: string | null };
        Relationships: [];
      };
      impersonation_sessions: {
        Row: {
          id: string;
          platform_user_id: string;
          org_id: string;
          reason: string;
          expires_at: string;
          ended_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          platform_user_id: string;
          org_id: string;
          reason: string;
          expires_at?: string;
          ended_at?: string | null;
          created_at?: string;
        };
        Update: { ended_at?: string | null };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          created_at?: string;
        };
        Update: {
          full_name?: string;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          org_id: string;
          title: string;
          department: string | null;
          location: string | null;
          type: JobType;
          description: string;
          requirements: string;
          skills: string[];
          min_years_experience: number | null;
          status: JobStatus;
          closes_at: string | null;
          screening_questions: Json;
          created_by: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          title: string;
          department?: string | null;
          location?: string | null;
          type: JobType;
          description: string;
          requirements: string;
          skills?: string[];
          min_years_experience?: number | null;
          status?: JobStatus;
          closes_at?: string | null;
          screening_questions?: Json;
          created_by?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          org_id?: string;
          title?: string;
          department?: string | null;
          location?: string | null;
          type?: JobType;
          description?: string;
          requirements?: string;
          skills?: string[];
          min_years_experience?: number | null;
          status?: JobStatus;
          closes_at?: string | null;
          screening_questions?: Json;
          created_by?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      applications: {
        Row: {
          id: string;
          org_id: string;
          job_id: string;
          ref_code: string;
          full_name: string;
          email: string;
          phone: string;
          cv_path: string;
          cv_mime: string;
          cover_note: string | null;
          status: AppStatus;
          analysis_status: AnalysisStatus;
          analysis_attempts: number;
          analysis_error: string | null;
          // 0028 (KD-17): when the current or last run claimed the row.
          analysis_claimed_at: string | null;
          counts_toward_saudization: boolean | null;
          // 0013: trigger-maintained copy of ai_evaluations.fit_score, so the
          // ranked list can be served from an index.
          fit_score: number | null;
          screening_answers: Json;
          interview_at: string | null;
          interview_qa: Json;
          // 0023: optional hiring-source attribution (#12), e.g. "linkedin".
          // Sanitized by submit-application; never used in scoring.
          source: string | null;
          // 0020 (D27): set only by submit-application for a seeker who applied
          // with their stored profile. Nulled if they delete their seeker data;
          // via_account stays true so the badge survives.
          applicant_user_id: string | null;
          via_account: boolean;
          created_at: string;
        };
        // org_id is omitted: the applications_set_org trigger derives it from
        // job_id, so nothing client-side should be supplying one (D11).
        Insert: {
          id?: string;
          job_id: string;
          ref_code: string;
          full_name: string;
          email: string;
          phone: string;
          cv_path: string;
          cv_mime: string;
          cover_note?: string | null;
          status?: AppStatus;
          analysis_status?: AnalysisStatus;
          analysis_attempts?: number;
          analysis_error?: string | null;
          counts_toward_saudization?: boolean | null;
          fit_score?: number | null;
          screening_answers?: Json;
          interview_at?: string | null;
          interview_qa?: Json;
          source?: string | null;
          created_at?: string;
        };
        Update: {
          status?: AppStatus;
          analysis_status?: AnalysisStatus;
          analysis_attempts?: number;
          analysis_error?: string | null;
          counts_toward_saudization?: boolean | null;
          fit_score?: number | null;
          interview_at?: string | null;
          interview_qa?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_evaluations: {
        Row: {
          id: string;
          org_id: string;
          application_id: string;
          model: string;
          prompt_version: string;
          blind: boolean;
          extracted: Json;
          fit_score: number;
          score_breakdown: Json;
          justification: Json;
          interview_questions: Json;
          interview_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          model: string;
          prompt_version: string;
          extracted: Json;
          fit_score: number;
          score_breakdown: Json;
          justification: Json;
          interview_questions: Json;
          interview_notes?: string | null;
          created_at?: string;
        };
        // Only interview_notes is writable by staff (0002 column grant); the
        // AI original is immutable (§10.6).
        Update: {
          interview_notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ai_evaluations_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: true;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      // 0023: every evaluation a re-run replaced. Written only by the
      // ai_evaluations_archive_before_update trigger — never by application
      // code, so there is no Insert/Update type.
      ai_evaluation_history: {
        Row: {
          id: string;
          org_id: string;
          application_id: string;
          model: string;
          prompt_version: string;
          blind: boolean;
          fit_score: number;
          score_breakdown: Json;
          justification: Json;
          evaluated_at: string;
          superseded_at: string;
        };
        // Written only by the trigger, as the table owner — never through
        // the client. Record<string, never> keeps the shape (every table
        // needs Insert/Update to satisfy supabase-js's generic schema
        // constraint) while making a client-side write a type error.
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "ai_evaluation_history_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      status_history: {
        Row: {
          id: number;
          org_id: string;
          application_id: string;
          from_status: AppStatus | null;
          to_status: AppStatus;
          changed_by: string | null;
          note: string | null;
          // 0023: optional, human-picked, neutral reason category (#8).
          public_reason: string | null;
          created_at: string;
        };
        Insert: {
          application_id: string;
          from_status?: AppStatus | null;
          to_status: AppStatus;
          changed_by?: string | null;
          note?: string | null;
          public_reason?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      submission_attempts: {
        Row: {
          id: number;
          ip_hash: string;
          email_hash: string;
          job_id: string | null;
          created_at: string;
        };
        Insert: {
          ip_hash: string;
          email_hash: string;
          job_id?: string | null;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      // ---- 0019/0021: virtual interview, platform side (D30) ----
      interview_assignments: {
        Row: {
          id: string;
          org_id: string;
          application_id: string;
          external_interview_id: string | null;
          status: InterviewStatus;
          status_at: string;
          modes: string[];
          question_count: number;
          duration_minutes: number;
          candidate_result: "none" | "completion" | "summary";
          paste_policy: "record" | "block";
          opens_at: string | null;
          closes_at: string | null;
          config: Json;
          last_error: string | null;
          // 0021
          job_bank_id: string | null;
          bank_hash: string | null;
          bank_locked_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        // Written only by the interview-gateway / interview-webhook
        // functions as the service role; no client role may insert.
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      interview_reports: {
        Row: {
          id: string;
          org_id: string;
          assignment_id: string;
          overall_score: number | null;
          confidence: "high" | "medium" | "low" | null;
          report: Json;
          bank_hash: string | null;
          model: string | null;
          prompt_versions: Json | null;
          received_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      interview_job_banks: {
        Row: {
          id: string;
          org_id: string;
          job_id: string;
          external_bank_id: string | null;
          version: number;
          status: JobBankStatus;
          bank_hash: string | null;
          question_count: number;
          approved_count: number;
          last_error: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          locked_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      // 0025: billing. Every table below is written only by security
      // definer functions — never through the client — hence the empty
      // Insert/Update shapes (all four keys are still required by
      // supabase-js's schema constraint).
      plans: {
        Row: {
          code: string;
          name_ar: string;
          price_monthly_halalas: number;
          price_yearly_halalas: number;
          max_active_jobs: number | null;
          max_seats: number | null;
          monthly_analysis_quota: number | null;
          monthly_interview_quota: number | null;
          custom_domain: boolean;
          remove_branding: boolean;
          api_access: boolean;
          self_serve: boolean;
          is_public: boolean;
          sort_order: number;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          org_id: string;
          plan_code: string;
          billing_cycle: "monthly" | "yearly";
          current_period_start: string;
          current_period_end: string | null;
          provider: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      plan_requests: {
        Row: {
          id: string;
          org_id: string;
          plan_code: string;
          billing_cycle: "monthly" | "yearly";
          amount_halalas: number;
          vat_halalas: number;
          reference: string;
          status: "pending" | "approved" | "rejected" | "cancelled";
          requested_by: string | null;
          decided_by: string | null;
          decided_at: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          org_id: string;
          number: string;
          plan_code: string;
          request_id: string | null;
          amount_halalas: number;
          vat_halalas: number;
          status: "open" | "paid" | "void" | "refunded";
          provider: string;
          provider_payment_id: string | null;
          period_start: string | null;
          period_end: string | null;
          zatca_uuid: string | null;
          zatca_hash: string | null;
          zatca_qr: string | null;
          issued_at: string;
          paid_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          org_id: string | null;
          actor_user_id: string | null;
          actor_kind: "user" | "platform_admin" | "system";
          action: string;
          target_type: string | null;
          target_id: string | null;
          meta: Json;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // 0025: billing
      org_billing_overview: {
        Args: { p_org: string };
        Returns: unknown;
      };
      request_plan_change: {
        Args: { p_org: string; p_plan: string };
        Returns: unknown;
      };
      cancel_plan_request: {
        Args: { p_request: string };
        Returns: undefined;
      };
      workspace_today: {
        Args: { p_org: string };
        Returns: unknown;
      };
      search_workspace: {
        Args: { p_org: string; p_q: string };
        Returns: unknown;
      };
      platform_billing_overview: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      platform_apply_plan: {
        Args: { p_org: string; p_plan: string; p_note?: string | null };
        Returns: undefined;
      };
      platform_confirm_request: {
        Args: { p_request: string; p_payment_ref?: string | null };
        Returns: unknown;
      };
      platform_reject_request: {
        Args: { p_request: string; p_note?: string | null };
        Returns: undefined;
      };
      platform_set_limits: {
        Args: {
          p_org: string;
          p_analyses: number | null;
          p_interviews: number | null;
          p_active_jobs: number | null;
          p_seats: number | null;
        };
        Returns: undefined;
      };
      change_application_status: {
        Args: {
          p_application_id: string;
          p_new_status: AppStatus;
          p_note?: string | null;
          // 0023: optional, human-picked, neutral reason category (#8).
          p_public_reason?: string | null;
        };
        Returns: undefined;
      };
      current_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      current_membership_org_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
      is_org_member: {
        Args: { p_org: string; p_roles?: MemberRole[] };
        Returns: boolean;
      };
      org_role: {
        Args: { p_org: string };
        Returns: MemberRole | null;
      };
      org_is_public: {
        Args: { p_org: string };
        Returns: boolean;
      };
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      can_manage_application: {
        Args: { p_application_id: string };
        Returns: boolean;
      };
      record_submission_attempt: {
        Args: {
          p_ip_hash: string;
          p_email_hash: string;
          p_job_id: string | null;
        };
        Returns: string | null;
      };
      track_application: {
        Args: { p_ref_code: string };
        Returns: { to_status: AppStatus; created_at: string }[];
      };
      create_organization: {
        Args: { p_name: string; p_slug: string; p_full_name: string };
        Returns: string;
      };
      accept_invitation: {
        Args: { p_token: string; p_full_name?: string | null };
        Returns: string;
      };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          org_name: string;
          role: MemberRole;
          expires_at: string;
        }[];
      };
      slug_available: {
        Args: { p_slug: string };
        Returns: boolean;
      };
      // 0013: dashboard aggregates computed in the database.
      org_stats: {
        Args: { p_org: string };
        Returns: unknown;
      };
      // 0024: org-wide candidate search by extracted skill (#6).
      search_candidates: {
        Args: {
          p_org: string;
          p_skill?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: unknown;
      };
      // 0017: the talent schema is not exposed through the API; these
      // wrappers in public are its entire surface.
      talent_publish_profile: {
        Args: {
          p_token: string;
          p_full_name: string | null;
          p_headline: string | null;
          p_city: string | null;
          p_years: number | null;
          p_about: string | null;
          p_hidden_skills: string[];
          p_consent_public: boolean;
          p_consent_offers: boolean;
          p_noindex: boolean;
        };
        Returns: unknown;
      };
      talent_review_profile: {
        Args: { p_token: string };
        Returns: unknown;
      };
      talent_set_visibility: {
        Args: { p_token: string; p_visible: boolean };
        Returns: unknown;
      };
      talent_delete_profile: {
        Args: { p_token: string };
        Returns: unknown;
      };
      // 0017: the only API path into the talent schema.
      talent_public_profile: {
        Args: { p_token: string };
        Returns: unknown;
      };
      // 0016: Saudization panel, read-only for members.
      org_saudization: {
        Args: { p_org: string };
        Returns: unknown;
      };
      // 0015: D24 evidence document for one application.
      application_transparency_report: {
        Args: { p_application: string };
        Returns: unknown;
      };
      // 0014: quota, read-only for members.
      org_quota: {
        Args: { p_org: string };
        Returns: unknown;
      };
      // 0012: atomic claim, service role only.
      claim_application_for_analysis: {
        Args: { p_application_id: string; p_force?: boolean };
        Returns: boolean;
      };
      // ---- 0020: seeker accounts (D26/D27) ----
      // Routing hint only — which "hats" the signed-in user wears. Never an
      // authorization input: requireMembership()/requireSeeker() decide.
      my_hats: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      // The caller's own talent profile, or null. Columns chosen in SQL.
      talent_my_profile: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
      talent_save_my_contact: {
        Args: {
          p_full_name: string | null;
          p_phone: string | null;
          p_city: string | null;
          p_preferences: Json;
        };
        Returns: unknown;
      };
      talent_save_my_review: {
        Args: {
          p_full_name: string | null;
          p_headline: string | null;
          p_city: string | null;
          p_years: number | null;
          p_about: string | null;
          p_hidden_skills: string[];
        };
        Returns: unknown;
      };
      talent_set_my_consents: {
        Args: {
          p_consent_public: boolean;
          p_consent_offers: boolean;
          p_noindex: boolean;
        };
        Returns: unknown;
      };
      talent_legacy_profile_available: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      talent_link_legacy_profile: {
        Args: { p_token: string };
        Returns: unknown;
      };
      // The caller's own applications. Never any AI evaluation (FR-08 parity).
      my_applications: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          ref_code: string;
          job_id: string;
          job_title: string;
          org_name: string;
          org_slug: string;
          status: AppStatus;
          created_at: string;
          history: Json;
        }[];
      };
      // ---- 0021: interview question banks (I1) ----
      can_manage_job: {
        Args: { p_job_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      job_status: JobStatus;
      job_type: JobType;
      app_status: AppStatus;
      analysis_status: AnalysisStatus;
      member_role: MemberRole;
      org_status: OrgStatus;
      invite_status: InviteStatus;
      interview_status: InterviewStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
