"use server";

import {
  persistHelpGapEvent,
  type PersistHelpGapEventInput,
  type PersistHelpGapResult,
} from "@/lib/help-assistant/help-gap-persistence";
import { createClient } from "@/lib/supabase/server";

export async function persistHelpGapEventFromAssistantAction(
  input: PersistHelpGapEventInput,
): Promise<PersistHelpGapResult> {
  const supabase = await createClient();
  return persistHelpGapEvent(input, { supabase });
}
