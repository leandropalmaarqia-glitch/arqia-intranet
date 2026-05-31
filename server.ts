/**
 * server.ts — API REST Arqia Intranet
 *
 * Dev:  npx tsx server.ts  (porta 3001)
 *       npx vite           (porta 5173, com proxy /api → 3001)
 *
 * Prod: npm run build && NODE_ENV=production npx tsx server.ts
 */

import express    from 'express';
import cors       from 'cors';
import mysql      from 'mysql2/promise';
import bcrypt     from 'bcryptjs';
import dotenv     from 'dotenv';
import path       from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DB_NAME    = process.env.DB_NAME || 'arqia_intranet';

// ── Pool MySQL ────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  charset:            'utf8mb4',
});

// ── Cria tabelas e usuários padrão ────────────────────────────────────────
async function initDB() {
  const conn = await pool.getConnection();
  try {
    // Garante que o banco existe
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${DB_NAME}\``);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        email      VARCHAR(255) NOT NULL UNIQUE,
        senha_hash VARCHAR(255) NOT NULL,
        nome       VARCHAR(255),
        role       ENUM('ADM','Suporte') DEFAULT 'Suporte',
        criado_em  DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        iccid     VARCHAR(30)  NOT NULL UNIQUE,
        imei      VARCHAR(20),
        cliente   VARCHAR(255),
        cotacao   VARCHAR(100),
        simcard   VARCHAR(50),
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS bases (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        cnpj_cpf         VARCHAR(20),
        razao_social     VARCHAR(255),
        nome_fantasia    VARCHAR(255),
        proprietario     VARCHAR(255),
        codigo_cliente   VARCHAR(50),
        status           VARCHAR(50)  DEFAULT 'Ativo',
        plataforma       VARCHAR(100) DEFAULT 'N/A',
        ultima_alteracao VARCHAR(50),
        criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Usuários padrão (só insere se não existirem)
    const defaults = [
      { email: 'leandro.palma@arqia.com.br',       senha: '5656',   nome: 'Leandro Palma',      role: 'ADM'     },
      { email: 'devices.fulfillment@arqia.com.br', senha: '142536', nome: 'Devices Fulfillment', role: 'Suporte' },
      { email: 'gustavo.holanda@arqia.com.br',      senha: '142536', nome: 'Gustavo Holanda',     role: 'Suporte' },
      { email: 'suporte@arqia.com.br',              senha: '142536', nome: 'Suporte',             role: 'Suporte' },
    ];
    for (const u of defaults) {
      const hash = await bcrypt.hash(u.senha, 10);
      await conn.query(
        `INSERT IGNORE INTO usuarios (email, senha_hash, nome, role) VALUES (?, ?, ?, ?)`,
        [u.email, hash, u.nome, u.role]
      );
    }

    console.log('✅ Banco de dados pronto.');
  } finally {
    conn.release();
  }
}

// ── Express ───────────────────────────────────────────────────────────────
const app  = express();
const PORT = Number(process.env.API_PORT) || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));

// ── Health ────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── LOGIN ─────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });
  try {
    const [rows]: any = await pool.query(
      'SELECT * FROM usuarios WHERE email = ?', [email]
    );
    if (!rows.length)
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    const u  = rows[0];
    const ok = await bcrypt.compare(String(password), u.senha_hash);
    if (!ok)
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    res.json({ email: u.email, name: u.nome, role: u.role });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erro interno ao autenticar.' });
  }
});

// ── DEVICES ───────────────────────────────────────────────────────────────
app.get('/api/devices', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM devices ORDER BY criado_em DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar dispositivos.' }); }
});

app.post('/api/devices/bulk', async (req, res) => {
  const items: any[] = req.body?.items || [];
  if (!items.length) return res.json({ inserted: 0, duplicates: 0 });
  let inserted = 0, duplicates = 0;
  try {
    for (const item of items) {
      try {
        await pool.query(
          'INSERT INTO devices (iccid, imei, cliente, cotacao, simcard) VALUES (?, ?, ?, ?, ?)',
          [item.iccid, item.imei, item.cliente, item.cotacao, item.simcard]
        );
        inserted++;
      } catch (e: any) {
        if (e.code === 'ER_DUP_ENTRY') duplicates++;
        else throw e;
      }
    }
    res.json({ inserted, duplicates });
  } catch (e) { res.status(500).json({ error: 'Erro ao salvar dispositivos.' }); }
});

app.delete('/api/devices/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM devices WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao deletar dispositivo.' }); }
});

// ── BASES ─────────────────────────────────────────────────────────────────
app.get('/api/bases', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM bases ORDER BY criado_em DESC');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar bases.' }); }
});

app.post('/api/bases', async (req, res) => {
  const { cnpjCpf, razaoSocial, nomeFantasia, proprietario, codigoCliente } = req.body || {};
  const now = new Date().toLocaleString('pt-BR');
  try {
    const [result]: any = await pool.query(
      `INSERT INTO bases (cnpj_cpf, razao_social, nome_fantasia, proprietario, codigo_cliente, ultima_alteracao)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cnpjCpf, razaoSocial, nomeFantasia, proprietario, codigoCliente, now]
    );
    const [rows]: any = await pool.query('SELECT * FROM bases WHERE id = ?', [result.insertId]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar base.' }); }
});

app.put('/api/bases/:id', async (req, res) => {
  const { cnpjCpf, razaoSocial, nomeFantasia, proprietario, codigoCliente, status, plataforma } = req.body || {};
  const now = new Date().toLocaleString('pt-BR');
  try {
    await pool.query(
      `UPDATE bases SET cnpj_cpf=?, razao_social=?, nome_fantasia=?, proprietario=?,
       codigo_cliente=?, status=?, plataforma=?, ultima_alteracao=? WHERE id=?`,
      [cnpjCpf, razaoSocial, nomeFantasia, proprietario, codigoCliente,
       status || 'Ativo', plataforma || 'N/A', now, req.params.id]
    );
    const [rows]: any = await pool.query('SELECT * FROM bases WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar base.' }); }
});

app.delete('/api/bases/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bases WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao deletar base.' }); }
});

// ── USUÁRIOS ──────────────────────────────────────────────────────────────
app.get('/api/usuarios', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, email, nome, role, criado_em FROM usuarios ORDER BY role DESC, email'
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Erro ao buscar usuários.' }); }
});

app.post('/api/usuarios', async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });
  try {
    const hash = await bcrypt.hash(String(password), 10);
    await pool.query(
      'INSERT INTO usuarios (email, senha_hash, nome, role) VALUES (?, ?, ?, ?)',
      [email, hash, email.split('@')[0], role || 'Suporte']
    );
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'E-mail já cadastrado.' });
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});

app.put('/api/usuarios/:email/role', async (req, res) => {
  const { role } = req.body || {};
  try {
    await pool.query('UPDATE usuarios SET role=? WHERE email=?', [role, req.params.email]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar role.' }); }
});

app.delete('/api/usuarios/:email', async (req, res) => {
  try {
    await pool.query('DELETE FROM usuarios WHERE email=?', [req.params.email]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao deletar usuário.' }); }
});

// ── Serve frontend em produção ────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ── Start ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 API Arqia rodando em http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/api/health\n`);
    });
  } catch (e) {
    console.error('❌ Falha ao iniciar:', e);
    process.exit(1);
  }
}

start();
