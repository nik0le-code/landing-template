CREATE TABLE `blog_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_categories_slug_unique` ON `blog_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`translation_key` text NOT NULL,
	`locale` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`content_html` text DEFAULT '' NOT NULL,
	`headings` text DEFAULT '[]' NOT NULL,
	`reading_minutes` integer DEFAULT 1 NOT NULL,
	`cover_id` text,
	`category_id` text,
	`author_name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`seo_title` text DEFAULT '' NOT NULL,
	`seo_description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `blog_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_locale_slug_idx` ON `blog_posts` (`locale`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_translation_locale_idx` ON `blog_posts` (`translation_key`,`locale`);--> statement-breakpoint
CREATE INDEX `blog_posts_listing_idx` ON `blog_posts` (`locale`,`status`,`published_at`);