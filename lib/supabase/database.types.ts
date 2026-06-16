export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          wallet_address: string;
          wallet_address_normalized: string;
          chain_id: number | null;
          display_name: string | null;
          avatar_url: string | null;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          wallet_address_normalized: string;
          chain_id?: number | null;
          display_name?: string | null;
          avatar_url?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          wallet_address_normalized?: string;
          chain_id?: number | null;
          display_name?: string | null;
          avatar_url?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      auth_challenges: {
        Row: {
          id: string;
          wallet_address_normalized: string;
          chain_id: number;
          nonce: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          wallet_address_normalized: string;
          chain_id: number;
          nonce: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          wallet_address_normalized?: string;
          chain_id?: number;
          nonce?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      auth_sessions: {
        Row: {
          id: string;
          user_id: string;
          wallet_address_normalized: string;
          chain_id: number;
          token_hash: string;
          expires_at: string;
          revoked_at: string | null;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          wallet_address_normalized: string;
          chain_id: number;
          token_hash: string;
          expires_at: string;
          revoked_at?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          wallet_address_normalized?: string;
          chain_id?: number;
          token_hash?: string;
          expires_at?: string;
          revoked_at?: string | null;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "auth_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
