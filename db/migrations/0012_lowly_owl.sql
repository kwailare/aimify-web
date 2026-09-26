CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"kind" text NOT NULL,
	"ip" text,
	"userAgent" text,
	"deviceName" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"revokedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "userAgent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sessionsValidAfter" timestamp;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sessions_user_idx" ON "user_sessions" USING btree ("userId","createdAt");