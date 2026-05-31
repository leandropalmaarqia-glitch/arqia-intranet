# 🚀 Como rodar a Intranet Arqia

## Modo Demo (Netlify + Supabase — RECOMENDADO)

### 1. Criar banco no Supabase (grátis)
1. Acesse https://supabase.com e crie uma conta
2. Clique em "New Project"
3. Vá em **SQL Editor** → **New Query**
4. Cole o conteúdo de `/supabase/schema.sql` e clique em **Run**
5. Vá em **Project Settings → API** e copie:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

### 2. Configurar variáveis
Crie o arquivo `.env`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx...
```

No **Netlify**: Site Settings → Environment Variables → adicione as mesmas.

### 3. Rodar localmente
```bash
npm install
npm run dev
```

### 4. Deploy no Netlify
```bash
npm run build
# Suba a pasta /dist no Netlify
```

---

## Credenciais padrão

| E-mail | Senha | Perfil |
|---|---|---|
| leandro.palma@arqia.com.br | 5656 | ADM |
| devices.fulfillment@arqia.com.br | 142536 | Suporte |
| gustavo.holanda@arqia.com.br | 142536 | Suporte |
| suporte@arqia.com.br | 142536 | Suporte |

---

## O que fica salvo no Supabase (para todos os usuários)

| Tabela | Conteúdo |
|---|---|
| `usuarios` | Logins, senhas, roles |
| `devices` | ICCID, IMEI, cliente, cotação, SIM Card |
| `bases` | CNPJ, razão social, fantasia, proprietário |

## Sem Supabase configurado
O sistema funciona em modo local (localStorage) — dados ficam só no navegador de quem está usando.
