-- Internet Price Tag — operator moderation toolkit (§48).
-- Run against production with service-role access. No dashboard required.

-- Audit trail for privileged actions.
create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit enable row level security;

-- Reserve a domain (e.g. brand protection / legal request).
create or replace function public.ops_reserve_domain(p_domain text, p_reason text, p_by text)
returns void language sql security definer set search_path = public as $$
  insert into public.reserved_domains(domain, reason, created_by) values (p_domain, p_reason, p_by);
  insert into public.admin_audit(action, target, detail)
  values ('reserve_domain', p_domain, jsonb_build_object('reason', p_reason, 'by', p_by));
$$;

create or replace function public.ops_unreserve_domain(p_domain text, p_by text)
returns void language sql security definer set search_path = public as $$
  delete from public.reserved_domains where domain = p_domain;
  insert into public.admin_audit(action, target, detail)
  values ('unreserve_domain', p_domain, jsonb_build_object('by', p_by));
$$;

-- Suspend / unsuspend a user (blocks new quotes at API layer).
create or replace function public.ops_suspend_user(p_handle text, p_by text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set suspended_at = now() where handle = p_handle;
  insert into public.admin_audit(action, target, detail)
  values ('suspend_user', p_handle, jsonb_build_object('by', p_by));
$$;

create or replace function public.ops_unsuspend_user(p_handle text, p_by text)
returns void language sql security definer set search_path = public as $$
  update public.profiles set suspended_at = null where handle = p_handle;
  insert into public.admin_audit(action, target, detail)
  values ('unsuspend_user', p_handle, jsonb_build_object('by', p_by));
$$;

-- Usage:
-- select public.ops_reserve_domain('example.com', 'legal request', 'operator');
-- select public.ops_suspend_user('badactor', 'operator');
