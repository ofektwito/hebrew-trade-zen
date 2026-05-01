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
          broker: string | null
          created_at: string
          id: string
          name: string
          starting_balance: number | null
        }
        Insert: {
          broker?: string | null
          created_at?: string
          id?: string
          name: string
          starting_balance?: number | null
        }
        Update: {
          broker?: string | null
          created_at?: string
          id?: string
          name?: string
          starting_balance?: number | null
        }
        Relationships: []
      }
      daily_reviews: {
        Row: {
          best_trade: string | null
          created_at: string
          did_well: string | null
          did_wrong: string | null
          discipline_score: number | null
          emotional_score: number | null
          execution_score: number | null
          final_summary: string | null
          id: string
          lessons: string | null
          main_catalyst: string | null
          market_context: string | null
          reduce_size_tomorrow: boolean | null
          review_date: string
          rule_for_tomorrow: string | null
          total_pnl: number | null
          trades_count: number | null
          updated_at: string
          worst_trade: string | null
        }
        Insert: {
          best_trade?: string | null
          created_at?: string
          did_well?: string | null
          did_wrong?: string | null
          discipline_score?: number | null
          emotional_score?: number | null
          execution_score?: number | null
          final_summary?: string | null
          id?: string
          lessons?: string | null
          main_catalyst?: string | null
          market_context?: string | null
          reduce_size_tomorrow?: boolean | null
          review_date: string
          rule_for_tomorrow?: string | null
          total_pnl?: number | null
          trades_count?: number | null
          updated_at?: string
          worst_trade?: string | null
        }
        Update: {
          best_trade?: string | null
          created_at?: string
          did_well?: string | null
          did_wrong?: string | null
          discipline_score?: number | null
          emotional_score?: number | null
          execution_score?: number | null
          final_summary?: string | null
          id?: string
          lessons?: string | null
          main_catalyst?: string | null
          market_context?: string | null
          reduce_size_tomorrow?: boolean | null
          review_date?: string
          rule_for_tomorrow?: string | null
          total_pnl?: number | null
          trades_count?: number | null
          updated_at?: string
          worst_trade?: string | null
        }
        Relationships: []
      }
      screenshots: {
        Row: {
          created_at: string
          id: string
          kind: string
          trade_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          trade_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          trade_id?: string
          url?: string
        }
        Relationships: [
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
          account_name: string | null
          catalyst: string | null
          commissions: number | null
          contract_name: string | null
          created_at: string
          direction: string
          emotional_state: string | null
          entry_price: number | null
          entry_time: string | null
          exit_price: number | null
          exit_time: string | null
          followed_plan: string | null
          gross_pnl: number | null
          id: string
          instrument: string
          lesson: string | null
          market_condition: string | null
          mistake_type: string | null
          net_pnl: number | null
          notes: string | null
          order_type: string | null
          points: number | null
          position_size: number
          setup_type: string | null
          stop_price: number | null
          target_price: number | null
          trade_date: string
          trade_quality: string | null
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          catalyst?: string | null
          commissions?: number | null
          contract_name?: string | null
          created_at?: string
          direction: string
          emotional_state?: string | null
          entry_price?: number | null
          entry_time?: string | null
          exit_price?: number | null
          exit_time?: string | null
          followed_plan?: string | null
          gross_pnl?: number | null
          id?: string
          instrument: string
          lesson?: string | null
          market_condition?: string | null
          mistake_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          order_type?: string | null
          points?: number | null
          position_size?: number
          setup_type?: string | null
          stop_price?: number | null
          target_price?: number | null
          trade_date: string
          trade_quality?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          catalyst?: string | null
          commissions?: number | null
          contract_name?: string | null
          created_at?: string
          direction?: string
          emotional_state?: string | null
          entry_price?: number | null
          entry_time?: string | null
          exit_price?: number | null
          exit_time?: string | null
          followed_plan?: string | null
          gross_pnl?: number | null
          id?: string
          instrument?: string
          lesson?: string | null
          market_condition?: string | null
          mistake_type?: string | null
          net_pnl?: number | null
          notes?: string | null
          order_type?: string | null
          points?: number | null
          position_size?: number
          setup_type?: string | null
          stop_price?: number | null
          target_price?: number | null
          trade_date?: string
          trade_quality?: string | null
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
