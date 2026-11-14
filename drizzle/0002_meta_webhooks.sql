CREATE TABLE "store"."meta_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"account_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"outcome" text,
	"event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "meta_webhook_events_status" CHECK ("store"."meta_webhook_events"."status" in ('pending', 'processing', 'done', 'skipped', 'expired', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "store"."meta_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store"."chat_conversations" DROP CONSTRAINT "chat_conversations_channel";--> statement-breakpoint
CREATE INDEX "meta_webhook_events_queue_idx" ON "store"."meta_webhook_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "meta_webhook_events_created_idx" ON "store"."meta_webhook_events" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "store"."chat_conversations" ADD CONSTRAINT "chat_conversations_channel" CHECK ("store"."chat_conversations"."channel" in ('website', 'test', 'sample', 'messenger', 'instagram'));