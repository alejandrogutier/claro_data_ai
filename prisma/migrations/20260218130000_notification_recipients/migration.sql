-- CreateEnum
CREATE TYPE "public"."NotificationRecipientKind" AS ENUM ('digest', 'incident');

-- CreateTable
CREATE TABLE "public"."NotificationRecipient" (
    "id" UUID NOT NULL,
    "kind" "public"."NotificationRecipientKind" NOT NULL,
    "scope" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationRecipient_kind_scope_email_key" ON "public"."NotificationRecipient"("kind", "scope", "email");

-- CreateIndex
CREATE INDEX "NotificationRecipient_kind_scope_isActive_idx" ON "public"."NotificationRecipient"("kind", "scope", "isActive");

-- CreateIndex
CREATE INDEX "NotificationRecipient_updatedByUserId_idx" ON "public"."NotificationRecipient"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "public"."NotificationRecipient"
ADD CONSTRAINT "NotificationRecipient_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddChecks
ALTER TABLE "public"."NotificationRecipient"
ADD CONSTRAINT "NotificationRecipient_email_lower_check"
CHECK ("email" = LOWER("email"));

ALTER TABLE "public"."NotificationRecipient"
ADD CONSTRAINT "NotificationRecipient_scope_lower_check"
CHECK ("scope" = LOWER("scope"));

