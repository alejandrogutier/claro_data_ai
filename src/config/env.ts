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
  ingestionDefaultTerms: process.env.INGESTION_DEFAULT_TERMS
};
