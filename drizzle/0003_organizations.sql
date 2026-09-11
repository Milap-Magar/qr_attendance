CREATE TYPE "public"."organization_type" AS ENUM('school', 'college', 'university', 'other');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "organization_type" DEFAULT 'school' NOT NULL,
	"join_code" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
-- hand-written backfill: data from before multi-tenancy (one school) moves into ONE organization,
-- so existing students, cards and sessions keep working. System users stay school-less (platform operators).
INSERT INTO "organizations" ("name", "type", "join_code")
SELECT 'My School', 'school', (
	SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1), '')
	FROM generate_series(1, 8)
)
WHERE EXISTS (SELECT 1 FROM "users" WHERE "role" <> 'system') OR EXISTS (SELECT 1 FROM "attendance_sessions");--> statement-breakpoint
UPDATE "users" SET "organization_id" = (SELECT "id" FROM "organizations" LIMIT 1) WHERE "role" <> 'system';--> statement-breakpoint
UPDATE "attendance_sessions" SET "organization_id" = (SELECT "id" FROM "organizations" LIMIT 1);--> statement-breakpoint
ALTER TABLE "attendance_sessions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_sessions_organization_id_idx" ON "attendance_sessions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_organization_id_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_matches_role" CHECK (("users"."role" = 'system') = ("users"."organization_id" is null));