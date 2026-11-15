-- Een gegenereerde contractbrief is platte tekst in de bestaande privé-bucket.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    update storage.buckets
    set allowed_mime_types = allowed_mime_types || array['text/plain']::text[]
    where id = 'booking-documents'
      and (allowed_mime_types is null or not ('text/plain' = any (allowed_mime_types)));
  end if;
end $$;
