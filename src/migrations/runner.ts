import { readFileSync } from "fs";
import { join } from "path";
import { randomUUID, createHash } from "crypto";
import { Client } from "pg";

type MigrationResult = {
  status: "applied" | "already_applied";
  migration_name: string;
  finished_at: string;
};

const MIGRATION_NAME = "20260217022500_init";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
};

const readMigrationSql = (): string => {
  const filePath = join(__dirname, "../prisma/migrations", MIGRATION_NAME, "migration.sql");
  return readFileSync(filePath, "utf8");
};

const ensurePrismaMigrationsTable = async (client: Client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      finished_at TIMESTAMPTZ,
      migration_name VARCHAR(255) NOT NULL,
      logs TEXT,
      rolled_back_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_steps_count INTEGER NOT NULL DEFAULT 0
    );
  `);
};

const hasMigration = async (client: Client, migrationName: string): Promise<boolean> => {
  const result = await client.query(
    `SELECT 1
     FROM "_prisma_migrations"
     WHERE migration_name = $1
       AND finished_at IS NOT NULL
       AND rolled_back_at IS NULL
     LIMIT 1`,
    [migrationName]
  );
  return (result.rowCount ?? 0) > 0;
};

const recordMigration = async (client: Client, migrationName: string, checksum: string) => {
  await client.query(
    `INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, now(), $3, '', NULL, now(), 1)`,
    [randomUUID(), checksum, migrationName]
  );
};

const getClient = (): Client =>
  new Client({
    host: requiredEnv("DB_HOST"),
    port: Number(process.env.DB_PORT ?? "5432"),
    database: requiredEnv("DB_NAME"),
    user: requiredEnv("DB_USER"),
    password: requiredEnv("DB_PASSWORD"),
    ssl: {
      rejectUnauthorized: false
    },
    statement_timeout: 300_000
  });

export const main = async (): Promise<MigrationResult> => {
  const client = getClient();
  const migrationSql = readMigrationSql();
  const checksum = createHash("sha256").update(migrationSql).digest("hex");

  await client.connect();
  try {
    await ensurePrismaMigrationsTable(client);
    const alreadyApplied = await hasMigration(client, MIGRATION_NAME);
    if (alreadyApplied) {
      return {
        status: "already_applied",
        migration_name: MIGRATION_NAME,
        finished_at: new Date().toISOString()
      };
    }

    await client.query("BEGIN");
    await client.query(migrationSql);
    await recordMigration(client, MIGRATION_NAME, checksum);
    await client.query("COMMIT");

    return {
      status: "applied",
      migration_name: MIGRATION_NAME,
      finished_at: new Date().toISOString()
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // noop: original error is more relevant
    }
    throw error;
  } finally {
    await client.end();
  }
};
