import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

import { getSupabasePublishableKey, getSupabaseUrl } from "./config";
import type { Database } from "./database.types";

export function createSupabaseServerClient(cookies: CookieMethodsServer) {
  return createServerClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies,
  });
}

