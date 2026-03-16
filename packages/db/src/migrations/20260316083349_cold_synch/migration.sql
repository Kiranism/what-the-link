ALTER TABLE `bookmarks` ADD `embedding` blob;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `embedding_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `embedding_retries` integer DEFAULT 0 NOT NULL;