import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { getToday } from "@/lib/dose-events";
import { getSupabaseToday } from "@/lib/supabase/dose-events";
import { getPatientOrThrow } from "@/lib/household";

export const TodayRepository = {
  async getTodayGroups() {
    if (usesSupabaseAuth()) {
      return await getSupabaseToday();
    }
    const patient = await getPatientOrThrow();
    return await getToday(patient);
  },
};
