export type AppEnv = {
  appEnv: string;
  awsRegion: string;
  bedrockModelId: string;
  providerKeysSecretName?: string;
  appConfigSecretName?: string;
  awsCredentialsSecretName?: string;
  ingestionStateMachineArn?: string;
  rawBucketName?: string;
  ingestionDefaultTerms?: string;
};

export const env: AppEnv = {
  appEnv: process.env.APP_ENV ?? "prod",
  awsRegion: process.env.AWS_REGION ?? "us-west-2",
  bedrockModelId: process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-haiku-4-5-20251001-v1:0",
  providerKeysSecretName: process.env.PROVIDER_KEYS_SECRET_NAME,
  appConfigSecretName: process.env.APP_CONFIG_SECRET_NAME,
  awsCredentialsSecretName: process.env.AWS_CREDENTIALS_SECRET_NAME,
  ingestionStateMachineArn: process.env.INGESTION_STATE_MACHINE_ARN,
  rawBucketName: process.env.RAW_BUCKET_NAME,
  ingestionDefaultTerms: process.env.INGESTION_DEFAULT_TERMS
};
