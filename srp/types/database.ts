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
          counts_toward_saudization: boolean | null;
          // 0013: trigger-maintained copy of ai_evaluations.fit_score, so the
          // ranked list can be served from an index.
          fit_score: number | null;
          screening_answers: Json;
          interview_at: string | null;
          interview_qa: Json;
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
      status_history: {
        Row: {
          id: number;
          org_id: string;
          application_id: string;
          from_status: AppStatus | null;
          to_status: AppStatus;
          changed_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          application_id: string;
          from_status?: AppStatus | null;
          to_status: AppStatus;
          changed_by?: string | null;
          note?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      change_application_status: {
        Args: {
          p_application_id: string;
          p_new_status: AppStatus;
          p_note?: string | null;
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
    };
    Enums: {
      job_status: JobStatus;
      job_type: JobType;
      app_status: AppStatus;
      analysis_status: AnalysisStatus;
      member_role: MemberRole;
      org_status: OrgStatus;
      invite_status: InviteStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
