-- QR cards and attendance used to hang off `users`. Students are their own table now, and a
-- credential's old user_id has no student row to map onto, so these rows cannot be carried over.
-- Both tables are emptied here; re-issue cards from the class roster afterwards.
TRUNCATE "attendance_records", "credentials";--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"grade" varchar(32) NOT NULL,
	"section" varchar(32) DEFAULT '' NOT NULL,
	"academic_year" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_org_grade_section_year_unique" UNIQUE("organization_id","grade","section","academic_year")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"roll_no" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"gender" "gender" DEFAULT 'other' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_class_roll_no_unique" UNIQUE("class_id","roll_no")
);
--> statement-breakpoint
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_session_user_unique";--> statement-breakpoint
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_credential_id_credentials_id_fk";
--> statement-breakpoint
ALTER TABLE "credentials" DROP CONSTRAINT "credentials_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "timezone" varchar(64) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classes_organization_id_idx" ON "classes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "students_organization_id_idx" ON "students" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "students_class_id_idx" ON "students" USING btree ("class_id");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_records_session_id_idx" ON "attendance_records" USING btree ("session_id");--> statement-breakpoint
ALTER TABLE "attendance_records" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "credentials" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "credentials" DROP COLUMN "method";--> statement-breakpoint
DROP TYPE "public"."method";