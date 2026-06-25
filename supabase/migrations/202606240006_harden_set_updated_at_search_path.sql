-- 202606240006_harden_set_updated_at_search_path.sql
--
-- Supabase security linter (0011_function_search_path_mutable) flags
-- public.set_updated_at() for a mutable search_path. Pin it so the trigger
-- function can't be influenced by a caller's search_path. is_org_member /
-- has_org_role already set search_path = public. Idempotent.

ALTER FUNCTION public.set_updated_at() SET search_path = public;
