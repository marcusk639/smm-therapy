import { serve } from "inngest/next";
import { inngest } from "@smm/inngest/client";
import { functions } from "@smm/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
