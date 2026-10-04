-- =====================================================================
-- Removes EVERYTHING created by setup.sql (all `asmt_*` objects).
-- Touches nothing else. The shared `vector` extension is left in place
-- because other applications on this project depend on it.
-- =====================================================================
drop function if exists public.asmt_match_chunks(vector, integer, float);
drop table if exists public.asmt_messages      cascade;
drop table if exists public.asmt_conversations cascade;
drop table if exists public.asmt_chunks        cascade;
drop table if exists public.asmt_sources       cascade;
drop table if exists public.asmt_logs          cascade;

-- Verify nothing is left (should return 0 rows):
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'asmt\_%';
