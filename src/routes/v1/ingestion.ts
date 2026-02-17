import AWS from "aws-sdk";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { env } from "../../config/env";
import { json, parseBody } from "../../core/http";

type IngestionRunBody = {
  terms?: string[];
  language?: string;
  max_articles_per_term?: number;
};

const stepFunctions = new AWS.StepFunctions({ region: env.awsRegion });

const sanitizeTerms = (terms: unknown): string[] => {
  if (!Array.isArray(terms)) return [];
  return terms
    .map((term) => (typeof term === "string" ? term.trim() : ""))
    .filter((term) => term.length > 0)
    .slice(0, 50);
};

const coerceLanguage = (language: unknown): string => {
  if (typeof language !== "string") return "es";
  const normalized = language.trim().toLowerCase();
  if (!normalized) return "es";
  return normalized.slice(0, 8);
};

const coerceLimit = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value)) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
};

export const createIngestionRun = async (event: APIGatewayProxyEventV2) => {
  if (!env.ingestionStateMachineArn) {
    return json(500, {
      error: "misconfigured",
      message: "Missing INGESTION_STATE_MACHINE_ARN"
    });
  }

  const body = parseBody<IngestionRunBody>(event) ?? {};
  const terms = sanitizeTerms(body.terms);
  const runId = randomUUID();
  const requestId = event.requestContext.requestId;
  const input = {
    triggerType: "manual",
    runId,
    requestId,
    requestedAt: new Date().toISOString(),
    terms,
    language: coerceLanguage(body.language),
    maxArticlesPerTerm: coerceLimit(body.max_articles_per_term)
  };

  try {
    const execution = await stepFunctions
      .startExecution({
        stateMachineArn: env.ingestionStateMachineArn,
        input: JSON.stringify(input)
      })
      .promise();

    return json(202, {
      status: "accepted",
      run_id: runId,
      execution_arn: execution.executionArn,
      start_date: execution.startDate?.toISOString() ?? null,
      input
    });
  } catch (error) {
    return json(502, {
      error: "ingestion_start_failed",
      message: (error as Error).message
    });
  }
};
