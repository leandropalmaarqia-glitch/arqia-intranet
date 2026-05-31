-- ═══════════════════════════════════════════════════════════════
--  Arqia Intranet — Schema completo para Supabase
--  Cole TUDO isso no Supabase: SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Tabelas
CREATE TABLE IF NOT EXISTS usuarios (
  id        BIGSERIAL PRIMARY KEY,
  email     TEXT NOT NULL UNIQUE,
  senha     TEXT NOT NULL,
  nome      TEXT,
  role      TEXT NOT NULL DEFAULT 'Suporte' CHECK (role IN ('ADM','Suporte')),
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id        BIGSERIAL PRIMARY KEY,
  iccid     TEXT NOT NULL UNIQUE,
  imei      TEXT,
  cliente   TEXT,
  cotacao   TEXT,
  simcard   TEXT,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bases (
  id               BIGSERIAL PRIMARY KEY,
  cnpj_cpf         TEXT,
  razao_social     TEXT,
  nome_fantasia    TEXT,
  proprietario     TEXT,
  codigo_cliente   TEXT,
  status           TEXT DEFAULT 'Ativo',
  plataforma       TEXT DEFAULT 'N/A',
  ultima_alteracao TEXT,
  criado_em        TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilita RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bases    ENABLE ROW LEVEL SECURITY;

-- 3. Policies — acesso total para a chave anon (todos os usuários do sistema)
DROP POLICY IF EXISTS "anon_all_usuarios" ON usuarios;
DROP POLICY IF EXISTS "anon_all_devices"  ON devices;
DROP POLICY IF EXISTS "anon_all_bases"    ON bases;

CREATE POLICY "anon_all_usuarios" ON usuarios FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_devices"  ON devices  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_bases"    ON bases     FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Usuários padrão
INSERT INTO usuarios (email, senha, nome, role) VALUES
  ('leandro.palma@arqia.com.br',       '5656',   'Leandro Palma',      'ADM'),
  ('devices.fulfillment@arqia.com.br', '142536', 'Devices Fulfillment','Suporte'),
  ('gustavo.holanda@arqia.com.br',     '142536', 'Gustavo Holanda',    'Suporte'),
  ('suporte@arqia.com.br',             '142536', 'Suporte',            'Suporte')
ON CONFLICT (email) DO NOTHING;
