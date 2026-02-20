import AWS from "aws-sdk";
import type { EventBridgeEvent } from "aws-lambda";
import { env } from "../config/env";
import { createReportStore } from "../data/reportStore";

const sqs = new AWS.SQS({ region: env.awsRegion });

const dispatchReportRun = async (reportRunId: string, metadata: Record<string, unknown>) => {
  if (!env.reportQueueUrl) {
    throw new Error("Missing REPORT_QUEUE_URL");
  }

  await sqs
    .sendMessage({
      QueueUrl: env.reportQueueUrl,
      MessageBody: JSON.stringify({
        report_run_id: reportRunId,
        requested_at: new Date().toISOString(),
        ...metadata
      })
    })
    .promise();
};

export const main = async (event: EventBridgeEvent<string, Record<string, unknown>>) => {
  const store = createReportStore();
  if (!store) {
    throw new Error("Database runtime is not configured");
  }

  const now = new Date();
  const dueCandidates = await store.listDueScheduleCandidates(now, 100);

  let enqueued = 0;
  let reused = 0;
  let dispatchFailed = 0;

  for (const candidate of dueCandidates) {
    try {
      const result = await store.enqueueDueScheduleRun(candidate.scheduleId, now);
      if (!result) continue;

      try {
        await dispatchReportRun(result.run.id, {
          trigger_type: "scheduled",
          schedule_id: result.run.scheduleId,
          idempotency_key: result.run.idempotencyKey,
          event_id: event.id
        });
        if (result.created) {
          enqueued += 1;
        } else {
          reused += 1;
        }
      } catch (dispatchError) {
        dispatchFailed += 1;
        await store.failReportRun(result.run.id, `scheduler_dispatch_failed: ${(dispatchError as Error).message}`);
      }
    } catch (error) {
      dispatchFailed += 1;
      console.error("report_schedule_enqueue_failed", {
        schedule_id: candidate.scheduleId,
        message: (error as Error).message
      });
    }
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "report_scheduler_tick",
      event_id: event.id,
      due_candidates: dueCandidates.length,
      enqueued,
      reused,
      dispatch_failed: dispatchFailed
    })
  );
};
