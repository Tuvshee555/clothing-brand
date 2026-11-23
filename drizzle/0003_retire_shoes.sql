-- MANAN is a clothing store again: its five shoes now live in ALKHAM, Ursgal's separate
-- shoe-store demo. Archived, not deleted, so any order that names them keeps its lines.
UPDATE "store"."products" SET "status" = 'archived', "updated_at" = now()
WHERE "slug" IN ('everyday-sneaker', 'mesh-runner', 'leather-loafer', 'suede-ankle-boot', 'lace-up-leather-boot');
--> statement-breakpoint
UPDATE "store"."categories" SET "is_active" = false, "updated_at" = now() WHERE "slug" = 'shoes';
