-- Add points cost config for Wai-SDXL-V170.
ALTER TABLE "points_config" ADD COLUMN IF NOT EXISTS "wai_sdxl_v170_cost" integer;

UPDATE "points_config"
SET "wai_sdxl_v170_cost" = "wai_sdxl_v150_cost"
WHERE "wai_sdxl_v170_cost" IS NULL
  AND "wai_sdxl_v150_cost" IS NOT NULL;
