import { randomUUID } from "crypto";
import { RdsDataClient, fieldDate, fieldLong, fieldString, sqlLong, sqlString, sqlTimestamp, sqlUuid, type SqlRow } from "./rdsData";

const DIGEST_RUN_STATUSES = ["queued", "running", "completed", "failed"] as const;

export type DigestRunStatus = (typeof DIGEST_RUN_STATUSES)[number];

export type DigestRunRecord = {
  id: string;
  digestDate: Date;
  recipientScope: string;
  status: DigestRunStatus;
  recipientsCount: number;
  s3Key: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

const normalizeRunStatus = (value: string | null): DigestRunStatus => {
  if (value && (DIGEST_RUN_STATUSES as readonly string[]).includes(value)) return value as DigestRunStatus;
  return "queued";
};

const parseDigestRunRow = (row: SqlRow | undefined): DigestRunRecord | null => {
  const id = fieldString(row, 0);
  const digestDate = fieldDate(row, 1);
  const recipientScope = fieldString(row, 2);
  const status = normalizeRunStatus(fieldString(row, 3));
  const recipientsCount = fieldLong(row, 4) ?? 0;
  const s3Key = fieldString(row, 5);
  const createdAt = fieldDate(row, 6);
  const completedAt = fieldDate(row, 7);

  if (!id || !digestDate || !recipientScope || !createdAt) return null;
  return {
    id,
    digestDate,
    recipientScope,
    status,
    recipientsCount,
    s3Key,
    createdAt,
    completedAt
  };
};

const normalizeRecipientScope = (value: string): string => value.trim().toLowerCase().slice(0, 64);

export class DigestStore {
  constructor(private readonly rds: RdsDataClient) {}

  async claimDigestRun(digestDate: Date, recipientScope: string): Promise<DigestRunRecord | null> {
    const tx = await this.rds.beginTransaction();
    const scope = normalizeRecipientScope(recipientScope);

    try {
      const beforeResponse = await this.rds.execute(
        `
          SELECT
            "id"::text,
            "digestDate",
            "recipientScope",
            "status"::text,
            "recipientsCount",
            "s3Key",
            "createdAt",
            "completedAt"
          FROM "public"."DigestRun"
          WHERE "digestDate" = :digest_date
            AND "recipientScope" = :recipient_scope
          LIMIT 1
          FOR UPDATE
        `,
        [sqlTimestamp("digest_date", digestDate), sqlString("recipient_scope", scope)],
        { transactionId: tx }
      );

      const existing = parseDigestRunRow(beforeResponse.records?.[0]);
      if (existing) {
        if (existing.status === "running" || existing.status === "completed") {
          await this.rds.commitTransaction(tx);
          return null;
        }

        const claimResponse = await this.rds.execute(
          `
            UPDATE "public"."DigestRun"
            SET
              "status" = CAST('running' AS "public"."RunStatus"),
              "completedAt" = NULL
            WHERE "id" = CAST(:id AS UUID)
              AND "status" IN (CAST('queued' AS "public"."RunStatus"), CAST('failed' AS "public"."RunStatus"))
            RETURNING
              "id"::text,
              "digestDate",
              "recipientScope",
              "status"::text,
              "recipientsCount",
              "s3Key",
              "createdAt",
              "completedAt"
          `,
          [sqlUuid("id", existing.id)],
          { transactionId: tx }
        );

        const claimed = parseDigestRunRow(claimResponse.records?.[0]);
        await this.rds.commitTransaction(tx);
        return claimed;
      }

      const insertResponse = await this.rds.execute(
        `
          INSERT INTO "public"."DigestRun"
            ("id", "digestDate", "recipientScope", "status", "recipientsCount", "s3Key", "createdAt", "completedAt")
          VALUES
            (CAST(:id AS UUID), :digest_date, :recipient_scope, CAST('running' AS "public"."RunStatus"), 0, NULL, NOW(), NULL)
          RETURNING
            "id"::text,
            "digestDate",
            "recipientScope",
            "status"::text,
            "recipientsCount",
            "s3Key",
            "createdAt",
            "completedAt"
        `,
        [sqlUuid("id", randomUUID()), sqlTimestamp("digest_date", digestDate), sqlString("recipient_scope", scope)],
        { transactionId: tx }
      );

      const inserted = parseDigestRunRow(insertResponse.records?.[0]);
      if (!inserted) {
        throw new Error("Failed to create digest run");
      }

      await this.rds.commitTransaction(tx);
      return inserted;
    } catch (error) {
      await this.rds.rollbackTransaction(tx).catch(() => undefined);
      throw error;
    }
  }

  async completeDigestRun(runId: string, recipientsCount: number, s3Key: string | null): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."DigestRun"
        SET
          "status" = CAST('completed' AS "public"."RunStatus"),
          "recipientsCount" = :recipients_count,
          "s3Key" = :s3_key,
          "completedAt" = NOW()
        WHERE "id" = CAST(:id AS UUID)
      `,
      [sqlLong("recipients_count", recipientsCount), sqlString("s3_key", s3Key), sqlUuid("id", runId)]
    );
  }

  async failDigestRun(runId: string): Promise<void> {
    await this.rds.execute(
      `
        UPDATE "public"."DigestRun"
        SET
          "status" = CAST('failed' AS "public"."RunStatus"),
          "completedAt" = NOW()
        WHERE "id" = CAST(:id AS UUID)
      `,
      [sqlUuid("id", runId)]
    );
  }
}

export const createDigestStore = (): DigestStore | null => {
  const rds = RdsDataClient.fromEnv();
  if (!rds) return null;
  return new DigestStore(rds);
};
