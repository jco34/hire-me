CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"raw_text" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "listing_text" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "match_score" integer;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "match_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "match_resume_id" uuid;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "match_scored_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resumes_user_idx" ON "resumes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_active_key" ON "resumes" USING btree ("user_id") WHERE "resumes"."is_active";--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_match_resume_id_resumes_id_fk" FOREIGN KEY ("match_resume_id") REFERENCES "public"."resumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "applications_match_idx" ON "applications" USING btree ("user_id","match_score");