-- READ-ONLY inventory of a Supabase project (run by scripts/prod-inventory.sh).
BEGIN READ ONLY;
\echo === Tables with rows outside public (public is migrated) ===
SELECT n.nspname || '.' || c.relname AS tbl, c.reltuples::bigint AS est_rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname NOT IN ('public','pg_catalog','information_schema','pg_toast')
  AND c.reltuples > 0
ORDER BY 1;
\echo === Storage buckets: id, public, objects, MB ===
SELECT b.id, b.public, count(o.id), round(coalesce(sum((o.metadata->>'size')::bigint),0)/1048576.0, 1)
FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.public ORDER BY 1;
\echo === Newest writes ===
SELECT 'orders', max(created_at)::text FROM public.orders
UNION ALL SELECT 'payment_transactions', max(created_at)::text FROM public.payment_transactions
UNION ALL SELECT 'now (db clock)', now()::text;
ROLLBACK;
