-- CreateEnum
CREATE TYPE "public"."TermScope" AS ENUM ('claro', 'competencia');

-- AlterTable
ALTER TABLE "public"."TrackedTerm"
ADD COLUMN "scope" "public"."TermScope" NOT NULL DEFAULT 'claro';

-- CreateIndex
CREATE INDEX "TrackedTerm_scope_idx" ON "public"."TrackedTerm"("scope");
