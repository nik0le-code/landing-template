CREATE TABLE `media_files` (
	`id` text PRIMARY KEY NOT NULL,
	`filename` text NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`color` text NOT NULL,
	`variants` text NOT NULL,
	`uploaded_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_files_created_at_idx` ON `media_files` (`created_at`);