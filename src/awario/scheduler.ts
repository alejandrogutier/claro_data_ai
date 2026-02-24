import AWS from "aws-sdk";
import type { EventBridgeEvent } from "aws-lambda";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { createConfigStore, type AwarioBindingSyncCandidate, type AwarioSyncMode } from "../data/configStore";

const sqs = new AWS.SQS({ region: env.awsRegion });

const selectMode = (candidate: AwarioBindingSyncCandidate): AwarioSyncMode | null => {
  if (candidate.status !== "active") return null;
  if (candidate.syncState === "active") return "incremental";
  if (candidate.syncState === "pending_backfill" || candidate.syncState === "backfilling" || candidate.syncState === "error") {
    return "historical";
  }
  return null;
};

const enqueueAwarioSyncJob = async (payload: {
  run_id: string;
  mode: AwarioSyncMode;
  binding_id: string;
  request_id?: string;
}): Promise<void> => {
  if (!env.awarioSyncQueueUrl) {
    throw new Error("AWARIO_SYNC_QUEUE_URL no configurado");
  }

  await sqs
    .sendMessage({
      QueueUrl: env.awarioSyncQueueUrl,
      MessageBody: JSON.stringify({
        ...payload,
        requested_at: new Date().toISOString()
      })
    })
    .promise();
};

export const main = async (event: EventBridgeEvent<string, Record<string, unknown>>): Promise<void> => {
  if (!env.awarioLinkingV2Enabled) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "awario_scheduler_disabled",
        event_id: event.id
      })
    );
    return;
  }

  const store = createConfigStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  if (!env.awarioSyncQueueUrl) {
    throw new Error("AWARIO_SYNC_QUEUE_URL no configurado");
  }

  const requestId = `awario-scheduler-${event.id}`;
  const candidates = await store.listAwarioBindingSyncCandidates(500);

  let historicalQueued = 0;
  let incrementalQueued = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    const mode = selectMode(candidate);
    if (!mode) {
      skipped += 1;
      continue;
    }

    const runId = randomUUID();

    try {
      if (mode === "historical" && (candidate.syncState === "pending_backfill" || candidate.syncState === "error")) {
        await store.queueAwarioBackfill(candidate.id, null, requestId);
      }

      await enqueueAwarioSyncJob({
        run_id: runId,
        mode,
        binding_id: candidate.id,
        request_id: requestId
      });

      if (mode === "historical") historicalQueued += 1;
      else incrementalQueued += 1;
    } catch (error) {
      failed += 1;
      console.error("awario_scheduler_enqueue_failed", {
        event_id: event.id,
        request_id: requestId,
        binding_id: candidate.id,
        mode,
        error: (error as Error).message
      });
    }
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "awario_scheduler_tick",
      event_id: event.id,
      request_id: requestId,
      candidates: candidates.length,
      historical_queued: historicalQueued,
      incremental_queued: incrementalQueued,
      skipped,
      failed
    })
  );
};
