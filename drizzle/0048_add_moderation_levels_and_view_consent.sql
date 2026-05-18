-- 为用户作品增加多级视觉审核等级
ALTER TABLE "user_generated_images"
ADD COLUMN IF NOT EXISTS "moderation_level" text DEFAULT 'low' NOT NULL;

COMMENT ON COLUMN "user_generated_images"."moderation_level"
IS '视觉审核风险等级：low | medium | high';

-- 为未通过审核留档增加视觉风险等级
ALTER TABLE "rejected_images"
ADD COLUMN IF NOT EXISTS "moderation_level" text;

COMMENT ON COLUMN "rejected_images"."moderation_level"
IS '视觉审核风险等级：medium | high；提示词拦截时可为空';

-- 中风险内容查看确认记录
CREATE TABLE IF NOT EXISTS "media_view_consent" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "image_id" text NOT NULL REFERENCES "user_generated_images"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_view_consent_user_image_unique"
ON "media_view_consent" ("user_id", "image_id");
