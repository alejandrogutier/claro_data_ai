import { env } from "../../config/env";
import { getBedrockModelId, loadRuntimeSecrets } from "../../config/secrets";
import { json } from "../../core/http";

export const handleHealth = async () => {
  try {
    const [secrets, modelId] = await Promise.all([loadRuntimeSecrets(), getBedrockModelId()]);

    return json(200, {
      status: "ok",
      service: "claro-data-api",
      env: env.appEnv,
      model_id: modelId,
      secrets_source: env.appConfigSecretName ? "secrets_manager" : "env_fallback",
      secrets_loaded: Boolean(
        Object.keys(secrets.providerKeys).length && Object.keys(secrets.appConfig).length
      ),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return json(503, {
      status: "degraded",
      service: "claro-data-api",
      env: env.appEnv,
      error: "secrets_unavailable",
      message: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
};
