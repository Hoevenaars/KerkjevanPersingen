-- Beheerders met instellingen-schrijfrecht mogen het contractsjabloon
-- in de bestaande documentenbucket zetten. Upsert heeft select, insert en update nodig.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute $policy$
      drop policy if exists booking_documents_sjabloon_select on storage.objects;
      create policy booking_documents_sjabloon_select on storage.objects
        for select to authenticated
        using (
          bucket_id = 'booking-documents'
          and name like 'sjablonen/%'
          and (select app.heeft_recht('instellingen', 'lezen'))
        );
      drop policy if exists booking_documents_sjabloon_insert on storage.objects;
      create policy booking_documents_sjabloon_insert on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'booking-documents'
          and name like 'sjablonen/%'
          and (select app.heeft_recht('instellingen', 'schrijven'))
        );
      drop policy if exists booking_documents_sjabloon_update on storage.objects;
      create policy booking_documents_sjabloon_update on storage.objects
        for update to authenticated
        using (
          bucket_id = 'booking-documents'
          and name like 'sjablonen/%'
          and (select app.heeft_recht('instellingen', 'schrijven'))
        )
        with check (
          bucket_id = 'booking-documents'
          and name like 'sjablonen/%'
          and (select app.heeft_recht('instellingen', 'schrijven'))
        );
      drop policy if exists booking_documents_sjabloon_delete on storage.objects;
      create policy booking_documents_sjabloon_delete on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'booking-documents'
          and name like 'sjablonen/%'
          and (select app.heeft_recht('instellingen', 'schrijven'))
        );
    $policy$;
  end if;
end $$;
