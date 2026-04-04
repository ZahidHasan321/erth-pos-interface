-- Enable Supabase Realtime for tables that POS and Workshop apps subscribe to.
-- This adds the tables to the supabase_realtime publication so that
-- postgres_changes events are broadcast to connected clients.

alter publication supabase_realtime add table garments;
alter publication supabase_realtime add table transfer_requests;
alter publication supabase_realtime add table transfer_request_items;
alter publication supabase_realtime add table fabrics;
alter publication supabase_realtime add table shelf;
alter publication supabase_realtime add table accessories;
