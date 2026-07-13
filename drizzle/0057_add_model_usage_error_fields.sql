ALTER TABLE "model_usage_stats"
ADD COLUMN IF NOT EXISTS "error_code" text;

ALTER TABLE "model_usage_stats"
ADD COLUMN IF NOT EXISTS "error_stage" text;

ALTER TABLE "model_usage_stats"
ADD COLUMN IF NOT EXISTS "error_status_code" integer;

ALTER TABLE "model_usage_stats"
ADD COLUMN IF NOT EXISTS "error_message" text;

ALTER TABLE "model_usage_stats"
ADD COLUMN IF NOT EXISTS "error_detail" text;

CREATE INDEX IF NOT EXISTS "idx_model_usage_stats_error_status_code"
ON "model_usage_stats" ("error_status_code");
