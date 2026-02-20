import { RdsDataClient, fieldString, sqlLong, sqlString } from "./rdsData";

const NOTIFICATION_RECIPIENT_KINDS = ["digest", "incident"] as const;
export type NotificationRecipientKind = (typeof NOTIFICATION_RECIPIENT_KINDS)[number];

const normalizeScope = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  return normalized.slice(0, 64) || "ops";
};

export class NotificationRecipientStore {
  constructor(private readonly rds: RdsDataClient) {}

  async listActiveEmails(kind: NotificationRecipientKind, scope: string, limit = 500): Promise<string[]> {
    const safeLimit = Math.min(500, Math.max(1, limit));
    const normalizedScope = normalizeScope(scope);

    if (!NOTIFICATION_RECIPIENT_KINDS.includes(kind)) {
      return [];
    }

    const response = await this.rds.execute(
      `
        SELECT "email"
        FROM "public"."NotificationRecipient"
        WHERE
          "kind" = CAST(:kind AS "public"."NotificationRecipientKind")
          AND "scope" = :scope
          AND "isActive" = TRUE
        ORDER BY "email" ASC, "id" ASC
        LIMIT :limit
      `,
      [sqlString("kind", kind), sqlString("scope", normalizedScope), sqlLong("limit", safeLimit)]
    );

    const emails = (response.records ?? [])
      .map((row) => fieldString(row, 0))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    return [...new Set(emails)];
  }
}

export const createNotificationRecipientStore = (): NotificationRecipientStore | null => {
  const rds = RdsDataClient.fromEnv();
  if (!rds) return null;
  return new NotificationRecipientStore(rds);
};

