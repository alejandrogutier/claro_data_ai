import { randomUUID } from "crypto";
import { runSocialSync } from "./runner";

type SocialSchedulerEvent = {
  trigger_type?: "scheduled" | "manual";
  request_id?: string;
  requested_at?: string;
  run_id?: string;
  force?: boolean;
  bucket?: string;
  prefix?: string;
};

export const main = async (event: SocialSchedulerEvent) => {
  const requestId =
    typeof event?.request_id === "string" && event.request_id.trim() ? event.request_id.trim() : `social-sync-${randomUUID()}`;

  const requestedAt =
    typeof event?.requested_at === "string" && event.requested_at.trim() ? event.requested_at.trim() : new Date().toISOString();

  const result = await runSocialSync({
    triggerType: event?.trigger_type === "manual" ? "manual" : "scheduled",
    requestId,
    runId: typeof event?.run_id === "string" && event.run_id.trim() ? event.run_id.trim() : undefined,
    force: Boolean(event?.force),
    bucket: typeof event?.bucket === "string" && event.bucket.trim() ? event.bucket.trim() : undefined,
    prefix: typeof event?.prefix === "string" && event.prefix.trim() ? event.prefix.trim() : undefined
  });

  console.log(
    JSON.stringify({
      level: "info",
      message: "social_scheduler_tick",
      request_id: requestId,
      requested_at: requestedAt,
      result
    })
  );

  return {
    status: result.status,
    request_id: requestId,
    requested_at: requestedAt,
    result
  };
};
