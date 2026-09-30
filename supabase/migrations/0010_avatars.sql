-- Profile photos: a scoped read of other users' avatars, plus a storage bucket to upload them to.
-- profiles stays locked to "own row only" (0001) -- this adds a narrow, read-only exception for
-- avatar_url alone, limited to people you actually share a group with or have as a contact.

create or replace function public.linked_avatars(p_user_ids uuid[])
returns table(id uuid, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.avatar_url
  from public.profiles p
  where p.id = any(p_user_ids)
    and (
      p.id = auth.uid()
      or exists (
        select 1 from public.group_members gm1
        join public.group_members gm2 on gm1.group_id = gm2.group_id
        where gm1.user_id = auth.uid() and gm2.user_id = p.id
      )
      or exists (select 1 from public.contacts c where c.owner_id = auth.uid() and c.user_id = p.id)
    );
$$;

grant execute on function public.linked_avatars(uuid[]) to authenticated;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar images are publicly readable" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload their own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users replace their own avatar" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users remove their own avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
