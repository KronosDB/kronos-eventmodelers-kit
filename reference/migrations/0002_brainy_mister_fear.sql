CREATE TABLE "archive_item_carts" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"product_id" uuid NOT NULL
);
--> statement-breakpoint
DROP TABLE "carts_with_products" CASCADE;--> statement-breakpoint
CREATE INDEX "archive_item_carts_product" ON "archive_item_carts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "archive_item_carts_cart" ON "archive_item_carts" USING btree ("aggregate_id");