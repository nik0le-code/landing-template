CREATE TABLE `leads_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form` text NOT NULL,
	`name` text,
	`email` text,
	`phone` text,
	`company` text,
	`subject` text,
	`message` text,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`locale` text,
	`page_path` text,
	`attribution` text,
	`spam_reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `leads_created_at_idx` ON `leads_submissions` (`created_at`);--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads_submissions` (`status`);