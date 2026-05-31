import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const hasSupabase = Boolean(
  SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 10
);

// Cria cliente só se as chaves forem válidas
let supabase: ReturnType<typeof createClient> | null = null;
try {
  if (hasSupabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn('Supabase não configurado corretamente, usando modo local.');
}

function nowBR() {
  return new Date().toLocaleString('pt-BR');
}

// ── Usuários padrão ───────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { id: 1, email: 'leandro.palma@arqia.com.br',       senha: '5656',   nome: 'Leandro Palma',      role: 'ADM'     },
  { id: 2, email: 'devices.fulfillment@arqia.com.br', senha: '142536', nome: 'Devices Fulfillment', role: 'Suporte' },
  { id: 3, email: 'gustavo.holanda@arqia.com.br',     senha: '142536', nome: 'Gustavo Holanda',     role: 'Suporte' },
  { id: 4, email: 'suporte@arqia.com.br',             senha: '142536', nome: 'Suporte',             role: 'Suporte' },
];

// ── LocalStorage fallback ─────────────────────────────────────────────────
const LS = {
  get: (k: string): any[] => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } },
  set: (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── AUTH ──────────────────────────────────────────────────────────────────
export async function dbLogin(
  email: string, password: string
): Promise<{ email: string; name: string; role: 'ADM' | 'Suporte' }> {
  const em = email.trim().toLowerCase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', em)
        .eq('senha', password)
        .single();
      if (!error && data) return { email: data.email, name: data.nome, role: data.role };
    } catch {}
  }

  // Fallback local
  const users = LS.get('arqia_usuarios');
  const all   = users.length === 0 ? DEFAULT_USERS : users;
  const u     = all.find((u: any) => u.email === em && u.senha === password);
  if (!u) throw new Error('E-mail ou senha inválidos.');
  return { email: u.email, name: u.nome, role: u.role };
}

// ── DEVICES ───────────────────────────────────────────────────────────────
export async function dbGetDevices(): Promise<any[]> {
  if (supabase) {
    try {
      const { data } = await supabase.from('devices').select('*').order('criado_em', { ascending: false });
      if (data) return data;
    } catch {}
  }
  return LS.get('arqia_devices');
}

export async function dbSaveDevices(items: any[]): Promise<{ inserted: number; duplicates: number }> {
  if (supabase) {
    try {
      let inserted = 0, duplicates = 0;
      for (const item of items) {
        const { error } = await supabase.from('devices').insert({
          iccid: item.iccid, imei: item.imei, cliente: item.cliente,
          cotacao: item.cotacao, simcard: item.simcard,
        });
        if (error?.code === '23505') duplicates++;
        else if (!error) inserted++;
      }
      return { inserted, duplicates };
    } catch {}
  }
  // Fallback local
  const existing = LS.get('arqia_devices');
  const iccids   = new Set(existing.map((d: any) => d.iccid));
  let inserted = 0, duplicates = 0;
  for (const item of items) {
    if (iccids.has(item.iccid)) { duplicates++; continue; }
    existing.unshift({ ...item, id: Date.now() + inserted, criado_em: nowBR() });
    iccids.add(item.iccid);
    inserted++;
  }
  LS.set('arqia_devices', existing);
  return { inserted, duplicates };
}

export async function dbDeleteDevice(id: number) {
  if (supabase) { try { await supabase.from('devices').delete().eq('id', id); return; } catch {} }
  LS.set('arqia_devices', LS.get('arqia_devices').filter((d: any) => d.id !== id));
}

// ── BASES ─────────────────────────────────────────────────────────────────
export async function dbGetBases(): Promise<any[]> {
  if (supabase) {
    try {
      const { data } = await supabase.from('bases').select('*').order('criado_em', { ascending: false });
      if (data) return data;
    } catch {}
  }
  return LS.get('arqia_bases');
}

export async function dbCreateBase(data: any): Promise<any> {
  if (supabase) {
    try {
      const { data: row, error } = await supabase.from('bases').insert({
        cnpj_cpf: data.cnpjCpf || '', razao_social: data.razaoSocial || '',
        nome_fantasia: data.nomeFantasia || '', proprietario: data.proprietario || '',
        codigo_cliente: data.codigoCliente || '', status: 'Ativo',
        plataforma: 'N/A', ultima_alteracao: nowBR(),
      }).select().single();
      if (!error && row) return row;
    } catch {}
  }
  const bases = LS.get('arqia_bases');
  const base  = { id: Date.now(), cnpj_cpf: data.cnpjCpf || '', razao_social: data.razaoSocial || '',
    nome_fantasia: data.nomeFantasia || '', proprietario: data.proprietario || '',
    codigo_cliente: data.codigoCliente || '', status: 'Ativo', plataforma: 'N/A',
    ultima_alteracao: nowBR(), criado_em: nowBR() };
  bases.unshift(base);
  LS.set('arqia_bases', bases);
  return base;
}

export async function dbUpdateBase(id: number, data: any): Promise<any> {
  if (supabase) {
    try {
      const { data: row, error } = await supabase.from('bases').update({
        cnpj_cpf: data.cnpjCpf, razao_social: data.razaoSocial,
        nome_fantasia: data.nomeFantasia, proprietario: data.proprietario,
        codigo_cliente: data.codigoCliente, status: data.status || 'Ativo',
        plataforma: data.plataforma || 'N/A', ultima_alteracao: nowBR(),
      }).eq('id', id).select().single();
      if (!error && row) return row;
    } catch {}
  }
  const bases = LS.get('arqia_bases');
  const idx   = bases.findIndex((b: any) => b.id === id);
  if (idx !== -1) {
    bases[idx] = { ...bases[idx], cnpj_cpf: data.cnpjCpf, razao_social: data.razaoSocial,
      nome_fantasia: data.nomeFantasia, proprietario: data.proprietario,
      codigo_cliente: data.codigoCliente, status: data.status || 'Ativo',
      plataforma: data.plataforma || 'N/A', ultima_alteracao: nowBR() };
    LS.set('arqia_bases', bases);
    return bases[idx];
  }
}

export async function dbDeleteBase(id: number) {
  if (supabase) { try { await supabase.from('bases').delete().eq('id', id); return; } catch {} }
  LS.set('arqia_bases', LS.get('arqia_bases').filter((b: any) => b.id !== id));
}

// ── USUÁRIOS ──────────────────────────────────────────────────────────────
export async function dbGetUsuarios(): Promise<any[]> {
  if (supabase) {
    try {
      const { data } = await supabase.from('usuarios').select('id, email, nome, role').order('role', { ascending: false });
      if (data) return data;
    } catch {}
  }
  const users = LS.get('arqia_usuarios');
  const all   = users.length === 0 ? DEFAULT_USERS : users;
  return all.map(({ senha: _s, ...u }: any) => u);
}

export async function dbCreateUsuario(email: string, password: string, role: string) {
  if (supabase) {
    try {
      const { error } = await supabase.from('usuarios').insert({
        email: email.trim().toLowerCase(), senha: password,
        nome: email.split('@')[0], role,
      });
      if (error?.code === '23505') throw new Error('E-mail já cadastrado.');
      if (!error) return;
    } catch (e: any) { throw e; }
  }
  const users = LS.get('arqia_usuarios');
  const all   = users.length === 0 ? [...DEFAULT_USERS] : users;
  if (all.some((u: any) => u.email === email)) throw new Error('E-mail já cadastrado.');
  all.push({ id: Date.now(), email, senha: password, nome: email.split('@')[0], role });
  LS.set('arqia_usuarios', all);
}

export async function dbUpdateUsuarioRole(email: string, role: string) {
  if (supabase) { try { await supabase.from('usuarios').update({ role }).eq('email', email); return; } catch {} }
  LS.set('arqia_usuarios', LS.get('arqia_usuarios').map((u: any) => u.email === email ? { ...u, role } : u));
}

export async function dbDeleteUsuario(email: string) {
  if (supabase) { try { await supabase.from('usuarios').delete().eq('email', email); return; } catch {} }
  LS.set('arqia_usuarios', LS.get('arqia_usuarios').filter((u: any) => u.email !== email));
}
