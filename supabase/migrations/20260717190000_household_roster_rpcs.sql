-- Controlled RPCs for the household roster and caregiver invitations.
--
-- RLS on public.profiles only permits `auth.uid() = id` (self-select only),
-- so a plain client-side join cannot read another household member's
-- display_name, and email lives on auth.users, which browsers never query
-- directly. These security-definer functions expose exactly the roster and
-- pending-invitation views the household UI needs, fully qualifying every
-- relation with an empty search_path.
--
-- create_household_invitation is re-declared here with the identical
-- signature and logic from the initial tenant schema migration, plus one new
-- guard: an anonymous/demo Supabase session must never be able to invite a
-- real person into a household.

create or replace function public.list_household_members()
returns table (
  user_id uuid,
  role public.household_role,
  display_name text,
  email text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to view the household roster' using errcode = '42501';
  end if;
  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_member(target_household_id) then
    raise exception 'Only a household member can view the roster' using errcode = '42501';
  end if;

  return query
    select
      membership.user_id,
      membership.role,
      profile.display_name,
      user_record.email,
      membership.created_at
    from public.household_members as membership
    join public.profiles as profile on profile.id = membership.user_id
    join auth.users as user_record on user_record.id = membership.user_id
    where membership.household_id = target_household_id
    order by membership.created_at asc;
end;
$$;

create or replace function public.list_household_invitations()
returns table (
  id uuid,
  invitee_email text,
  invitee_phone_e164 text,
  role public.household_role,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication is required to view invitations' using errcode = '42501';
  end if;
  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can view invitations' using errcode = '42501';
  end if;

  return query
    select
      invitation.id,
      invitation.invitee_email,
      invitation.invitee_phone_e164,
      invitation.role,
      invitation.expires_at,
      invitation.created_at
    from public.household_invitations as invitation
    where invitation.household_id = target_household_id
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and invitation.expires_at > now()
    order by invitation.created_at desc;
end;
$$;

create or replace function public.create_household_invitation(
  invitee_contact_input text,
  role_input text default 'caregiver'
)
returns table (invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_household_id uuid;
  normalized_email text;
  normalized_phone text;
  requested_role public.household_role;
  raw_token text;
  hashed_token text;
  created_invitation_id uuid;
  invitation_expiry timestamptz := now() + interval '7 days';
begin
  if caller_id is null then
    raise exception 'Authentication is required to invite a caregiver' using errcode = '42501';
  end if;
  if (select is_anonymous from auth.users where id = caller_id) then
    raise exception 'A guest session cannot invite a caregiver' using errcode = '42501';
  end if;
  normalized_email := lower(btrim(invitee_contact_input));
  normalized_phone := btrim(invitee_contact_input);
  if normalized_phone !~ '^[+][1-9][0-9]{6,14}$' then
    normalized_phone := null;
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    normalized_email := null;
  end if;
  if normalized_email is null and normalized_phone is null then
    raise exception 'A valid invitation email or phone number is required' using errcode = '22023';
  end if;
  if role_input not in ('caregiver', 'viewer') then
    raise exception 'Only caregiver or viewer invitations are allowed' using errcode = '22023';
  end if;
  requested_role := role_input::public.household_role;
  target_household_id := private.current_active_household_id();
  if target_household_id is null or not private.is_household_owner(target_household_id) then
    raise exception 'Only the household owner can invite a caregiver' using errcode = '42501';
  end if;

  raw_token := replace(extensions.gen_random_uuid()::text, '-', '')
    || replace(extensions.gen_random_uuid()::text, '-', '');
  hashed_token := encode(extensions.digest(raw_token, 'sha256'), 'hex');

  -- Re-sending replaces an unaccepted link instead of leaving multiple valid
  -- credentials for the same verified email address or phone number.
  update public.household_invitations
  set revoked_at = now()
  where household_id = target_household_id
    and (
      (normalized_email is not null and invitee_email = normalized_email)
      or (normalized_phone is not null and invitee_phone_e164 = normalized_phone)
    )
    and accepted_at is null
    and revoked_at is null;

  insert into public.household_invitations (
    household_id,
    invitee_email,
    invitee_phone_e164,
    role,
    token_hash,
    invited_by,
    expires_at
  )
  values (
    target_household_id,
    normalized_email,
    normalized_phone,
    requested_role,
    hashed_token,
    caller_id,
    invitation_expiry
  )
  returning id into created_invitation_id;

  insert into public.household_audit_events (
    household_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_household_id,
    caller_id,
    'caregiver_invited',
    'household_invitation',
    created_invitation_id,
    jsonb_build_object('role', role_input)
  );

  return query select created_invitation_id, raw_token, invitation_expiry;
end;
$$;

revoke execute on function public.list_household_members() from public;
revoke execute on function public.list_household_members() from anon;
grant execute on function public.list_household_members() to authenticated;
grant execute on function public.list_household_members() to service_role;

revoke execute on function public.list_household_invitations() from public;
revoke execute on function public.list_household_invitations() from anon;
grant execute on function public.list_household_invitations() to authenticated;
grant execute on function public.list_household_invitations() to service_role;

revoke execute on function public.create_household_invitation(text, text) from public;
revoke execute on function public.create_household_invitation(text, text) from anon;
grant execute on function public.create_household_invitation(text, text) to authenticated;
grant execute on function public.create_household_invitation(text, text) to service_role;
