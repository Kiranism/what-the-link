ALTER TABLE `bookmarks` ADD `collection` text;--> statement-breakpoint
CREATE INDEX `idx_bookmarks_collection` ON `bookmarks` (`collection`);