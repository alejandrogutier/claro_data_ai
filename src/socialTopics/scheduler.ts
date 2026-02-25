import AWS from "aws-sdk";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { createSocialTopicStore, type SocialTopicTriggerType } from "../data/socialTopicStore";
import { SOCIAL_TOPIC_TAXONOMY_VERSION } from "./taxonomy";

const sqs = new AWS.SQS({ region: env.awsRegion });

type SchedulerEvent = {
  from?: string;
  to?: string | null;
  limit?: number;
  dry_run?: boolean;
  trigger_type?: SocialTopicTriggerType;
  request_id?: string;
  run_id?: string;
  requested_at?: string;
  taxonomy_version?: string;
  prompt_version?: string;
  model_id?: string;
};

export type SocialTopicSchedulerResponse = {
  status: "completed" | "failed";
  run_id: string;
  trigger_type: SocialTopicTriggerType;
  request_id: string;
  requested_at: string;
  from: string;
  to: string | null;
  limit: number;
  dry_run: boolean;
  taxonomy_version: string;
  prompt_version: string;
  model_id: string;
  selected_count: number;
  enqueued_count: number;
  error_message?: string;
};

const parseEvent = (event: unknown): SchedulerEvent => {
  if (!event || typeof event !== "object" || Array.isArray(event)) return {};
  return event as SchedulerEvent;
};

const parseDate = (value: string | undefined | null): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const sendQueueMessage = async (queueUrl: string, payload: Record<string, unknown>): Promise<void> => {
  await sqs
    .sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(payload)
    })
    .promise();
};

export const main = async (event: unknown): Promise<SocialTopicSchedulerResponse> => {
  const store = createSocialTopicStore();
  if (!store) {
    return {
      status: "failed",
      run_id: `social-topics-${randomUUID()}`,
      trigger_type: "scheduled",
      request_id: "unknown",
      requested_at: new Date().toISOString(),
      from: "2024-01-01T00:00:00.000Z",
      to: null,
      limit: 0,
      dry_run: false,
      taxonomy_version: env.socialTopicTaxonomyVersion ?? SOCIAL_TOPIC_TAXONOMY_VERSION,
      prompt_version: env.socialTopicPromptVersion ?? "social-topics-v1",
      model_id: env.bedrockModelId,
      selected_count: 0,
      enqueued_count: 0,
      error_message: "Database runtime is not configured"
    };
  }

  if (!env.socialTopicQueueUrl) {
    throw new Error("Missing SOCIAL_TOPIC_QUEUE_URL");
  }

  const now = new Date();
  const payload = parseEvent(event);

  const from = parseDate(payload.from) ?? new Date("2024-01-01T00:00:00.000Z");
  const parsedTo = parseDate(payload.to ?? undefined);
  const to = parsedTo && parsedTo.getTime() > from.getTime() ? parsedTo : null;

  const defaultLimit = env.socialTopicBackfillBatchSize;
  const rawLimit = typeof payload.limit === "number" && Number.isFinite(payload.limit) ? payload.limit : defaultLimit;
  const limit = Math.min(5000, Math.max(1, Math.floor(rawLimit)));

  const dryRun = payload.dry_run === true;
  const runId = typeof payload.run_id === "string" && payload.run_id.trim() ? payload.run_id.trim() : `social-topics-${randomUUID()}`;
  const requestId =
    typeof payload.request_id === "string" && payload.request_id.trim() ? payload.request_id.trim() : runId;
  const requestedAt =
    typeof payload.requested_at === "string" && payload.requested_at.trim() ? payload.requested_at.trim() : now.toISOString();
  const triggerType: SocialTopicTriggerType = payload.trigger_type === "manual" ? "manual" : "scheduled";

  const taxonomyVersion = (payload.taxonomy_version ?? env.socialTopicTaxonomyVersion ?? SOCIAL_TOPIC_TAXONOMY_VERSION).trim();
  const promptVersion = (payload.prompt_version ?? env.socialTopicPromptVersion ?? "social-topics-v1").trim();
  const modelId = (payload.model_id ?? env.bedrockModelId).trim();

  try {
    await store.ensureTaxonomySeed();

    const pendingItems = await store.listPendingItems({
      from,
      to,
      limit,
      taxonomyVersion,
      promptVersion,
      modelId
    });

    let enqueuedCount = 0;
    if (!dryRun) {
      for (const item of pendingItems) {
        await sendQueueMessage(env.socialTopicQueueUrl, {
          content_item_id: item.contentItemId,
          social_post_metric_id: item.socialPostMetricId,
          taxonomy_version: taxonomyVersion,
          prompt_version: promptVersion,
          model_id: modelId,
          trigger_type: triggerType,
          request_id: requestId,
          run_id: runId,
          requested_at: requestedAt
        });
        enqueuedCount += 1;
      }
    }

    const result: SocialTopicSchedulerResponse = {
      status: "completed",
      run_id: runId,
      trigger_type: triggerType,
      request_id: requestId,
      requested_at: requestedAt,
      from: from.toISOString(),
      to: to ? to.toISOString() : null,
      limit,
      dry_run: dryRun,
      taxonomy_version: taxonomyVersion,
      prompt_version: promptVersion,
      model_id: modelId,
      selected_count: pendingItems.length,
      enqueued_count: dryRun ? pendingItems.length : enqueuedCount
    };

    await store.logBackfillRun({
      runId,
      requestId,
      triggerType,
      requestedAt,
      from,
      to,
      limit,
      dryRun,
      selectedCount: pendingItems.length,
      enqueuedCount: result.enqueued_count,
      status: "completed"
    });

    console.log(
      JSON.stringify({
        level: "info",
        message: "social_topics_scheduler_completed",
        ...result
      })
    );

    return result;
  } catch (error) {
    const errorMessage = (error as Error).message;

    await store.logBackfillRun({
      runId,
      requestId,
      triggerType,
      requestedAt,
      from,
      to,
      limit,
      dryRun,
      selectedCount: 0,
      enqueuedCount: 0,
      status: "failed",
      errorMessage
    });

    console.error(
      JSON.stringify({
        level: "error",
        message: "social_topics_scheduler_failed",
        run_id: runId,
        request_id: requestId,
        error_message: errorMessage
      })
    );

    return {
      status: "failed",
      run_id: runId,
      trigger_type: triggerType,
      request_id: requestId,
      requested_at: requestedAt,
      from: from.toISOString(),
      to: to ? to.toISOString() : null,
      limit,
      dry_run: dryRun,
      taxonomy_version: taxonomyVersion,
      prompt_version: promptVersion,
      model_id: modelId,
      selected_count: 0,
      enqueued_count: 0,
      error_message: errorMessage
    };
  }
};
