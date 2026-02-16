import { env } from "../../config/env";
import { json } from "../../core/http";

export const handleHealth = () =>
  json(200, {
    status: "ok",
    service: "claro-data-api",
    env: env.appEnv,
    model_id: env.bedrockModelId,
    timestamp: new Date().toISOString()
  });
