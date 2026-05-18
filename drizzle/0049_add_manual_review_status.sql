ALTER TABLE "user_generated_images"
ADD COLUMN IF NOT EXISTS "manual_review_status" text DEFAULT 'pending' NOT NULL;

COMMENT ON COLUMN "user_generated_images"."manual_review_status"
IS '人工审核状态：pending | approved | rejected';

ALTER TABLE "user_generated_images"
ADD COLUMN IF NOT EXISTS "manual_reviewed_at" timestamp;

COMMENT ON COLUMN "user_generated_images"."manual_reviewed_at"
IS '人工审核时间';

ALTER TABLE "user_generated_images"
ADD COLUMN IF NOT EXISTS "manual_reviewed_by" text;

COMMENT ON COLUMN "user_generated_images"."manual_reviewed_by"
IS '人工审核人ID';
