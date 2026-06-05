CREATE TABLE IF NOT EXISTS "community_media_like" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "community_media_id" text NOT NULL REFERENCES "community_media"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_media_like_user_media_unique"
  ON "community_media_like" ("user_id", "community_media_id");

CREATE INDEX IF NOT EXISTS "community_media_like_user_id_idx"
  ON "community_media_like" ("user_id");

CREATE INDEX IF NOT EXISTS "community_media_like_media_id_idx"
  ON "community_media_like" ("community_media_id");

INSERT INTO "community_media_like" (
  "id",
  "user_id",
  "community_media_id",
  "created_at",
  "updated_at"
)
SELECT
  cl."id",
  cl."user_id",
  cm."id",
  cl."created_at",
  cl."updated_at"
FROM "community_like" cl
INNER JOIN "community_media" cm
  ON cm."source_media_id" = cl."image_id"
ON CONFLICT ("user_id", "community_media_id") DO NOTHING;
