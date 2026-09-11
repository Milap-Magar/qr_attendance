ALTER TABLE "attendace_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "attendace_sessions" CASCADE;--> statement-breakpoint
DROP TABLE "credentials" CASCADE;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT now();