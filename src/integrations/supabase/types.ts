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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      execution_steps: {
        Row: {
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          execution_id: string
          finished_at: string | null
          id: string
          input: Json | null
          node_id: string
          node_type: string
          output: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["execution_status"]
        }
        Insert: {
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          execution_id: string
          finished_at?: string | null
          id?: string
          input?: Json | null
          node_id: string
          node_type: string
          output?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
        }
        Update: {
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          execution_id?: string
          finished_at?: string | null
          id?: string
          input?: Json | null
          node_id?: string
          node_type?: string
          output?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
        }
        Relationships: [
          {
            foreignKeyName: "execution_steps_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "executions"
            referencedColumns: ["id"]
          },
        ]
      }
      executions: {
        Row: {
          duration_ms: number | null
          error_summary: string | null
          finished_at: string | null
          id: string
          mode: Database["public"]["Enums"]["execution_mode"]
          started_at: string
          status: Database["public"]["Enums"]["execution_status"]
          trigger_payload: Json | null
          workflow_id: string
          workflow_version_id: string | null
        }
        Insert: {
          duration_ms?: number | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["execution_mode"]
          started_at?: string
          status?: Database["public"]["Enums"]["execution_status"]
          trigger_payload?: Json | null
          workflow_id: string
          workflow_version_id?: string | null
        }
        Update: {
          duration_ms?: number | null
          error_summary?: string | null
          finished_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["execution_mode"]
          started_at?: string
          status?: Database["public"]["Enums"]["execution_status"]
          trigger_payload?: Json | null
          workflow_id?: string
          workflow_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "executions_workflow_version_id_fkey"
            columns: ["workflow_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          account_label: string | null
          connected_at: string | null
          created_at: string
          id: string
          last_checked_at: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          scopes: string[]
          status: Database["public"]["Enums"]["integration_status"]
          user_id: string
        }
        Insert: {
          account_label?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_checked_at?: string | null
          provider: Database["public"]["Enums"]["integration_provider"]
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          user_id: string
        }
        Update: {
          account_label?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_checked_at?: string | null
          provider?: Database["public"]["Enums"]["integration_provider"]
          scopes?: string[]
          status?: Database["public"]["Enums"]["integration_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          default_test_mode: string
          display_name: string
          id: string
          notify_execution_failures: boolean
          notify_weekly_summary: boolean
          onboarding_completed: boolean
          timezone: string
          updated_at: string
          workspace_name: string
        }
        Insert: {
          created_at?: string
          default_test_mode?: string
          display_name?: string
          id: string
          notify_execution_failures?: boolean
          notify_weekly_summary?: boolean
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
          workspace_name?: string
        }
        Update: {
          created_at?: string
          default_test_mode?: string
          display_name?: string
          id?: string
          notify_execution_failures?: boolean
          notify_weekly_summary?: boolean
          onboarding_completed?: boolean
          timezone?: string
          updated_at?: string
          workspace_name?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          category: string
          complexity: string
          created_at: string
          definition: Json
          description: string
          id: string
          is_published: boolean
          name: string
          slug: string
        }
        Insert: {
          category: string
          complexity?: string
          created_at?: string
          definition: Json
          description: string
          id?: string
          is_published?: boolean
          name: string
          slug: string
        }
        Update: {
          category?: string
          complexity?: string
          created_at?: string
          definition?: Json
          description?: string
          id?: string
          is_published?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      usage_records: {
        Row: {
          id: string
          quantity: number
          recorded_at: string
          usage_type: string
          workspace_id: string
        }
        Insert: {
          id?: string
          quantity?: number
          recorded_at?: string
          usage_type: string
          workspace_id: string
        }
        Update: {
          id?: string
          quantity?: number
          recorded_at?: string
          usage_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_records_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      workflow_versions: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          version: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: Json
          id?: string
          version: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          active_version_id: string | null
          created_at: string
          description: string
          id: string
          name: string
          status: Database["public"]["Enums"]["workflow_status"]
          trigger_type: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          active_version_id?: string | null
          created_at?: string
          description?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["workflow_status"]
          trigger_type?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          active_version_id?: string | null
          created_at?: string
          description?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["workflow_status"]
          trigger_type?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      execution_mode: "simulation" | "live"
      execution_status:
        | "queued"
        | "running"
        | "waiting"
        | "succeeded"
        | "partially_succeeded"
        | "failed"
        | "cancelled"
      integration_provider: "google_mail" | "google_sheets"
      integration_status:
        | "not_connected"
        | "connected"
        | "reconnect_required"
        | "setup_required"
      workflow_status:
        | "draft"
        | "needs_configuration"
        | "active"
        | "paused"
        | "error"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user"],
      execution_mode: ["simulation", "live"],
      execution_status: [
        "queued",
        "running",
        "waiting",
        "succeeded",
        "partially_succeeded",
        "failed",
        "cancelled",
      ],
      integration_provider: ["google_mail", "google_sheets"],
      integration_status: [
        "not_connected",
        "connected",
        "reconnect_required",
        "setup_required",
      ],
      workflow_status: [
        "draft",
        "needs_configuration",
        "active",
        "paused",
        "error",
      ],
    },
  },
} as const
