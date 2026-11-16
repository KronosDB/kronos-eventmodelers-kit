CREATE TABLE "cart_items" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"image" text NOT NULL,
	"price" double precision NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cart_items_cart" ON "cart_items" USING btree ("aggregate_id");