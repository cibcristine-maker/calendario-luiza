-- Rode isto no SQL Editor do seu projeto Supabase

create table if not exists entries (
  date date primary key,
  cor text,
  nota text,
  updated_by text,
  updated_at timestamptz default now()
);

alter table entries enable row level security;

-- Como o app é acessado só por você e a neuropsicóloga via um link
-- não divulgado, liberamos leitura/escrita para a chave anon.
-- Se quiser mais proteção depois, dá pra trocar por autenticação real.
create policy "allow read" on entries for select using (true);
create policy "allow insert" on entries for insert with check (true);
create policy "allow update" on entries for update using (true);
create policy "allow delete" on entries for delete using (true);

-- Habilita realtime (edições aparecem na hora para as duas)
alter publication supabase_realtime add table entries;
