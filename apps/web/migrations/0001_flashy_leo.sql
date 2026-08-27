CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"rel_path" text NOT NULL,
	"mime" text,
	"size" integer,
	"width" integer,
	"height" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"root_path" text NOT NULL,
	"style_guide_path" text DEFAULT 'style-guide.md' NOT NULL,
	"assets_dir" text DEFAULT 'assets' NOT NULL,
	"tokens" jsonb,
	"owner_id" text,
	"last_scanned_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_docs" (
	"collection" text NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "storage_docs_collection_key_pk" PRIMARY KEY("collection","key")
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_docs" ADD CONSTRAINT "storage_docs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_assets_brand_path_idx" ON "brand_assets" USING btree ("brand_id","rel_path");--> statement-breakpoint
CREATE INDEX "brand_assets_brand_kind_idx" ON "brand_assets" USING btree ("brand_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_idx" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_root_path_idx" ON "brands" USING btree ("root_path");--> statement-breakpoint
CREATE INDEX "storage_docs_collection_updated_idx" ON "storage_docs" USING btree ("collection","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "storage_docs_name_idx" ON "storage_docs" USING btree ((("data" -> 'metadata' ->> 'name')));