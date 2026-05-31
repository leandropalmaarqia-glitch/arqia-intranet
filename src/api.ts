/**
 * api.ts — Cliente HTTP para a API Arqia Intranet
 */

const BASE = '/api';

// ── Verifica se o servidor está online ───────────────────────────────────
let _serverUp: boolean | null = null;
let _lastCheck = 0;
const CACHE_MS = 8000; // revalida a cada 8s

export async function isServerUp(): Promise<boolean> {
  const now = Date.now();
  if (_serverUp !== null && now - _lastCheck < CACHE_MS) return _serverUp;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BASE}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    _serverUp = res.ok;
  } catch {
    _serverUp = false;
  }

  _lastCheck = now;
  return _serverUp ?? false;
}

// Força recheck imediato (útil ao montar o App)
export function resetServerCache() {
  _serverUp = null;
  _lastCheck = 0;
}

// ── HTTP helper ───────────────────────────────────────────────────────────
async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);

    const text = await res.text();
    if (!text) throw new Error('Resposta vazia do servidor.');
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error('Resposta inválida do servidor.'); }
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    return data as T;
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Servidor não respondeu (timeout).');
    throw e;
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────
export async function loginAPI(
  email: string, password: string
): Promise<{ email: string; name: string; role: 'ADM' | 'Suporte' }> {
  return http('POST', '/login', { email, password });
}

// ── DEVICES ───────────────────────────────────────────────────────────────
export async function getDevices(): Promise<any[]> {
  return http<any[]>('GET', '/devices');
}

export async function saveDevices(
  items: any[]
): Promise<{ inserted: number; duplicates: number }> {
  return http('POST', '/devices/bulk', { items });
}

export async function deleteDevice(id: number): Promise<void> {
  return http('DELETE', `/devices/${id}`);
}

// ── BASES ─────────────────────────────────────────────────────────────────
export async function getBases(): Promise<any[]> {
  return http<any[]>('GET', '/bases');
}

export async function createBase(data: any): Promise<any> {
  return http('POST', '/bases', data);
}

export async function updateBase(id: number, data: any): Promise<any> {
  return http('PUT', `/bases/${id}`, data);
}

export async function deleteBase(id: number): Promise<void> {
  return http('DELETE', `/bases/${id}`);
}

// ── USUÁRIOS ──────────────────────────────────────────────────────────────
export async function getUsuarios(): Promise<any[]> {
  return http<any[]>('GET', '/usuarios');
}

export async function createUsuario(
  email: string, password: string, role: string
): Promise<void> {
  return http('POST', '/usuarios', { email, password, role });
}

export async function updateUsuarioRole(email: string, role: string): Promise<void> {
  return http('PUT', `/usuarios/${encodeURIComponent(email)}/role`, { role });
}

export async function deleteUsuario(email: string): Promise<void> {
  return http('DELETE', `/usuarios/${encodeURIComponent(email)}`);
}
