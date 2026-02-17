import AWS from "aws-sdk";
import { env } from "../config/env";

export type SqlParameter = AWS.RDSDataService.SqlParameter;
export type SqlField = AWS.RDSDataService.Field;
export type SqlRow = AWS.RDSDataService.FieldList;

const toTimestamp = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "");

export const sqlString = (name: string, value: string | null | undefined): SqlParameter => ({
  name,
  value: value === null || value === undefined ? { isNull: true } : { stringValue: value }
});

export const sqlLong = (name: string, value: number): SqlParameter => ({
  name,
  value: { longValue: Math.floor(value) }
});

export const sqlBoolean = (name: string, value: boolean): SqlParameter => ({
  name,
  value: { booleanValue: value }
});

export const sqlTimestamp = (name: string, value: Date | null | undefined): SqlParameter => ({
  name,
  value: value ? { stringValue: toTimestamp(value) } : { isNull: true },
  typeHint: "TIMESTAMP"
});

export const sqlJson = (name: string, value: unknown): SqlParameter => ({
  name,
  value: { stringValue: JSON.stringify(value) },
  typeHint: "JSON"
});

export const sqlUuid = (name: string, value: string | null | undefined): SqlParameter => ({
  name,
  value: value ? { stringValue: value } : { isNull: true },
  typeHint: "UUID"
});

export const fieldString = (row: SqlRow | undefined, index: number): string | null => {
  const field = row?.[index] as SqlField | undefined;
  if (!field) return null;
  if (field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return String(field.longValue);
  if (field.doubleValue !== undefined) return String(field.doubleValue);
  if (field.booleanValue !== undefined) return field.booleanValue ? "true" : "false";
  return null;
};

export const fieldLong = (row: SqlRow | undefined, index: number): number | null => {
  const field = row?.[index] as SqlField | undefined;
  if (!field || field.isNull) return null;
  if (field.longValue !== undefined) return Number(field.longValue);
  if (field.stringValue !== undefined) {
    const parsed = Number(field.stringValue);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const fieldBoolean = (row: SqlRow | undefined, index: number): boolean | null => {
  const field = row?.[index] as SqlField | undefined;
  if (!field || field.isNull) return null;
  if (field.booleanValue !== undefined) return Boolean(field.booleanValue);
  if (field.stringValue !== undefined) {
    if (field.stringValue === "true") return true;
    if (field.stringValue === "false") return false;
  }
  return null;
};

export const fieldDate = (row: SqlRow | undefined, index: number): Date | null => {
  const raw = fieldString(row, index);
  if (!raw) return null;

  const normalized = raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export class RdsDataClient {
  private readonly client: AWS.RDSDataService;

  constructor(
    private readonly resourceArn: string,
    private readonly secretArn: string,
    private readonly database: string,
    region: string
  ) {
    this.client = new AWS.RDSDataService({ region });
  }

  static fromEnv(): RdsDataClient | null {
    if (!env.dbResourceArn || !env.dbSecretArn || !env.dbName) return null;
    return new RdsDataClient(env.dbResourceArn, env.dbSecretArn, env.dbName, env.awsRegion);
  }

  async execute(sql: string, parameters: SqlParameter[] = []): Promise<AWS.RDSDataService.ExecuteStatementResponse> {
    return this.client
      .executeStatement({
        resourceArn: this.resourceArn,
        secretArn: this.secretArn,
        database: this.database,
        sql,
        parameters,
        continueAfterTimeout: true
      })
      .promise();
  }

  async batchExecute(
    sql: string,
    parameterSets: SqlParameter[][],
    chunkSize = 20
  ): Promise<AWS.RDSDataService.BatchExecuteStatementResponse[]> {
    if (parameterSets.length === 0) return [];

    const results: AWS.RDSDataService.BatchExecuteStatementResponse[] = [];

    for (let i = 0; i < parameterSets.length; i += chunkSize) {
      const chunk = parameterSets.slice(i, i + chunkSize);
      const response = await this.client
        .batchExecuteStatement({
          resourceArn: this.resourceArn,
          secretArn: this.secretArn,
          database: this.database,
          sql,
          parameterSets: chunk
        })
        .promise();

      results.push(response);
    }

    return results;
  }
}
