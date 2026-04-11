CREATE TABLE IF NOT EXISTS "community_tag" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_tag_name_unique"
  ON "community_tag" ("name");

CREATE UNIQUE INDEX IF NOT EXISTS "community_tag_slug_unique"
  ON "community_tag" ("slug");

CREATE TABLE IF NOT EXISTS "community_media_tag" (
  "id" text PRIMARY KEY NOT NULL,
  "media_id" text NOT NULL REFERENCES "user_generated_images"("id") ON DELETE cascade,
  "tag_id" integer NOT NULL REFERENCES "community_tag"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_media_tag_media_tag_unique"
  ON "community_media_tag" ("media_id", "tag_id");
