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
  exportBucketName?: string;
  exportQueueUrl?: string;
  exportSignedUrlSeconds?: number;
  ingestionDefaultTerms?: string;
  incidentQueueUrl?: string;
  reportQueueUrl?: string;
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
  bedrockModelId: process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-haiku-4-5-20251001-v1:0",
  providerKeysSecretName: process.env.PROVIDER_KEYS_SECRET_NAME,
  appConfigSecretName: process.env.APP_CONFIG_SECRET_NAME,
  awsCredentialsSecretName: process.env.AWS_CREDENTIALS_SECRET_NAME,
  dbResourceArn: process.env.DB_RESOURCE_ARN,
  dbSecretArn: process.env.DB_SECRET_ARN,
  dbName: process.env.DB_NAME,
  ingestionStateMachineArn: process.env.INGESTION_STATE_MACHINE_ARN,
  rawBucketName: process.env.RAW_BUCKET_NAME,
  exportBucketName: process.env.EXPORT_BUCKET_NAME,
  exportQueueUrl: process.env.EXPORT_QUEUE_URL,
  exportSignedUrlSeconds: process.env.EXPORT_SIGNED_URL_SECONDS
    ? Number.parseInt(process.env.EXPORT_SIGNED_URL_SECONDS, 10)
    : 900,
  ingestionDefaultTerms: process.env.INGESTION_DEFAULT_TERMS,
  incidentQueueUrl: process.env.INCIDENT_QUEUE_URL,
  reportQueueUrl: process.env.REPORT_QUEUE_URL,
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
