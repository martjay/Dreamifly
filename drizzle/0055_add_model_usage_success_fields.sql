ALTER TABLE "model_usage_stats"
ADD COLUMN IF NOT EXISTS "is_success" boolean NOT NULL DEFAULT true;

ALTER TABLE "model_usage_stats"
ADD COLUMN IF NOT EXISTS "model_type" text NOT NULL DEFAULT 'image_generation';

CREATE INDEX IF NOT EXISTS "idx_model_usage_stats_success"
ON "model_usage_stats" ("is_success");

CREATE INDEX IF NOT EXISTS "idx_model_usage_stats_model_type"
ON "model_usage_stats" ("model_type");
