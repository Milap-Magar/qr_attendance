ALTER TABLE "attendance_records" ADD COLUMN "student_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD COLUMN "attendance_date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "credentials" ADD COLUMN "student_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_records_date_idx" ON "attendance_records" USING btree ("attendance_date");--> statement-breakpoint
CREATE INDEX "credentials_student_id_idx" ON "credentials" USING btree ("student_id");--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_date_unique" UNIQUE("student_id","attendance_date");