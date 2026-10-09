export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      artist_picks: {
        Row: {
          artist_id: string
          festival_id: string
          priority: number
          updated_at: string
          user_id: string
        }
        Insert: {
          artist_id: string
          festival_id: string
          priority: number
          updated_at?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          festival_id?: string
          priority?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_picks_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_picks_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artist_picks_user_id_festival_id_fkey"
            columns: ["user_id", "festival_id"]
            isOneToOne: false
            referencedRelation: "festival_attendees"
            referencedColumns: ["user_id", "festival_id"]
          },
          {
            foreignKeyName: "artist_picks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          apple_music_id: string | null
          created_at: string
          id: string
          name: string
          normalized_name: string
          spotify_id: string | null
        }
        Insert: {
          apple_music_id?: string | null
          created_at?: string
          id?: string
          name: string
          normalized_name: string
          spotify_id?: string | null
        }
        Update: {
          apple_music_id?: string | null
          created_at?: string
          id?: string
          name?: string
          normalized_name?: string
          spotify_id?: string | null
        }
        Relationships: []
      }
      edit_proposals: {
        Row: {
          created_at: string
          festival_id: string
          id: string
          kind: Database["public"]["Enums"]["proposal_kind"]
          note: string | null
          payload: Json
          proposer_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["proposal_status"]
        }
        Insert: {
          created_at?: string
          festival_id: string
          id?: string
          kind: Database["public"]["Enums"]["proposal_kind"]
          note?: string | null
          payload: Json
          proposer_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Update: {
          created_at?: string
          festival_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["proposal_kind"]
          note?: string | null
          payload?: Json
          proposer_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "edit_proposals_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_proposals_proposer_id_fkey"
            columns: ["proposer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_proposals_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      festival_attendees: {
        Row: {
          created_at: string
          festival_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          festival_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          festival_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "festival_attendees_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "festival_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      festivals: {
        Row: {
          clashfinder_id: string | null
          created_at: string
          created_by: string | null
          day_boundary_hour: number
          ends_on: string | null
          id: string
          last_synced_at: string | null
          location: string | null
          name: string
          slug: string
          starts_on: string | null
          timezone: string
        }
        Insert: {
          clashfinder_id?: string | null
          created_at?: string
          created_by?: string | null
          day_boundary_hour?: number
          ends_on?: string | null
          id?: string
          last_synced_at?: string | null
          location?: string | null
          name: string
          slug: string
          starts_on?: string | null
          timezone?: string
        }
        Update: {
          clashfinder_id?: string | null
          created_at?: string
          created_by?: string | null
          day_boundary_hour?: number
          ends_on?: string | null
          id?: string
          last_synced_at?: string | null
          location?: string | null
          name?: string
          slug?: string
          starts_on?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "festivals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["friendship_status"]
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      liked_artists: {
        Row: {
          name: string
          normalized_name: string
          provider: Database["public"]["Enums"]["music_provider"]
          provider_artist_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          name: string
          normalized_name: string
          provider: Database["public"]["Enums"]["music_provider"]
          provider_artist_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          name?: string
          normalized_name?: string
          provider?: Database["public"]["Enums"]["music_provider"]
          provider_artist_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liked_artists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      music_connections: {
        Row: {
          access_token: string
          connected_at: string
          expires_at: string | null
          last_synced_at: string | null
          provider: Database["public"]["Enums"]["music_provider"]
          provider_user_id: string | null
          refresh_token: string | null
          storefront: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          expires_at?: string | null
          last_synced_at?: string | null
          provider: Database["public"]["Enums"]["music_provider"]
          provider_user_id?: string | null
          refresh_token?: string | null
          storefront?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          expires_at?: string | null
          last_synced_at?: string | null
          provider?: Database["public"]["Enums"]["music_provider"]
          provider_user_id?: string | null
          refresh_token?: string | null
          storefront?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performances: {
        Row: {
          artist_id: string
          created_at: string
          ends_at: string | null
          external_key: string | null
          festival_id: string
          id: string
          locally_modified: boolean
          source: Database["public"]["Enums"]["performance_source"]
          stage_id: string | null
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          ends_at?: string | null
          external_key?: string | null
          festival_id: string
          id?: string
          locally_modified?: boolean
          source?: Database["public"]["Enums"]["performance_source"]
          stage_id?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          ends_at?: string | null
          external_key?: string | null
          festival_id?: string
          id?: string
          locally_modified?: boolean
          source?: Database["public"]["Enums"]["performance_source"]
          stage_id?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performances_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performances_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performances_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      playlist_exports: {
        Row: {
          exported_at: string
          festival_id: string
          playlist_id: string
          playlist_url: string | null
          provider: Database["public"]["Enums"]["music_provider"]
          track_count: number
          user_id: string
        }
        Insert: {
          exported_at?: string
          festival_id: string
          playlist_id: string
          playlist_url?: string | null
          provider: Database["public"]["Enums"]["music_provider"]
          track_count?: number
          user_id: string
        }
        Update: {
          exported_at?: string
          festival_id?: string
          playlist_id?: string
          playlist_url?: string | null
          provider?: Database["public"]["Enums"]["music_provider"]
          track_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_exports_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playlist_exports_user_id_fkey"
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
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          username: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          username: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          username?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          festival_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          festival_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          festival_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "stages_festival_id_fkey"
            columns: ["festival_id"]
            isOneToOne: false
            referencedRelation: "festivals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_festival: {
        Args: { fid: string; uid: string }
        Returns: boolean
      }
      set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"]
          target_username: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "user" | "moderator" | "admin"
      friendship_status: "pending" | "accepted"
      music_provider: "spotify" | "apple_music"
      performance_source: "clashfinder" | "manual"
      proposal_kind:
        | "add_performance"
        | "update_performance"
        | "remove_performance"
      proposal_status: "pending" | "approved" | "rejected"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["user", "moderator", "admin"],
      friendship_status: ["pending", "accepted"],
      music_provider: ["spotify", "apple_music"],
      performance_source: ["clashfinder", "manual"],
      proposal_kind: [
        "add_performance",
        "update_performance",
        "remove_performance",
      ],
      proposal_status: ["pending", "approved", "rejected"],
    },
  },
} as const

