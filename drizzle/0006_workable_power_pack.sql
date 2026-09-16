CREATE TABLE `catalog_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_categories_slug_unique` ON `catalog_categories` (`slug`);--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`summary` text DEFAULT '{}' NOT NULL,
	`content` text DEFAULT '{}' NOT NULL,
	`content_html` text DEFAULT '{}' NOT NULL,
	`cover_id` text,
	`gallery` text DEFAULT '[]' NOT NULL,
	`category_id` text,
	`price_cents` integer,
	`price_note` text DEFAULT '{}' NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`availability` text DEFAULT 'InStock' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `catalog_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_items_slug_unique` ON `catalog_items` (`slug`);--> statement-breakpoint
CREATE INDEX `catalog_items_listing_idx` ON `catalog_items` (`published`,`sort_order`);