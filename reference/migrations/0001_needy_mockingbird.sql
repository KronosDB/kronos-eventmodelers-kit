CREATE TABLE "carts_with_products" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"product_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE INDEX "carts_with_products_product" ON "carts_with_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "carts_with_products_cart" ON "carts_with_products" USING btree ("aggregate_id");