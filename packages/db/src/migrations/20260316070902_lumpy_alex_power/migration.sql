ALTER TABLE `bookmarks` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `summary_status` text DEFAULT 'skipped' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `summary_retries` integer DEFAULT 0 NOT NULL;