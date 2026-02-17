import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { randomUUID, createHash } from "crypto";
import { Client } from "pg";

type MigrationResult = {
  status: "applied" | "already_applied";
  migration_name: string | null;
  applied_migrations: string[];
  finished_at: string;
};

const MIGRATIONS_DIR = join(__dirname, "../prisma/migrations");

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
};

const listLocalMigrations = (): string[] =>
  readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

const readMigrationSql = (migrationName: string): string => {
  const filePath = join(MIGRATIONS_DIR, migrationName, "migration.sql");
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

const listAppliedMigrationNames = async (client: Client): Promise<Set<string>> => {
  const result = await client.query<{ migration_name: string }>(
    `SELECT migration_name
     FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL
       AND rolled_back_at IS NULL`
  );

  return new Set(result.rows.map((row) => row.migration_name));
};

const recordMigration = async (client: Client, migrationName: string, checksum: string) => {
  await client.query(
    `INSERT INTO "_prisma_migrations"
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, now(), $3, '', NULL, now(), 1)`,
    [randomUUID(), checksum, migrationName]
  );
};

const applyMigration = async (client: Client, migrationName: string, sql: string, checksum: string) => {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await recordMigration(client, migrationName, checksum);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
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

  await client.connect();
  try {
    await ensurePrismaMigrationsTable(client);

    const localMigrations = listLocalMigrations();
    const appliedMigrationNames = await listAppliedMigrationNames(client);
    const pending = localMigrations.filter((name) => !appliedMigrationNames.has(name));

    if (pending.length === 0) {
      return {
        status: "already_applied",
        migration_name: localMigrations[localMigrations.length - 1] ?? null,
        applied_migrations: [],
        finished_at: new Date().toISOString()
      };
    }

    for (const migrationName of pending) {
      const sql = readMigrationSql(migrationName);
      const checksum = createHash("sha256").update(sql).digest("hex");
      await applyMigration(client, migrationName, sql, checksum);
    }

    return {
      status: "applied",
      migration_name: pending[pending.length - 1] ?? null,
      applied_migrations: pending,
      finished_at: new Date().toISOString()
    };
  } finally {
    await client.end();
  }
};
