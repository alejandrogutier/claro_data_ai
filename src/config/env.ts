export type AppEnv = {
  appEnv: string;
  awsRegion: string;
  bedrockModelId: string;
  providerKeysSecretName?: string;
  appConfigSecretName?: string;
  awsCredentialsSecretName?: string;
  dbResourceArn?: string;
  dbSecretArn?: string;
  dbName?: string;
  ingestionStateMachineArn?: string;
  rawBucketName?: string;
  socialRawBucketName?: string;
  socialRawPrefix?: string;
  socialSchedulerLambdaName?: string;
  socialAnalyticsV2Enabled: boolean;
  awarioAccessToken?: string;
  awarioCommentsEnabled: boolean;
  awarioLinkingV2Enabled: boolean;
  unifiedQueryAwarioFeedV1Enabled: boolean;
  awarioSyncWindowDays: number;
  awarioSyncPageLimit: number;
  awarioSyncMaxPagesPerAlert: number;
  awarioSyncThrottleMs: number;
  awarioCommentsReviewThreshold: number;
  awarioSyncQueueUrl?: string;
  awarioBackfillPagesPerInvocation: number;
  awarioBackfillMaxPagesTotal: number;
  awarioIncrementalPagesPerInvocation: number;
  awarioIncrementalOverlapMinutes: number;
  exportBucketName?: string;
  exportQueueUrl?: string;
  exportSignedUrlSeconds?: number;
  ingestionDefaultTerms?: string;
  incidentQueueUrl?: string;
  reportQueueUrl?: string;
  analysisQueueUrl?: string;
  classificationQueueUrl?: string;
  classificationPromptVersion?: string;
  classificationWindowDays?: number;
  classificationSchedulerLimit?: number;
  reportConfidenceThreshold?: number;
  reportDefaultTimezone?: string;
  reportEmailSender?: string;
  alertEmailRecipients?: string;
  alertCooldownMinutes?: number;
  alertSignalVersion?: string;
  alertEmailSender?: string;
};

export const env: AppEnv = {
  appEnv: process.env.APP_ENV ?? "prod",
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  bedrockModelId: process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  providerKeysSecretName: process.env.PROVIDER_KEYS_SECRET_NAME,
  appConfigSecretName: process.env.APP_CONFIG_SECRET_NAME,
  awsCredentialsSecretName: process.env.AWS_CREDENTIALS_SECRET_NAME,
  dbResourceArn: process.env.DB_RESOURCE_ARN,
  dbSecretArn: process.env.DB_SECRET_ARN,
  dbName: process.env.DB_NAME,
  ingestionStateMachineArn: process.env.INGESTION_STATE_MACHINE_ARN,
  rawBucketName: process.env.RAW_BUCKET_NAME,
  socialRawBucketName: process.env.SOCIAL_RAW_BUCKET_NAME,
  socialRawPrefix: process.env.SOCIAL_RAW_PREFIX,
  socialSchedulerLambdaName: process.env.SOCIAL_SCHEDULER_LAMBDA_NAME,
  socialAnalyticsV2Enabled: ["1", "true", "yes", "on"].includes((process.env.SOCIAL_ANALYTICS_V2_ENABLED ?? "true").toLowerCase()),
  awarioAccessToken: process.env.AWARIO_ACCESS_TOKEN ?? process.env.AWARIO_API_KEY,
  awarioCommentsEnabled: ["1", "true", "yes", "on"].includes((process.env.AWARIO_COMMENTS_ENABLED ?? "false").toLowerCase()),
  awarioLinkingV2Enabled: !["0", "false", "no", "off"].includes((process.env.AWARIO_LINKING_V2 ?? "true").toLowerCase()),
  unifiedQueryAwarioFeedV1Enabled: !["0", "false", "no", "off"].includes(
    (process.env.UNIFIED_QUERY_AWARIO_FEED_V1 ?? "true").toLowerCase()
  ),
  awarioSyncWindowDays: process.env.AWARIO_SYNC_WINDOW_DAYS
    ? Number.parseInt(process.env.AWARIO_SYNC_WINDOW_DAYS, 10)
    : 30,
  awarioSyncPageLimit: process.env.AWARIO_SYNC_PAGE_LIMIT
    ? Number.parseInt(process.env.AWARIO_SYNC_PAGE_LIMIT, 10)
    : 100,
  awarioSyncMaxPagesPerAlert: process.env.AWARIO_SYNC_MAX_PAGES_PER_ALERT
    ? Number.parseInt(process.env.AWARIO_SYNC_MAX_PAGES_PER_ALERT, 10)
    : 50,
  awarioSyncThrottleMs: process.env.AWARIO_SYNC_THROTTLE_MS
    ? Number.parseInt(process.env.AWARIO_SYNC_THROTTLE_MS, 10)
    : 250,
  awarioCommentsReviewThreshold: process.env.AWARIO_COMMENTS_REVIEW_THRESHOLD
    ? Number.parseFloat(process.env.AWARIO_COMMENTS_REVIEW_THRESHOLD)
    : 0.6,
  awarioSyncQueueUrl: process.env.AWARIO_SYNC_QUEUE_URL,
  awarioBackfillPagesPerInvocation: process.env.AWARIO_BACKFILL_PAGES_PER_INVOCATION
    ? Number.parseInt(process.env.AWARIO_BACKFILL_PAGES_PER_INVOCATION, 10)
    : 20,
  awarioBackfillMaxPagesTotal: process.env.AWARIO_BACKFILL_MAX_PAGES_TOTAL
    ? Number.parseInt(process.env.AWARIO_BACKFILL_MAX_PAGES_TOTAL, 10)
    : 5000,
  awarioIncrementalPagesPerInvocation: process.env.AWARIO_INCREMENTAL_PAGES_PER_INVOCATION
    ? Number.parseInt(process.env.AWARIO_INCREMENTAL_PAGES_PER_INVOCATION, 10)
    : 10,
  awarioIncrementalOverlapMinutes: process.env.AWARIO_INCREMENTAL_OVERLAP_MINUTES
    ? Number.parseInt(process.env.AWARIO_INCREMENTAL_OVERLAP_MINUTES, 10)
    : 30,
  exportBucketName: process.env.EXPORT_BUCKET_NAME,
  exportQueueUrl: process.env.EXPORT_QUEUE_URL,
  exportSignedUrlSeconds: process.env.EXPORT_SIGNED_URL_SECONDS
    ? Number.parseInt(process.env.EXPORT_SIGNED_URL_SECONDS, 10)
    : 900,
  ingestionDefaultTerms: process.env.INGESTION_DEFAULT_TERMS,
  incidentQueueUrl: process.env.INCIDENT_QUEUE_URL,
  reportQueueUrl: process.env.REPORT_QUEUE_URL,
  analysisQueueUrl: process.env.ANALYSIS_QUEUE_URL,
  classificationQueueUrl: process.env.CLASSIFICATION_QUEUE_URL,
  classificationPromptVersion: process.env.CLASSIFICATION_PROMPT_VERSION ?? "classification-v1",
  classificationWindowDays: process.env.CLASSIFICATION_WINDOW_DAYS
    ? Number.parseInt(process.env.CLASSIFICATION_WINDOW_DAYS, 10)
    : 7,
  classificationSchedulerLimit: process.env.CLASSIFICATION_SCHEDULER_LIMIT
    ? Number.parseInt(process.env.CLASSIFICATION_SCHEDULER_LIMIT, 10)
    : 120,
  reportConfidenceThreshold: process.env.REPORT_CONFIDENCE_THRESHOLD
    ? Number.parseFloat(process.env.REPORT_CONFIDENCE_THRESHOLD)
    : 0.65,
  reportDefaultTimezone: process.env.REPORT_DEFAULT_TIMEZONE ?? "America/Bogota",
  reportEmailSender: process.env.REPORT_EMAIL_SENDER ?? process.env.ALERT_EMAIL_SENDER ?? process.env.SES_SENDER_EMAIL,
  alertEmailRecipients: process.env.ALERT_EMAIL_RECIPIENTS,
  alertCooldownMinutes: process.env.ALERT_COOLDOWN_MINUTES
    ? Number.parseInt(process.env.ALERT_COOLDOWN_MINUTES, 10)
    : 60,
  alertSignalVersion: process.env.ALERT_SIGNAL_VERSION ?? "alert-v1-weighted",
  alertEmailSender: process.env.ALERT_EMAIL_SENDER ?? process.env.SES_SENDER_EMAIL
};
