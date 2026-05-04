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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_name: string | null
          account_type: string | null
          broker: string | null
          commission_per_contract: number | null
          created_at: string
          daily_loss_limit: number | null
          external_account_id: string | null
          external_source: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          max_loss_limit: number | null
          name: string
          starting_balance: number | null
          sync_error: string | null
          sync_status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_name?: string | null
          account_type?: string | null
          broker?: string | null
          commission_per_contract?: number | null
          created_at?: string
          daily_loss_limit?: number | null
          external_account_id?: string | null
          external_source?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          max_loss_limit?: number | null
          name: string
          starting_balance?: number | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_name?: string | null
          account_type?: string | null
          broker?: string | null
          commission_per_contract?: number | null
          created_at?: string
          daily_loss_limit?: number | null
          external_account_id?: string | null
          external_source?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          max_loss_limit?: number | null
          name?: string
          starting_balance?: number | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      daily_reviews: {
        Row: {
          best_trade: string | null
          created_at: string
          daily_loss_limit_hit: boolean | null
          daily_summary: string | null
          did_well: string | null
          did_wrong: string | null
          discipline_score: number | null
          emotional_score: number | null
          emotional_control_score: number | null
          execution_score: number | null
          final_summary: string | null
          final_takeaway: string | null
          id: string
          lessons: string | null
          main_lesson: string | null
          main_catalyst: string | null
          market_context: string | null
          market_state: string | null
          overtraded: boolean | null
          questions_for_chatgpt: string | null
          reduce_size_tomorrow: boolean | null
          review_date: string
          rule_for_tomorrow: string | null
          should_reduce_size_tomorrow: boolean | null
          total_pnl: number | null
          trades_count: number | null
          updated_at: string
          user_id: string | null
          what_i_did_well: string | null
          what_i_did_wrong: string | null
          worst_trade: string | null
        }
        Insert: {
          best_trade?: string | null
          created_at?: string
          daily_loss_limit_hit?: boolean | null
          daily_summary?: string | null
          did_well?: string | null
          did_wrong?: string | null
          discipline_score?: number | null
          emotional_score?: number | null
          emotional_control_score?: number | null
          execution_score?: number | null
          final_summary?: string | null
          final_takeaway?: string | null
          id?: string
          lessons?: string | null
          main_lesson?: string | null
          main_catalyst?: string | null
          market_context?: string | null
          market_state?: string | null
          overtraded?: boolean | null
          questions_for_chatgpt?: string | null
          reduce_size_tomorrow?: boolean | null
          review_date: string
          rule_for_tomorrow?: string | null
          should_reduce_size_tomorrow?: boolean | null
          total_pnl?: number | null
          trades_count?: number | null
          updated_at?: string
          user_id?: string | null
          what_i_did_well?: string | null
          what_i_did_wrong?: string | null
          worst_trade?: string | null
        }
        Update: {
          best_trade?: string | null
          created_at?: string
          daily_loss_limit_hit?: boolean | null
          daily_summary?: string | null
          did_well?: string | null
          did_wrong?: string | null
          discipline_score?: number | null
          emotional_score?: number | null
          emotional_control_score?: number | null
          execution_score?: number | null
          final_summary?: string | null
          final_takeaway?: string | null
          id?: string
          lessons?: string | null
          main_lesson?: string | null
          main_catalyst?: string | null
          market_context?: string | null
          market_state?: string | null
          overtraded?: boolean | null
          questions_for_chatgpt?: string | null
          reduce_size_tomorrow?: boolean | null
          review_date?: string
          rule_for_tomorrow?: string | null
          should_reduce_size_tomorrow?: boolean | null
          total_pnl?: number | null
          trades_count?: number | null
          updated_at?: string
          user_id?: string | null
          what_i_did_well?: string | null
          what_i_did_wrong?: string | null
          worst_trade?: string | null
        }
        Relationships: []
      }
      screenshots: {
        Row: {
          created_at: string
          id: string
          kind: string
          public_url: string | null
          review_id: string | null
          screenshot_context: string | null
          screenshot_type: string | null
          storage_path: string | null
          trade_id: string | null
          uploaded_at: string | null
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          public_url?: string | null
          review_id?: string | null
          screenshot_context?: string | null
          screenshot_type?: string | null
          storage_path?: string | null
          trade_id?: string | null
          uploaded_at?: string | null
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          public_url?: string | null
          review_id?: string | null
          screenshot_context?: string | null
          screenshot_type?: string | null
          storage_path?: string | null
          trade_id?: string | null
          uploaded_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenshots_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "daily_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshots_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          account_id: string | null
          account_name: string | null
          catalyst: string | null
          catalyst_manual_override: boolean | null
          commissions: number | null
          contract_name: string | null
          created_at: string
          direction: string
          emotional_state: string | null
          entry_at: string | null
          entry_price: number | null
          entry_time: string | null
          exit_at: string | null
          exit_price: number | null
          exit_time: string | null
          external_account_id: string | null
          external_source: string | null
          external_trade_id: string | null
          followed_plan: string | null
          gross_pnl: number | null
          id: string
          instrument: string
          is_manual_override: boolean | null
          lesson: string | null
          max_position_size: number | null
          market_condition: string | null
          mistake_type: string | null
          net_pnl: number | null
          notes: string | null
          order_type: string | null
          points: number | null
          position_size: number
          setup_type: string | null
          size: number | null
          source: string | null
          stop_price: number | null
          superseded_at: string | null
          superseded_by: string | null
          superseded_reason: string | null
          sync_hash: string | null
          synced_at: string | null
          target_price: number | null
          trade_date: string
          trade_quality: string | null
          total_opened_size: number | null
          executions_count: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          account_name?: string | null
          catalyst?: string | null
          catalyst_manual_override?: boolean | null
          commissions?: number | null
          contract_name?: string | null
          created_at?: string
          direction: string
          emotional_state?: string | null
          entry_at?: string | null
          entry_price?: number | null
          entry_time?: string | null
          exit_at?: string | null
          exit_price?: number | null
          exit_time?: string | null
          external_account_id?: string | null
          external_source?: string | null
          external_trade_id?: string | null
          followed_plan?: string | null
          gross_pnl?: number | null
          id?: string
          instrument: string
          is_manual_override?: boolean | null
          lesson?: string | null
          max_position_size?: number | null
          market_condition?: string | null
          mistake_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          order_type?: string | null
          points?: number | null
          position_size?: number
          setup_type?: string | null
          size?: number | null
          source?: string | null
          stop_price?: number | null
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_reason?: string | null
          sync_hash?: string | null
          synced_at?: string | null
          target_price?: number | null
          trade_date: string
          trade_quality?: string | null
          total_opened_size?: number | null
          executions_count?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          account_name?: string | null
          catalyst?: string | null
          catalyst_manual_override?: boolean | null
          commissions?: number | null
          contract_name?: string | null
          created_at?: string
          direction?: string
          emotional_state?: string | null
          entry_at?: string | null
          entry_price?: number | null
          entry_time?: string | null
          exit_at?: string | null
          exit_price?: number | null
          exit_time?: string | null
          external_account_id?: string | null
          external_source?: string | null
          external_trade_id?: string | null
          followed_plan?: string | null
          gross_pnl?: number | null
          id?: string
          instrument?: string
          is_manual_override?: boolean | null
          lesson?: string | null
          max_position_size?: number | null
          market_condition?: string | null
          mistake_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          order_type?: string | null
          points?: number | null
          position_size?: number
          setup_type?: string | null
          size?: number | null
          source?: string | null
          stop_price?: number | null
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_reason?: string | null
          sync_hash?: string | null
          synced_at?: string | null
          target_price?: number | null
          trade_date?: string
          trade_quality?: string | null
          total_opened_size?: number | null
          executions_count?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      trade_executions: {
        Row: {
          account_id: string | null
          commissions: number | null
          contract_name: string | null
          created_at: string
          executed_at: string | null
          execution_role: string | null
          external_account_id: string | null
          external_execution_id: string | null
          external_order_id: string | null
          fees: number | null
          id: string
          price: number | null
          raw_payload: Json | null
          side: string | null
          size: number | null
          trade_id: string
        }
        Insert: {
          account_id?: string | null
          commissions?: number | null
          contract_name?: string | null
          created_at?: string
          executed_at?: string | null
          execution_role?: string | null
          external_account_id?: string | null
          external_execution_id?: string | null
          external_order_id?: string | null
          fees?: number | null
          id?: string
          price?: number | null
          raw_payload?: Json | null
          side?: string | null
          size?: number | null
          trade_id: string
        }
        Update: {
          account_id?: string | null
          commissions?: number | null
          contract_name?: string | null
          created_at?: string
          executed_at?: string | null
          execution_role?: string | null
          external_account_id?: string | null
          external_execution_id?: string | null
          external_order_id?: string | null
          fees?: number | null
          id?: string
          price?: number | null
          raw_payload?: Json | null
          side?: string | null
          size?: number | null
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_executions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_status: {
        Row: {
          id: string
          is_reconnecting: boolean | null
          last_attempt_at: string | null
          last_success_at: string | null
          message: string | null
          status: string
          updated_at: string
        }
        Insert: {
          id: string
          is_reconnecting?: boolean | null
          last_attempt_at?: string | null
          last_success_at?: string | null
          message?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          id?: string
          is_reconnecting?: boolean | null
          last_attempt_at?: string | null
          last_success_at?: string | null
          message?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
