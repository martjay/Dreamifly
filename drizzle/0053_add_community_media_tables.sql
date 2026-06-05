CREATE TABLE IF NOT EXISTS "community_media" (
  "id" text PRIMARY KEY NOT NULL,
  "source_media_id" text NOT NULL,
  "source_user_id" text,
  "source_media_url" text,
  "media_url" text NOT NULL,
  "media_type" text DEFAULT 'image' NOT NULL,
  "prompt" text,
  "model" text,
  "width" integer,
  "height" integer,
  "duration" integer,
  "fps" integer,
  "frame_count" integer,
  "user_role" text,
  "user_avatar" text,
  "user_nickname" text,
  "avatar_frame_id" integer,
  "moderation_level" text DEFAULT 'low' NOT NULL,
  "nsfw" boolean DEFAULT false NOT NULL,
  "approved_at" timestamp NOT NULL,
  "approved_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_media_source_media_id_unique"
  ON "community_media" ("source_media_id");

CREATE INDEX IF NOT EXISTS "community_media_media_type_idx"
  ON "community_media" ("media_type");

CREATE INDEX IF NOT EXISTS "community_media_nsfw_idx"
  ON "community_media" ("nsfw");

CREATE INDEX IF NOT EXISTS "community_media_created_at_idx"
  ON "community_media" ("created_at");

CREATE TABLE IF NOT EXISTS "community_published_media_tag" (
  "id" text PRIMARY KEY NOT NULL,
  "community_media_id" text NOT NULL REFERENCES "community_media"("id") ON DELETE cascade,
  "tag_id" integer NOT NULL REFERENCES "community_tag"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_published_media_tag_media_tag_unique"
  ON "community_published_media_tag" ("community_media_id", "tag_id");

CREATE INDEX IF NOT EXISTS "community_published_media_tag_media_id_idx"
  ON "community_published_media_tag" ("community_media_id");

CREATE INDEX IF NOT EXISTS "community_published_media_tag_tag_id_idx"
  ON "community_published_media_tag" ("tag_id");
