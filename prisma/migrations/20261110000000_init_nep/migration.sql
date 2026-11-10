BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "nep";

-- Business data is accessible through the backend, not the Supabase Data API.
REVOKE ALL ON SCHEMA "nep" FROM PUBLIC, anon, authenticated;

-- CreateEnum
CREATE TYPE "nep"."publication" AS ENUM ('draft', 'published', 'archived');

-- CreateTable
CREATE TABLE "nep"."images" (
    "id" BIGSERIAL NOT NULL,
    "bucket" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "credit" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nep"."profiles" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(60) NOT NULL,
    "bio" VARCHAR(300) NOT NULL DEFAULT '',
    "avatar_id" BIGINT,
    "terms_version" TEXT NOT NULL,
    "terms_accepted_at" TIMESTAMPTZ(6) NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nep"."creators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mark" TEXT,
    "city" TEXT,
    "kind" TEXT,
    "description" TEXT,
    "philosophy" TEXT,
    "tags" TEXT[],
    "cover_id" BIGINT,

    CONSTRAINT "creators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nep"."projects" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" DECIMAL,
    "floors" INTEGER,
    "beds" INTEGER,
    "year" INTEGER,
    "story" TEXT,
    "status" "nep"."publication" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "nep"."project_images" (
    "project_slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "image_id" BIGINT NOT NULL,

    CONSTRAINT "project_images_pkey" PRIMARY KEY ("project_slug","position")
);

-- CreateTable
CREATE TABLE "nep"."articles" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reading_time" TEXT,
    "cover_id" BIGINT,
    "excerpt" TEXT,
    "intro" TEXT,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "status" "nep"."publication" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "nep"."bookmarks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "project_slug" TEXT,
    "article_slug" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nep"."collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(70) NOT NULL,
    "description" VARCHAR(400) NOT NULL DEFAULT '',

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nep"."collection_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_id" UUID NOT NULL,
    "project_slug" TEXT,
    "article_slug" TEXT,
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nep"."views" (
    "user_id" UUID NOT NULL,
    "project_slug" TEXT NOT NULL,
    "last_viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "views_pkey" PRIMARY KEY ("user_id","project_slug")
);

-- CreateTable
CREATE TABLE "nep"."submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" TEXT NOT NULL,
    "city" VARCHAR(80) NOT NULL,
    "creator" VARCHAR(100),
    "area" TEXT,
    "story" TEXT NOT NULL,
    "credit" VARCHAR(1500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewer_id" UUID,
    "review_note" TEXT,
    "project_slug" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nep"."submission_images" (
    "submission_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "image_id" BIGINT NOT NULL,

    CONSTRAINT "submission_images_pkey" PRIMARY KEY ("submission_id","position")
);

-- CreateTable
CREATE TABLE "nep"."contact_messages" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "images_bucket_object_key_key" ON "nep"."images"("bucket", "object_key");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_project_slug_key" ON "nep"."bookmarks"("user_id", "project_slug");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_id_article_slug_key" ON "nep"."bookmarks"("user_id", "article_slug");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_project_slug_key" ON "nep"."collection_items"("collection_id", "project_slug");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_article_slug_key" ON "nep"."collection_items"("collection_id", "article_slug");

-- CreateIndex
CREATE INDEX "views_recent" ON "nep"."views"("user_id", "last_viewed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "submissions_project_slug_key" ON "nep"."submissions"("project_slug");

-- AddForeignKey
ALTER TABLE "nep"."profiles" ADD CONSTRAINT "profiles_avatar_id_fkey" FOREIGN KEY ("avatar_id") REFERENCES "nep"."images"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."creators" ADD CONSTRAINT "creators_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "nep"."images"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."projects" ADD CONSTRAINT "projects_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "nep"."creators"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."project_images" ADD CONSTRAINT "project_images_project_slug_fkey" FOREIGN KEY ("project_slug") REFERENCES "nep"."projects"("slug") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."project_images" ADD CONSTRAINT "project_images_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "nep"."images"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."articles" ADD CONSTRAINT "articles_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "nep"."images"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nep"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."bookmarks" ADD CONSTRAINT "bookmarks_project_slug_fkey" FOREIGN KEY ("project_slug") REFERENCES "nep"."projects"("slug") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."bookmarks" ADD CONSTRAINT "bookmarks_article_slug_fkey" FOREIGN KEY ("article_slug") REFERENCES "nep"."articles"("slug") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."collections" ADD CONSTRAINT "collections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nep"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "nep"."collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."collection_items" ADD CONSTRAINT "collection_items_project_slug_fkey" FOREIGN KEY ("project_slug") REFERENCES "nep"."projects"("slug") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."collection_items" ADD CONSTRAINT "collection_items_article_slug_fkey" FOREIGN KEY ("article_slug") REFERENCES "nep"."articles"("slug") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."views" ADD CONSTRAINT "views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nep"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."views" ADD CONSTRAINT "views_project_slug_fkey" FOREIGN KEY ("project_slug") REFERENCES "nep"."projects"("slug") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "nep"."profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."submissions" ADD CONSTRAINT "submissions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "nep"."profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."submissions" ADD CONSTRAINT "submissions_project_slug_fkey" FOREIGN KEY ("project_slug") REFERENCES "nep"."projects"("slug") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."submission_images" ADD CONSTRAINT "submission_images_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "nep"."submissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "nep"."submission_images" ADD CONSTRAINT "submission_images_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "nep"."images"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Supabase owns auth.users; keep it outside Prisma's managed schemas.
ALTER TABLE "nep"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id")
    REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Domain constraints from docs/HUONG-DAN-BACKEND.md.
ALTER TABLE "nep"."images"
    ADD CONSTRAINT "images_bytes_check" CHECK ("bytes" > 0);

ALTER TABLE "nep"."profiles"
    ADD CONSTRAINT "profiles_role_check" CHECK ("role" IN ('member', 'editor', 'admin'));

ALTER TABLE "nep"."projects"
    ADD CONSTRAINT "projects_area_check" CHECK ("area" > 0),
    ADD CONSTRAINT "projects_floors_check" CHECK ("floors" > 0),
    ADD CONSTRAINT "projects_beds_check" CHECK ("beds" >= 0),
    ADD CONSTRAINT "projects_publication_check" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);

ALTER TABLE "nep"."project_images"
    ADD CONSTRAINT "project_images_position_check" CHECK ("position" >= 0);

ALTER TABLE "nep"."articles"
    ADD CONSTRAINT "articles_sections_check" CHECK (jsonb_typeof("sections") = 'array'),
    ADD CONSTRAINT "articles_publication_check" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);

ALTER TABLE "nep"."bookmarks"
    ADD CONSTRAINT "bookmarks_target_check" CHECK (num_nonnulls("project_slug", "article_slug") = 1);

ALTER TABLE "nep"."collection_items"
    ADD CONSTRAINT "collection_items_target_check" CHECK (num_nonnulls("project_slug", "article_slug") = 1);

ALTER TABLE "nep"."submissions"
    ADD CONSTRAINT "submissions_story_check" CHECK (length(trim("story")) BETWEEN 30 AND 5000),
    ADD CONSTRAINT "submissions_status_check" CHECK ("status" IN ('draft', 'pending', 'reviewing', 'approved', 'rejected')),
    ADD CONSTRAINT "submissions_approval_check" CHECK (("status" = 'approved') = ("project_slug" IS NOT NULL));

CREATE INDEX "projects_latest" ON "nep"."projects" ("published_at" DESC, "slug")
    WHERE "status" = 'published';

COMMIT;
