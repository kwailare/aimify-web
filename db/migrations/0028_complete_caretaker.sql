CREATE TABLE "credit_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizationId" uuid NOT NULL,
	"creditEntryId" uuid,
	"debitEntryId" uuid NOT NULL,
	"amount" numeric NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "openAmount" numeric DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "dueDate" timestamp;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "credit_entries" ADD COLUMN "receiptNumber" text;--> statement-breakpoint
ALTER TABLE "customer_types" ADD COLUMN "defaultPaymentTermsDays" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "paymentTermsDays" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "receiptSeq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD COLUMN "creditEntryId" uuid;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD COLUMN "creditEntryId" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "dueDate" timestamp;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "paymentTermsDays" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_creditEntryId_credit_entries_id_fk" FOREIGN KEY ("creditEntryId") REFERENCES "public"."credit_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_debitEntryId_credit_entries_id_fk" FOREIGN KEY ("debitEntryId") REFERENCES "public"."credit_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_allocations_credit_idx" ON "credit_allocations" USING btree ("creditEntryId");--> statement-breakpoint
CREATE INDEX "credit_allocations_debit_idx" ON "credit_allocations" USING btree ("debitEntryId");--> statement-breakpoint
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_creditEntryId_credit_entries_id_fk" FOREIGN KEY ("creditEntryId") REFERENCES "public"."credit_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_creditEntryId_credit_entries_id_fk" FOREIGN KEY ("creditEntryId") REFERENCES "public"."credit_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_entries_open_idx" ON "credit_entries" USING btree ("organizationId","partyType","openAmount");--> statement-breakpoint
ALTER TABLE "credit_entries" ADD CONSTRAINT "credit_entries_organizationId_receiptNumber_unique" UNIQUE("organizationId","receiptNumber");