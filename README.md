# Calendário da Luiza

App de acompanhamento comportamental compartilhado, com marcação de dias por cor (azul/amarelo/vermelho) e observações, sincronizado em tempo real via Supabase.

## 1. Criar o banco (Supabase)

1. Em [supabase.com](https://supabase.com), crie um novo projeto (ou use um existente).
2. Abra **SQL Editor** e rode o conteúdo do arquivo `supabase-schema.sql` deste repositório.
3. Em **Project Settings → API**, copie:
   - `Project URL`
   - `anon public key`

## 2. Rodar localmente (opcional, para testar antes de publicar)

```bash
npm install
cp .env.example .env
# edite .env com sua URL e chave do Supabase
npm run dev
```

## 3. Publicar no Vercel

**Opção A — pelo site (mais simples):**
1. Suba esta pasta para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com) → **Add New Project** → importe o repositório.
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clique em **Deploy**. O Vercel detecta automaticamente que é um projeto Vite.

**Opção B — pelo terminal:**
```bash
npm install -g vercel
vercel login
vercel
# depois de configurado uma vez:
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

## 4. Compartilhar com a neuropsicóloga

Depois do deploy, o Vercel te dá uma URL (tipo `calendario-luiza.vercel.app`). Envie esse link para ela — qualquer uma das duas que marcar um dia, a outra vê a atualização automaticamente ao abrir (ou em tempo real, se o app estiver aberto).

## Sobre segurança

O link não fica listado em lugar nenhum, mas qualquer pessoa com a URL consegue ver e editar os dados (não há login). Se no futuro quiser adicionar uma senha ou login real, é possível evoluir o app com Supabase Auth.
