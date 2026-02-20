ALTER TABLE "public"."SourceWeight"
ADD CONSTRAINT "SourceWeight_weight_check"
CHECK ("weight" >= 0.00 AND "weight" <= 1.00);

CREATE INDEX "SourceWeight_updatedByUserId_idx"
ON "public"."SourceWeight"("updatedByUserId");

ALTER TABLE "public"."SourceWeight"
ADD CONSTRAINT "SourceWeight_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
