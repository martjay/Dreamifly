CREATE TABLE IF NOT EXISTS "community_like" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "image_id" text NOT NULL REFERENCES "user_generated_images"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "community_like_user_image_unique"
  ON "community_like" ("user_id", "image_id");
