DROP INDEX IF EXISTS `idx_bookmarks_favorite`;--> statement-breakpoint
ALTER TABLE `bookmarks` DROP COLUMN `is_favorite`;