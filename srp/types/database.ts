// Hand-written to mirror supabase/migrations/0001_init.sql exactly.
// Replace with `supabase gen types typescript` output once a database is
// available (local Docker stack or linked project) — keep in sync until then.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "admin" | "hr";
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: UserRole;
          full_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: UserRole;
          full_name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          full_name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: number;
          company_name: string;
          retention_months: number;
        };
        Insert: {
          id?: number;
          company_name?: string;
          retention_months?: number;
        };
        Update: {
          id?: number;
          company_name?: string;
          retention_months?: number;
        };
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
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
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
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
          screening_answers: Json;
          interview_at: string | null;
          interview_qa: Json;
          created_at: string;
        };
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
          screening_answers?: Json;
          interview_at?: string | null;
          interview_qa?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          ref_code?: string;
          full_name?: string;
          email?: string;
          phone?: string;
          cv_path?: string;
          cv_mime?: string;
          cover_note?: string | null;
          status?: AppStatus;
          analysis_status?: AnalysisStatus;
          analysis_attempts?: number;
          screening_answers?: Json;
          interview_at?: string | null;
          interview_qa?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_evaluations: {
        Row: {
          id: string;
          application_id: string;
          model: string;
          prompt_version: string;
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
        Update: {
          id?: string;
          application_id?: string;
          model?: string;
          prompt_version?: string;
          extracted?: Json;
          fit_score?: number;
          score_breakdown?: Json;
          justification?: Json;
          interview_questions?: Json;
          interview_notes?: string | null;
          created_at?: string;
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
        Update: {
          application_id?: string;
          from_status?: AppStatus | null;
          to_status?: AppStatus;
          changed_by?: string | null;
          note?: string | null;
          created_at?: string;
        };
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
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: UserRole | null;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      track_application: {
        Args: { p_ref_code: string };
        Returns: { to_status: AppStatus; created_at: string }[];
      };
    };
    Enums: {
      job_status: JobStatus;
      job_type: JobType;
      app_status: AppStatus;
      analysis_status: AnalysisStatus;
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
