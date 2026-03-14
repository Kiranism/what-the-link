CREATE TABLE `bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`url` text NOT NULL UNIQUE,
	`title` text,
	`description` text,
	`image` text,
	`favicon` text,
	`domain` text NOT NULL,
	`tags` text DEFAULT '[]',
	`is_archived` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`source` text DEFAULT 'whatsapp' NOT NULL,
	`whatsapp_message_id` text,
	`metadata_status` text DEFAULT 'complete' NOT NULL,
	`metadata_retries` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL UNIQUE,
	`count` integer DEFAULT 1 NOT NULL,
	`last_used` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `todo` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`text` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY,
	`value` text
);
--> statement-breakpoint
CREATE INDEX `idx_bookmarks_created_at` ON `bookmarks` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_bookmarks_domain` ON `bookmarks` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_bookmarks_favorite` ON `bookmarks` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `idx_bookmarks_archived` ON `bookmarks` (`is_archived`);