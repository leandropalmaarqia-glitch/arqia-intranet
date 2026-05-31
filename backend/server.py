"""
server.py — API REST Arqia Intranet (Python + Flask + MySQL)

Dev:
    # Terminal 1 — API Python
    cd backend
    python server.py

    # Terminal 2 — Frontend React
    npx vite

Prod:
    npm run build
    FLASK_ENV=production python backend/server.py
"""

import os
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import mysql.connector
from mysql.connector import pooling, IntegrityError
import bcrypt
from dotenv import dotenv_values

# ── Configuração ──────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)

# Carrega .env da raiz do projeto
env = dotenv_values(os.path.join(ROOT_DIR, ".env"))

DB_HOST     = env.get("DB_HOST",     "localhost")
DB_PORT     = int(env.get("DB_PORT", 3306))
DB_USER     = env.get("DB_USER",     "root")
DB_PASSWORD = env.get("DB_PASSWORD", "")
DB_NAME     = env.get("DB_NAME",     "arqia_intranet")
API_PORT    = int(env.get("API_PORT", 3001))
FLASK_ENV   = env.get("NODE_ENV",    "development")

# ── Pool de conexões MySQL ────────────────────────────────────────────────
db_config = {
    "host":           DB_HOST,
    "port":           DB_PORT,
    "user":           DB_USER,
    "password":       DB_PASSWORD,
    "database":       DB_NAME,
    "charset":        "utf8mb4",
    "autocommit":     True,
    "raise_on_warnings": False,
}

pool = pooling.MySQLConnectionPool(
    pool_name="arqia_pool",
    pool_size=10,
    **db_config
)

def get_conn():
    return pool.get_connection()

def query(sql, params=None, fetchone=False, fetchall=False, lastrowid=False):
    """Executa SQL e retorna resultado conforme o modo."""
    conn = get_conn()
    cur  = conn.cursor(dictionary=True)
    cur.execute(sql, params or ())
    if fetchall:
        result = cur.fetchall()
    elif fetchone:
        result = cur.fetchone()
    elif lastrowid:
        result = cur.lastrowid
    else:
        result = None
    cur.close()
    conn.close()
    return result

# ── Inicializa banco de dados ─────────────────────────────────────────────
def init_db():
    # Cria banco se não existir (conexão sem database)
    conn = mysql.connector.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        charset="utf8mb4", autocommit=True,
    )
    cur = conn.cursor()
    cur.execute(
        f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` "
        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    )
    cur.close()
    conn.close()

    # Tabelas
    query("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            email      VARCHAR(255) NOT NULL UNIQUE,
            senha_hash VARCHAR(255) NOT NULL,
            nome       VARCHAR(255),
            role       ENUM('ADM','Suporte') DEFAULT 'Suporte',
            criado_em  DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    query("""
        CREATE TABLE IF NOT EXISTS devices (
            id        INT AUTO_INCREMENT PRIMARY KEY,
            iccid     VARCHAR(30)  NOT NULL UNIQUE,
            imei      VARCHAR(20),
            cliente   VARCHAR(255),
            cotacao   VARCHAR(100),
            simcard   VARCHAR(50),
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    query("""
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
    """)

    # Usuários padrão
    defaults = [
        ("leandro.palma@arqia.com.br",       "5656",   "Leandro Palma",      "ADM"),
        ("devices.fulfillment@arqia.com.br",  "142536", "Devices Fulfillment","Suporte"),
        ("gustavo.holanda@arqia.com.br",       "142536", "Gustavo Holanda",    "Suporte"),
        ("suporte@arqia.com.br",               "142536", "Suporte",            "Suporte"),
    ]
    for email, senha, nome, role in defaults:
        exists = query(
            "SELECT id FROM usuarios WHERE email = %s", (email,), fetchone=True
        )
        if not exists:
            hashed = bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()
            query(
                "INSERT INTO usuarios (email, senha_hash, nome, role) VALUES (%s,%s,%s,%s)",
                (email, hashed, nome, role)
            )

    print("✅ Banco de dados pronto.")

# ── Flask App ─────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=os.path.join(ROOT_DIR, "dist"))
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"]  = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    return response

@app.route("/api/<path:path>", methods=["OPTIONS"])
def options_handler(path):
    return "", 204

def ok(data=None, status=200):
    return jsonify(data if data is not None else {"ok": True}), status

def err(msg, status=400):
    return jsonify({"error": msg}), status

def now_br():
    return datetime.now().strftime("%d/%m/%Y %H:%M:%S")

# ── Health ────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return ok({"status": "ok", "ts": datetime.utcnow().isoformat()})

# ── LOGIN ─────────────────────────────────────────────────────────────────
@app.post("/api/login")
def login():
    body     = request.get_json() or {}
    email    = body.get("email", "").strip().lower()
    password = str(body.get("password", ""))

    if not email or not password:
        return err("E-mail e senha obrigatórios.", 400)

    user = query(
        "SELECT * FROM usuarios WHERE email = %s", (email,), fetchone=True
    )
    if not user:
        return err("E-mail ou senha inválidos.", 401)

    if not bcrypt.checkpw(password.encode(), user["senha_hash"].encode()):
        return err("E-mail ou senha inválidos.", 401)

    return ok({"email": user["email"], "name": user["nome"], "role": user["role"]})

# ── DEVICES ───────────────────────────────────────────────────────────────
@app.get("/api/devices")
def get_devices():
    rows = query("SELECT * FROM devices ORDER BY criado_em DESC", fetchall=True)
    return ok(rows)

@app.post("/api/devices/bulk")
def bulk_devices():
    items     = (request.get_json() or {}).get("items", [])
    inserted  = 0
    duplicates = 0

    for item in items:
        try:
            query(
                "INSERT INTO devices (iccid, imei, cliente, cotacao, simcard) "
                "VALUES (%s, %s, %s, %s, %s)",
                (item.get("iccid"), item.get("imei"), item.get("cliente"),
                 item.get("cotacao"), item.get("simcard"))
            )
            inserted += 1
        except IntegrityError:
            duplicates += 1

    return ok({"inserted": inserted, "duplicates": duplicates})

@app.delete("/api/devices/<int:device_id>")
def delete_device(device_id):
    query("DELETE FROM devices WHERE id = %s", (device_id,))
    return ok()

# ── BASES ─────────────────────────────────────────────────────────────────
@app.get("/api/bases")
def get_bases():
    rows = query("SELECT * FROM bases ORDER BY criado_em DESC", fetchall=True)
    return ok(rows)

@app.post("/api/bases")
def create_base():
    b  = request.get_json() or {}
    ts = now_br()
    last_id = query(
        "INSERT INTO bases (cnpj_cpf, razao_social, nome_fantasia, proprietario, "
        "codigo_cliente, ultima_alteracao) VALUES (%s,%s,%s,%s,%s,%s)",
        (b.get("cnpjCpf"), b.get("razaoSocial"), b.get("nomeFantasia"),
         b.get("proprietario"), b.get("codigoCliente"), ts),
        lastrowid=True
    )
    row = query("SELECT * FROM bases WHERE id = %s", (last_id,), fetchone=True)
    return ok(row), 201

@app.put("/api/bases/<int:base_id>")
def update_base(base_id):
    b  = request.get_json() or {}
    ts = now_br()
    query(
        "UPDATE bases SET cnpj_cpf=%s, razao_social=%s, nome_fantasia=%s, "
        "proprietario=%s, codigo_cliente=%s, status=%s, plataforma=%s, "
        "ultima_alteracao=%s WHERE id=%s",
        (b.get("cnpjCpf"), b.get("razaoSocial"), b.get("nomeFantasia"),
         b.get("proprietario"), b.get("codigoCliente"),
         b.get("status", "Ativo"), b.get("plataforma", "N/A"), ts, base_id)
    )
    row = query("SELECT * FROM bases WHERE id = %s", (base_id,), fetchone=True)
    return ok(row)

@app.delete("/api/bases/<int:base_id>")
def delete_base(base_id):
    query("DELETE FROM bases WHERE id = %s", (base_id,))
    return ok()

# ── USUÁRIOS ──────────────────────────────────────────────────────────────
@app.get("/api/usuarios")
def get_usuarios():
    rows = query(
        "SELECT id, email, nome, role, criado_em FROM usuarios "
        "ORDER BY role DESC, email",
        fetchall=True
    )
    return ok(rows)

@app.post("/api/usuarios")
def create_usuario():
    b        = request.get_json() or {}
    email    = b.get("email", "").strip().lower()
    password = str(b.get("password", ""))
    role     = b.get("role", "Suporte")

    if not email or not password:
        return err("E-mail e senha obrigatórios.", 400)

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    try:
        query(
            "INSERT INTO usuarios (email, senha_hash, nome, role) VALUES (%s,%s,%s,%s)",
            (email, hashed, email.split("@")[0], role)
        )
    except IntegrityError:
        return err("E-mail já cadastrado.", 409)

    return ok()

@app.put("/api/usuarios/<path:email>/role")
def update_role(email):
    role = (request.get_json() or {}).get("role")
    query("UPDATE usuarios SET role=%s WHERE email=%s", (role, email))
    return ok()

@app.delete("/api/usuarios/<path:email>")
def delete_usuario(email):
    query("DELETE FROM usuarios WHERE email=%s", (email,))
    return ok()

# ── Serve frontend em produção ────────────────────────────────────────────
@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def serve_frontend(path):
    dist = os.path.join(ROOT_DIR, "dist")
    if path and os.path.exists(os.path.join(dist, path)):
        return send_from_directory(dist, path)
    return send_from_directory(dist, "index.html")

# ── Start ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    print(f"\n🚀 API Arqia rodando em http://localhost:{API_PORT}")
    print(f"   Health: http://localhost:{API_PORT}/api/health\n")
    app.run(host="0.0.0.0", port=API_PORT, debug=(FLASK_ENV != "production"))
