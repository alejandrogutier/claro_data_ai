import type { APIGatewayProxyEventV2 } from "aws-lambda";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type JsonResponse = {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
};

export const json = (statusCode: number, payload: JsonValue | Record<string, unknown>): JsonResponse => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8"
  },
  body: JSON.stringify(payload)
});

export const getPathWithoutStage = (event: APIGatewayProxyEventV2): string => {
  const path = event.requestContext.http.path || "/";
  const stage = event.requestContext.stage;
  if (!stage || stage === "$default") return path;
  const stagePrefix = `/${stage}`;
  return path.startsWith(stagePrefix) ? path.slice(stagePrefix.length) || "/" : path;
};

export const parseBody = <T>(event: APIGatewayProxyEventV2): T | null => {
  if (!event.body) return null;
  try {
    return JSON.parse(event.body) as T;
  } catch {
    return null;
  }
};

export const getRequestId = (event: APIGatewayProxyEventV2): string => event.requestContext.requestId;
