CREATE TABLE "store"."chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text DEFAULT 'website' NOT NULL,
	"visitor_id" text,
	"test_user_id" uuid,
	"paused" boolean DEFAULT false NOT NULL,
	"needs_human" boolean DEFAULT false NOT NULL,
	"handoff_reason" text,
	"handoff_at" timestamp with time zone,
	"taken_over_by" uuid,
	"taken_over_at" timestamp with time zone,
	"last_human_at" timestamp with time zone,
	"bot_released_at" timestamp with time zone,
	"customer_name" text,
	"customer_phone" text,
	"notes" text DEFAULT '' NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"unread_for_staff" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"is_demo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversations_channel" CHECK ("store"."chat_conversations"."channel" in ('website', 'test', 'sample'))
);
--> statement-breakpoint
ALTER TABLE "store"."chat_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."chat_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid,
	"code" text NOT NULL,
	"source" text NOT NULL,
	"level" text DEFAULT 'error' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."chat_errors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."chat_faqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "store"."chat_faqs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."chat_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"question" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"assigned_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_handovers_status" CHECK ("store"."chat_handovers"."status" in ('open', 'taken', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "store"."chat_handovers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "store"."chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"client_message_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"staff_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_role" CHECK ("store"."chat_messages"."role" in ('customer', 'assistant', 'staff'))
);
--> statement-breakpoint
ALTER TABLE "store"."chat_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "store"."ai_usage" ADD COLUMN "source" text DEFAULT 'assistant' NOT NULL;--> statement-breakpoint
ALTER TABLE "store"."ai_usage" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "store"."orders" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "store"."orders" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store"."orders" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "store"."chat_conversations" ADD CONSTRAINT "chat_conversations_test_user_id_users_id_fk" FOREIGN KEY ("test_user_id") REFERENCES "store"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_conversations" ADD CONSTRAINT "chat_conversations_taken_over_by_users_id_fk" FOREIGN KEY ("taken_over_by") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_errors" ADD CONSTRAINT "chat_errors_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "store"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_faqs" ADD CONSTRAINT "chat_faqs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_handovers" ADD CONSTRAINT "chat_handovers_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "store"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_handovers" ADD CONSTRAINT "chat_handovers_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_handovers" ADD CONSTRAINT "chat_handovers_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "store"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store"."chat_messages" ADD CONSTRAINT "chat_messages_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "store"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_visitor_idx" ON "store"."chat_conversations" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_attention_idx" ON "store"."chat_conversations" USING btree ("needs_human","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_conversations_last_idx" ON "store"."chat_conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "chat_errors_created_idx" ON "store"."chat_errors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_faqs_enabled_idx" ON "store"."chat_faqs" USING btree ("enabled","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_handovers_active_uq" ON "store"."chat_handovers" USING btree ("conversation_id") WHERE "store"."chat_handovers"."status" <> 'resolved';--> statement-breakpoint
CREATE INDEX "chat_handovers_status_idx" ON "store"."chat_handovers" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_client_uq" ON "store"."chat_messages" USING btree ("conversation_id","client_message_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_idx" ON "store"."chat_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_created_idx" ON "store"."chat_messages" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "store"."orders" ADD CONSTRAINT "orders_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "store"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_expiry_idx" ON "store"."orders" USING btree ("status","expires_at") WHERE "store"."orders"."expires_at" is not null;--> statement-breakpoint
ALTER TABLE "store"."orders" ADD CONSTRAINT "orders_idempotencyKey_unique" UNIQUE("idempotency_key");