import AWS from "aws-sdk";
import { env } from "./env";

type SecretMap = Record<string, string>;

export type RuntimeSecrets = {
  providerKeys: SecretMap;
  appConfig: SecretMap;
  awsCredentials: SecretMap;
};

const client = new AWS.SecretsManager({ region: env.awsRegion });
let cachedSecretsPromise: Promise<RuntimeSecrets> | null = null;

const parseSecretString = (name: string, payload?: string): SecretMap => {
  if (!payload) {
    throw new Error(`Secret ${name} has empty payload`);
  }

  const parsed = JSON.parse(payload) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Secret ${name} is not a JSON object`);
  }

  return Object.entries(parsed).reduce<SecretMap>((acc, [key, value]) => {
    if (value !== null && value !== undefined) acc[key] = String(value);
    return acc;
  }, {});
};

const readSecret = async (name: string): Promise<SecretMap> => {
  const response = await client.getSecretValue({ SecretId: name }).promise();
  return parseSecretString(name, response.SecretString);
};

const hasSecretsManagerConfig = (): boolean =>
  Boolean(env.providerKeysSecretName && env.appConfigSecretName && env.awsCredentialsSecretName);

const fallbackFromEnv = (): RuntimeSecrets => ({
  providerKeys: {
    NEWS_API_KEY: process.env.NEWS_API_KEY ?? "",
    GNEWS_API_KEY: process.env.GNEWS_API_KEY ?? "",
    NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY ?? "",
    WORLDNEWS_API_KEY: process.env.WORLDNEWS_API_KEY ?? "",
    GUARDIAN_API_KEY: process.env.GUARDIAN_API_KEY ?? "",
    NYT_API_KEY: process.env.NYT_API_KEY ?? "",
    AWARIO_ACCESS_TOKEN: process.env.AWARIO_ACCESS_TOKEN ?? process.env.AWARIO_API_KEY ?? "",
    AWARIO_API_KEY: process.env.AWARIO_API_KEY ?? process.env.AWARIO_ACCESS_TOKEN ?? ""
  },
  appConfig: {
    AWS_REGION: env.awsRegion,
    BEDROCK_MODEL_ID: env.bedrockModelId
  },
  awsCredentials: {
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? ""
  }
});

export const loadRuntimeSecrets = async (): Promise<RuntimeSecrets> => {
  if (!cachedSecretsPromise) {
    cachedSecretsPromise = (async () => {
      if (!hasSecretsManagerConfig()) return fallbackFromEnv();

      const [providerKeys, appConfig, awsCredentials] = await Promise.all([
        readSecret(env.providerKeysSecretName as string),
        readSecret(env.appConfigSecretName as string),
        readSecret(env.awsCredentialsSecretName as string)
      ]);

      return {
        providerKeys,
        appConfig,
        awsCredentials
      };
    })();
  }

  return cachedSecretsPromise;
};

export const getBedrockModelId = async (): Promise<string> => {
  const secrets = await loadRuntimeSecrets();
  return secrets.appConfig.BEDROCK_MODEL_ID || env.bedrockModelId;
};

export const clearRuntimeSecretsCache = (): void => {
  cachedSecretsPromise = null;
};
