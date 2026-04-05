-- Add orders and order_shelf_items to the realtime publication.
-- Without this, sales orders (which often have no garment rows) don't trigger
-- cache invalidation on other devices, and the orders list goes stale until
-- a manual refresh. Work orders already work indirectly via garments events.

ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE order_shelf_items;
