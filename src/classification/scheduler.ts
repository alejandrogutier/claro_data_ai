import AWS from "aws-sdk";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { createClassificationStore } from "../data/classificationStore";

const sqs = new AWS.SQS({ region: env.awsRegion });

type ClassificationTriggerType = "manual" | "scheduled";

type SchedulerEvent = {
  trigger_type?: ClassificationTriggerType;
  request_id?: string;
  requested_at?: string;
};

type SchedulerResponse = {
  status: "completed" | "failed";
  request_id: string;
  trigger_type: ClassificationTriggerType;
  requested_at: string;
  prompt_version: string;
  model_id: string;
  source_type: "news";
  window_start: string;
  limit: number;
  selected_count: number;
  enqueued_count: number;
  error_message?: string;
};

const parseEvent = (event: unknown): SchedulerEvent => {
  if (!event || typeof event !== "object" || Array.isArray(event)) return {};
  return event as SchedulerEvent;
};

const dispatchClassification = async (queueUrl: string, payload: Record<string, unknown>): Promise<void> => {
  await sqs
    .sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload)
    })
    .promise();
};

export const main = async (event: unknown): Promise<SchedulerResponse> => {
  const store = createClassificationStore();
  if (!store) {
    return {
      status: "failed",
      request_id: "unknown",
      trigger_type: "scheduled",
      requested_at: new Date().toISOString(),
      prompt_version: env.classificationPromptVersion ?? "classification-v1",
      model_id: env.bedrockModelId,
      source_type: "news",
      window_start: new Date(0).toISOString(),
      limit: 0,
      selected_count: 0,
      enqueued_count: 0,
      error_message: "Database runtime is not configured"
    };
  }

  if (!env.classificationQueueUrl) {
    throw new Error("Missing CLASSIFICATION_QUEUE_URL");
  }

  const now = new Date();
  const payload = parseEvent(event);
  const requestId =
    typeof payload.request_id === "string" && payload.request_id.trim()
      ? payload.request_id.trim()
      : `classifier-${randomUUID()}`;
  const requestedAt =
    typeof payload.requested_at === "string" && payload.requested_at.trim() ? payload.requested_at.trim() : now.toISOString();
  const triggerType: ClassificationTriggerType = payload.trigger_type === "manual" ? "manual" : "scheduled";

  const promptVersion = env.classificationPromptVersion ?? "classification-v1";
  const modelId = env.bedrockModelId;
  const rawLimit = env.classificationSchedulerLimit ?? 120;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 120;
  const rawWindowDays = env.classificationWindowDays ?? 7;
  const windowDays = Number.isFinite(rawWindowDays) && rawWindowDays > 0 ? rawWindowDays : 7;
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  try {
    const pendingIds = await store.listPendingContentIds({
      limit,
      windowStart,
      promptVersion,
      modelId,
      sourceType: "news"
    });

    let enqueued = 0;
    for (const contentItemId of pendingIds) {
      await dispatchClassification(env.classificationQueueUrl, {
        content_item_id: contentItemId,
        prompt_version: promptVersion,
        model_id: modelId,
        source_type: "news",
        trigger_type: triggerType,
        request_id: requestId,
        requested_at: requestedAt
      });
      enqueued += 1;
    }

    console.log(
      JSON.stringify({
        level: "info",
        message: "classification_scheduler_tick",
        request_id: requestId,
        trigger_type: triggerType,
        requested_at: requestedAt,
        prompt_version: promptVersion,
        model_id: modelId,
        source_type: "news",
        window_start: windowStart.toISOString(),
        limit,
        selected_count: pendingIds.length,
        enqueued_count: enqueued
      })
    );

    return {
      status: "completed",
      request_id: requestId,
      trigger_type: triggerType,
      requested_at: requestedAt,
      prompt_version: promptVersion,
      model_id: modelId,
      source_type: "news",
      window_start: windowStart.toISOString(),
      limit,
      selected_count: pendingIds.length,
      enqueued_count: enqueued
    };
  } catch (error) {
    console.error("classification_scheduler_failed", { request_id: requestId, message: (error as Error).message });
    return {
      status: "failed",
      request_id: requestId,
      trigger_type: triggerType,
      requested_at: requestedAt,
      prompt_version: promptVersion,
      model_id: modelId,
      source_type: "news",
      window_start: windowStart.toISOString(),
      limit,
      selected_count: 0,
      enqueued_count: 0,
      error_message: (error as Error).message
    };
  }
};
