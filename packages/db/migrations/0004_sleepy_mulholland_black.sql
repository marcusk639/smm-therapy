CREATE TABLE IF NOT EXISTS "trend_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"week_of" date NOT NULL,
	"topic" text NOT NULL,
	"summary" text NOT NULL,
	"subreddit_sources" text[] DEFAULT '{}' NOT NULL,
	"rss_sources" text[] DEFAULT '{}' NOT NULL,
	"relevance_score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trend_topics" ADD CONSTRAINT "trend_topics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
