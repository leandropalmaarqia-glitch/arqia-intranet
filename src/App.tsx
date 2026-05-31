/**
 * App.tsx — Arqia Intranet
 * Modo demo: banco local (localStorage) — funciona no Netlify sem servidor.
 * Modo produção: trocar chamadas de db.ts pelas de api.ts.
 */
import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { Package, Shield, User, BarChart3, Globe, Loader2 } from 'lucide-react';
import {
  dbLogin, dbGetDevices, dbSaveDevices, dbDeleteDevice,
  dbGetBases, dbCreateBase, dbUpdateBase, dbDeleteBase,
  dbGetUsuarios, dbCreateUsuario, dbUpdateUsuarioRole, dbDeleteUsuario,
  hasSupabase,
} from './db';

const containerVariants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};
const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

type Role        = 'ADM' | 'Suporte';
type UserSession = { email: string; name: string; role: Role };

export default function App() {
  // ── Session ───────────────────────────────────────────────────────────────
  const [user,     setUser]     = useState<UserSession | null>(null);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // ── Navigation ────────────────────────────────────────────────────────────
  const [activeView,             setActiveView]             = useState('dashboard');
  const [isDropdownOpen,         setIsDropdownOpen]         = useState(false);
  const [isProfileDropdownOpen,  setIsProfileDropdownOpen]  = useState(false);
  const [showProfileModal,       setShowProfileModal]       = useState(false);

  // ── Devices ───────────────────────────────────────────────────────────────
  const [clients,       setClients]       = useState<any[]>([]);
  const [csvBuffer,     setCsvBuffer]     = useState<any[]>([]);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [importStatus,  setImportStatus]  = useState('');
  const [importLoading, setImportLoading] = useState(false);

  // ── Bases ─────────────────────────────────────────────────────────────────
  const [bases,          setBases]          = useState<any[]>([]);
  const [isBaseModalOpen,setIsBaseModalOpen]= useState(false);
  const [editingBase,    setEditingBase]    = useState<any | null>(null);
  const [baseLoading,    setBaseLoading]    = useState(false);
  const [newBase,        setNewBase]        = useState({ cnpjCpf:'', razaoSocial:'', nomeFantasia:'', proprietario:'', codigoCliente:'' });
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  // ── Usuários ──────────────────────────────────────────────────────────────
  const [registeredUsers,   setRegisteredUsers]   = useState<any[]>([]);
  const [newProfileEmail,   setNewProfileEmail]   = useState('');
  const [newProfilePassword,setNewProfilePassword]= useState('');
  const [addUserError,      setAddUserError]      = useState('');

  const isUserAdmin = user?.role === 'ADM';

  // ── Carrega dados ao logar ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      setClients(await dbGetDevices());
      const bases = await dbGetBases();
      setBases(bases.map(dbBaseToState));
      setRegisteredUsers(await dbGetUsuarios());
    })();
  }, [user]);

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const u = await dbLogin(email, password);
      setUser(u);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const logout = () => {
    setUser(null); setEmail(''); setPassword('');
    setActiveView('dashboard');
    setClients([]); setBases([]); setRegisteredUsers([]);
    setCsvBuffer([]); setImportStatus('');
  };

  // ── CSV / Devices ─────────────────────────────────────────────────────────
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    Papa.parse(e.target.files[0], {
      header: true, skipEmptyLines: true,
      complete: (results: any) => {
        setCsvBuffer(results.data);
        setImportStatus('');
      },
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob(['iccid,imei,cliente,cotacao,simcard\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = 'modelo_dispositivos.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const exportToExcel = () => {
    if (!clients.length) return;
    const ws = XLSX.utils.json_to_sheet(clients);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dispositivos');
    XLSX.writeFile(wb, 'dispositivos.xlsx');
  };

  const handleSaveToDatabase = async () => {
    if (!csvBuffer.length) return;
    setImportLoading(true);
    setImportStatus('');
    try {
      const { inserted, duplicates } = await dbSaveDevices(csvBuffer);
      if (duplicates > 0 && inserted === 0) {
        setImportStatus('duplicados');
      } else if (duplicates > 0) {
        setImportStatus(`sucesso_dup:${inserted}:${duplicates}`);
      } else {
        setImportStatus(`sucesso:${inserted}`);
      }
      setClients(await dbGetDevices());
      setCsvBuffer([]);
    } catch (err: any) {
      setImportStatus('erro');
    } finally {
      setImportLoading(false);
    }
  };

  // ── Bases ─────────────────────────────────────────────────────────────────
  const dbBaseToState = (b: any) => ({
    id:              b.id,
    cnpjCpf:         b.cnpj_cpf        ?? b.cnpjCpf        ?? '',
    razaoSocial:     b.razao_social    ?? b.razaoSocial    ?? '',
    nomeFantasia:    b.nome_fantasia   ?? b.nomeFantasia   ?? '',
    proprietario:    b.proprietario   ?? '',
    codigoCliente:   b.codigo_cliente ?? b.codigoCliente  ?? '',
    status:          b.status         ?? 'Ativo',
    plataforma:      b.plataforma     ?? 'N/A',
    ultimaAlteracao: b.ultima_alteracao ?? b.ultimaAlteracao ?? '',
  });

  const handleSaveBase = async () => {
    setBaseLoading(true);
    try {
      if (editingBase) {
        const updated = await dbUpdateBase(editingBase.id, { ...newBase, status: editingBase.status, plataforma: editingBase.plataforma });
        setBases(bases.map(b => b.id === editingBase.id ? dbBaseToState(updated) : b));
      } else {
        const created = await dbCreateBase(newBase);
        setBases([dbBaseToState(created), ...bases]);
      }
      setNewBase({ cnpjCpf:'', razaoSocial:'', nomeFantasia:'', proprietario:'', codigoCliente:'' });
      setIsBaseModalOpen(false);
      setEditingBase(null);
    } catch (err: any) {
      alert('Erro ao salvar base: ' + err.message);
    } finally {
      setBaseLoading(false);
    }
  };

  const handleDeleteBase = async (id: number) => {
    await dbDeleteBase(id);
    setBases(bases.filter(b => b.id !== id));
    setIsBaseModalOpen(false);
    setEditingBase(null);
  };

  // ── Usuários ──────────────────────────────────────────────────────────────
  const handleAddUser = async () => {
    setAddUserError('');
    if (!newProfileEmail || !newProfilePassword) return;
    try {
      await dbCreateUsuario(newProfileEmail, newProfilePassword, 'Suporte');
      setRegisteredUsers(await dbGetUsuarios());
      setNewProfileEmail(''); setNewProfilePassword('');
    } catch (err: any) { setAddUserError(err.message); }
  };

  const handleToggleRole = async (targetEmail: string, currentRole: Role) => {
    const newRole: Role = currentRole === 'ADM' ? 'Suporte' : 'ADM';
    await dbUpdateUsuarioRole(targetEmail, newRole);
    setRegisteredUsers(await dbGetUsuarios());
  };

  const handleDeleteUser = async (targetEmail: string) => {
    await dbDeleteUsuario(targetEmail);
    setRegisteredUsers(await dbGetUsuarios());
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0A1128] text-white font-sans">
      <AnimatePresence mode="wait">

        {/* ════════════ LOGIN ════════════ */}
        {!user ? (
          <motion.div key="login" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="flex h-screen items-center justify-center p-4"
            style={{ background:'radial-gradient(ellipse at 60% 30%, #0D4F5C 0%, #0A1128 65%)' }}>
            <div className="w-full max-w-md">
              <div className="flex justify-center mb-8">
                <img src="/logo.png" alt="Arqia" className="h-24 w-auto object-contain drop-shadow-[0_0_24px_rgba(0,176,176,0.35)]" />
              </div>
              <form onSubmit={handleLogin} className="w-full p-8 bg-[#0C1635]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                <h1 className="text-2xl font-bold mb-1 text-center tracking-tight">Device <span className="text-[#00D1C1]">Intranet</span></h1>
                <p className="text-center text-sm text-white/40 mb-6">Acesso exclusivo equipe Arqia</p>
                {loginError && (
                  <p className="text-red-400 text-sm mb-4 text-center bg-red-900/20 py-2 rounded-lg border border-red-800/40">{loginError}</p>
                )}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs text-white/50 mb-1 ml-1">E-mail corporativo</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@arqia.com.br"
                      className="w-full bg-[#080E24] border border-white/10 rounded-lg py-2.5 px-4 text-white placeholder-white/30 focus:border-[#00AEEF] outline-none transition-colors" required />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1 ml-1">Senha</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                      className="w-full bg-[#080E24] border border-white/10 rounded-lg py-2.5 px-4 text-white placeholder-white/30 focus:border-[#00AEEF] outline-none transition-colors" required />
                  </div>
                </div>
                <button type="submit"
                  className="w-full py-3 px-4 bg-gradient-to-r from-[#00AEEF] to-[#00D1C1] text-[#0A1128] rounded-lg hover:opacity-90 transition font-bold tracking-wide">
                  Entrar
                </button>
              </form>
            </div>
          </motion.div>

        ) : (
        /* ════════════ PAINEL ════════════ */
          <div className="min-h-screen">

            {/* Navbar */}
            <nav className="flex justify-between items-center px-5 py-2 text-white text-sm relative z-20"
              style={{ background:'linear-gradient(90deg,#0A1B2E 0%,#0D2940 100%)', borderBottom:'1px solid rgba(0,174,239,0.15)' }}>
              <div className="flex items-center gap-6">
                <button onClick={() => setActiveView('dashboard')} className="flex-shrink-0">
                  <img src="/logo.png" alt="Arqia" className="h-8 w-auto object-contain" />
                </button>
                <div className="h-5 w-px bg-white/10" />

                {/* Dropdown Ferramentas */}
                <div className="relative">
                  <button onClick={() => { setIsDropdownOpen(!isDropdownOpen); setIsProfileDropdownOpen(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-white/80 hover:text-white">
                    <span>≡</span><span>Ferramentas</span><span className="text-xs opacity-60">▼</span>
                  </button>
                  <AnimatePresence>
                    {isDropdownOpen && (
                      <motion.div initial={{ opacity:0,y:-8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}
                        className="absolute top-10 left-0 bg-[#0C1635] border border-white/10 rounded-xl shadow-2xl p-2 z-30 w-64">
                        {[
                          { id:'clientes',     icon:User,      label:'Controle de Clientes'  },
                          { id:'importar',     icon:Package,   label:'Importar Dispositivos'  },
                          { id:'base-cliente', icon:BarChart3, label:'Base do Cliente'        },
                        ].map(item => (
                          <div key={item.id} onClick={() => { setActiveView(item.id); setIsDropdownOpen(false); }}
                            className="flex items-center gap-3 p-2.5 hover:bg-white/5 rounded-lg cursor-pointer text-sm text-white/80 hover:text-white transition-colors">
                            <item.icon size={16} className="text-[#00D1C1]" />{item.label}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Perfil */}
              <div className="relative">
                <button onClick={() => { setIsProfileDropdownOpen(!isProfileDropdownOpen); setIsDropdownOpen(false); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00AEEF] to-[#00D1C1] flex items-center justify-center text-[#0A1128] font-bold text-xs">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium leading-none">{user.name}</p>
                    <p className="text-xs text-[#00D1C1] leading-none mt-0.5">{user.role}</p>
                  </div>
                  <span className="text-xs opacity-50 ml-1">▼</span>
                </button>
                <AnimatePresence>
                  {isProfileDropdownOpen && (
                    <motion.div initial={{ opacity:0,y:-8 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0,y:-8 }}
                      className="absolute top-12 right-0 bg-[#0C1635] border border-white/10 rounded-xl shadow-2xl p-2 z-30 w-52">
                      <button onClick={() => { setShowProfileModal(true); setIsProfileDropdownOpen(false); }}
                        className="w-full text-left p-2.5 hover:bg-white/5 rounded-lg text-sm text-white/80 hover:text-white transition-colors">
                        Gerenciar Perfis
                      </button>
                      <div className="border-t border-white/10 my-1" />
                      <button onClick={logout}
                        className="w-full text-left p-2.5 hover:bg-red-900/30 rounded-lg text-sm text-red-400 hover:text-red-300 transition-colors">
                        Sair
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </nav>

            {/* Conteúdo */}
            <main className="p-6">
              <AnimatePresence mode="wait">
                <motion.div key={activeView} variants={containerVariants} initial="hidden" animate="visible" exit="hidden">

                  {activeView !== 'dashboard' && (
                    <motion.div variants={itemVariants} className="mb-6">
                      <h2 className="text-2xl font-bold tracking-tight">
                        {activeView === 'clientes'     && 'Controle de Clientes'}
                        {activeView === 'importar'     && 'Importar Dispositivos'}
                        {activeView === 'base-cliente' && 'Base do Cliente'}
                      </h2>
                    </motion.div>
                  )}

                  {/* ── Dashboard ── */}
                  {activeView === 'dashboard' && (
                    <motion.div variants={itemVariants}>
                      <h2 className="text-3xl font-bold mb-2">Bem-vindo, <span className="text-[#00D1C1]">{user.name}</span>!</h2>
                      <p className="text-white/50 text-sm">Painel de controle — Device Intranet Arqia</p>

                      {/* Aviso de banco não configurado — só para ADM */}
                      {isUserAdmin && !hasSupabase && (
                        <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700/40 rounded-xl">
                          <p className="text-yellow-300 font-semibold text-sm mb-1">⚠️ Banco de dados não configurado</p>
                          <p className="text-yellow-200/70 text-xs leading-relaxed">
                            Os dados estão salvos <strong>apenas no seu navegador</strong>. Outros usuários não conseguem ver as informações.<br/>
                            Para compartilhar dados com toda a equipe, configure o Supabase:
                          </p>
                          <ol className="text-yellow-200/70 text-xs mt-2 ml-4 space-y-1 list-decimal">
                            <li>Acesse <strong>supabase.com</strong> → crie projeto grátis</li>
                            <li>Vá em <strong>SQL Editor</strong> → cole o arquivo <code className="bg-yellow-900/40 px-1 rounded">/supabase/schema.sql</code> → Run</li>
                            <li>Vá em <strong>Project Settings → API</strong> → copie a URL e a chave anon</li>
                            <li>No <strong>Netlify</strong>: Site Settings → Environment Variables → adicione:<br/>
                              <code className="bg-yellow-900/40 px-1 rounded">VITE_SUPABASE_URL</code> e <code className="bg-yellow-900/40 px-1 rounded">VITE_SUPABASE_ANON_KEY</code>
                            </li>
                            <li>Faça redeploy no Netlify — pronto!</li>
                          </ol>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Clientes ── */}
                  {activeView === 'clientes' && (
                    <motion.div variants={itemVariants} className="bg-[#0C1635]/80 p-6 rounded-2xl border border-white/10">
                      <div className="mb-4 flex gap-4">
                        <input type="text" placeholder="Pesquisar (Nome, ICCID ou IMEI)..." value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="flex-grow bg-[#080E24] border border-white/10 rounded-lg py-2 px-4 text-white placeholder-white/30 focus:border-[#00AEEF] outline-none transition-colors" />
                        <button onClick={exportToExcel} disabled={!clients.length}
                          className="bg-[#00D1C1] text-[#0A1128] px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed">
                          Exportar Excel
                        </button>
                      </div>
                      {clients.length === 0 ? (
                        <p className="text-white/40 text-sm py-8 text-center">Nenhum dispositivo. Acesse <strong className="text-white/60">Importar Dispositivos</strong> para carregar um CSV.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-white/20 text-gray-400 text-xs uppercase tracking-wider">
                                <th className="py-3 px-2">ICCID</th><th className="py-3 px-2">IMEI</th>
                                <th className="py-3 px-2">Cliente</th><th className="py-3 px-2">Cotação</th><th className="py-3 px-2">SIM Card</th>
                              </tr>
                            </thead>
                            <tbody className="text-sm">
                              {clients.filter(c =>
                                (c.cliente?.toLowerCase()||'').includes(searchQuery.toLowerCase()) ||
                                (c.iccid||'').includes(searchQuery) || (c.imei||'').includes(searchQuery)
                              ).map((c,i) => (
                                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                  <td className="py-3 px-2 font-mono text-[#00AEEF] text-xs">{c.iccid}</td>
                                  <td className="py-3 px-2 font-mono text-xs">{c.imei}</td>
                                  <td className="py-3 px-2">{c.cliente}</td>
                                  <td className="py-3 px-2 text-white/60">{c.cotacao}</td>
                                  <td className="py-3 px-2"><span className="px-2 py-0.5 bg-[#00AEEF]/10 text-[#00AEEF] rounded text-xs">{c.simcard}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Importar ── */}
                  {activeView === 'importar' && (
                    <motion.div variants={itemVariants} className="bg-[#0C1635]/80 p-6 rounded-2xl border border-white/10">
                      <div className="mb-6 p-4 bg-[#080E24] rounded-lg border border-white/5 flex items-center justify-between">
                        <p className="text-sm text-white/50">Formato: <code className="text-[#00D1C1]">iccid, imei, cliente, cotacao, simcard</code></p>
                        <button onClick={downloadTemplate} className="text-xs text-[#00AEEF] hover:underline ml-4 whitespace-nowrap">Baixar modelo CSV</button>
                      </div>

                      <input type="file" accept=".csv" onChange={handleFileUpload}
                        className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#00AEEF] file:text-[#0A1128] hover:file:bg-[#00D1C1] mb-4 cursor-pointer" />

                      {csvBuffer.length > 0 && (
                        <p className="text-sm text-white/50 mb-4 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
                          📄 {csvBuffer.length} registro(s) prontos para salvar
                        </p>
                      )}

                      {importStatus === 'duplicados' && (
                        <p className="text-sm mb-4 px-4 py-2 rounded-lg bg-yellow-900/20 text-yellow-300 border border-yellow-700/40">
                          ⚠️ Todos os registros já existem no banco.
                        </p>
                      )}
                      {importStatus.startsWith('sucesso_dup:') && (() => {
                        const [,ins,dup] = importStatus.split(':');
                        return <p className="text-sm mb-4 px-4 py-2 rounded-lg bg-[#00D1C1]/10 text-[#00D1C1] border border-[#00D1C1]/20">
                          ✅ Arquivo salvo! {ins} dispositivo(s) gravados. {dup} duplicado(s) ignorados.
                        </p>;
                      })()}
                      {importStatus.startsWith('sucesso:') && (
                        <p className="text-sm mb-4 px-4 py-2 rounded-lg bg-[#00D1C1]/10 text-[#00D1C1] border border-[#00D1C1]/20">
                          ✅ Arquivo salvo com sucesso! {importStatus.split(':')[1]} dispositivo(s) gravados.
                        </p>
                      )}

                      <button onClick={handleSaveToDatabase} disabled={!csvBuffer.length || importLoading}
                        className="w-full py-3 px-4 bg-gradient-to-r from-[#00AEEF] to-[#00D1C1] text-[#0A1128] rounded-lg hover:opacity-90 transition font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        {importLoading && <Loader2 size={16} className="animate-spin" />}
                        {importLoading ? 'Salvando...' : `Salvar (${csvBuffer.length} dispositivos)`}
                      </button>
                    </motion.div>
                  )}

                  {/* ── Base do Cliente ── */}
                  {activeView === 'base-cliente' && (
                    <motion.div variants={itemVariants} className="bg-[#0C1635]/80 p-6 rounded-2xl border border-white/10">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold">Base do Cliente</h2>
                        {isUserAdmin && (
                          <button onClick={() => { setEditingBase(null); setNewBase({ cnpjCpf:'', razaoSocial:'', nomeFantasia:'', proprietario:'', codigoCliente:'' }); setIsBaseModalOpen(true); }}
                            className="bg-gradient-to-r from-[#00AEEF] to-[#00D1C1] text-[#0A1128] px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition text-sm">
                            + Criar Nova Base
                          </button>
                        )}
                      </div>

                      {/* Modal Base */}
                      <AnimatePresence>
                        {isBaseModalOpen && (
                          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <motion.div initial={{ scale:0.9,opacity:0 }} animate={{ scale:1,opacity:1 }} exit={{ scale:0.9,opacity:0 }}
                              className="bg-[#0C1635] p-6 rounded-2xl border border-white/10 w-full max-w-sm">
                              <div className="flex justify-between items-center mb-6">
                                <h4 className="font-semibold text-lg">{editingBase ? 'Editar Base' : 'Nova Base'}</h4>
                                <button onClick={() => setIsBaseModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
                              </div>
                              <div className="space-y-3 mb-6">
                                {[
                                  { k:'cnpjCpf',       p:'CNPJ / CPF'                  },
                                  { k:'razaoSocial',   p:'Razão Social / Nome Completo' },
                                  { k:'nomeFantasia',  p:'Nome Fantasia'                },
                                  { k:'proprietario',  p:'Proprietário'                 },
                                  { k:'codigoCliente', p:'Código do Cliente'            },
                                ].map(f => (
                                  <input key={f.k} type="text" placeholder={f.p} value={(newBase as any)[f.k]}
                                    onChange={e => setNewBase({...newBase,[f.k]:e.target.value})}
                                    className="w-full bg-[#080E24] border border-white/10 rounded-lg py-2 px-4 text-white placeholder-white/30 focus:border-[#00AEEF] outline-none transition-colors" />
                                ))}
                              </div>
                              <div className="flex gap-2">
                                {editingBase && (
                                  <button onClick={() => handleDeleteBase(editingBase.id)}
                                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-semibold transition">Remover</button>
                                )}
                                <button onClick={handleSaveBase} disabled={baseLoading}
                                  className={`${editingBase?'flex-1':'w-full'} bg-gradient-to-r from-[#00AEEF] to-[#00D1C1] text-[#0A1128] py-2 rounded-lg font-semibold hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-70`}>
                                  {baseLoading && <Loader2 size={14} className="animate-spin"/>}
                                  {editingBase ? 'Salvar Alterações' : 'Criar Base'}
                                </button>
                              </div>
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>

                      {/* Lista bases */}
                      <div className="space-y-4">
                        {bases.length === 0 ? (
                          <p className="text-white/40 text-sm py-8 text-center">
                            Nenhuma base cadastrada.{isUserAdmin ? ' Clique em "+ Criar Nova Base" para começar.' : ''}
                          </p>
                        ) : bases.map(base => (
                          <div key={base.id} className="p-4 bg-[#080E24] rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="font-bold text-[#00D1C1]">
                                  {base.codigoCliente && <span className="text-white/40 mr-1">[{base.codigoCliente}]</span>}
                                  {base.razaoSocial}
                                </h3>
                                <p className="text-sm text-white/60 mt-0.5">
                                  {base.cnpjCpf} · <span className={base.status==='Inadimplente'?'text-red-400':'text-green-400'}>{base.status}</span>
                                </p>
                                {base.nomeFantasia && <p className="text-sm mt-0.5"><span className="text-white/40">Fantasia:</span> {base.nomeFantasia}</p>}
                                <p className="text-sm flex items-center gap-1 mt-0.5">
                                  <Globe size={13} className="text-white/40"/>
                                  <span className="text-white/40">Plataforma:</span> {base.plataforma}
                                </p>
                                <p className="text-xs text-white/30 mt-1">
                                  Alterado: {base.ultimaAlteracao} · Proprietário: <strong className="text-white/50">{base.proprietario}</strong>
                                </p>
                              </div>
                              <div className="flex gap-2 flex-shrink-0 ml-4">
                                <button onClick={() => setSelectedClient(p => p===String(base.id)?null:String(base.id))}
                                  className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors">
                                  <Package size={13}/> Dispositivos
                                </button>
                                {isUserAdmin && (
                                  <>
                                    <button onClick={() => { setEditingBase(base); setNewBase({ cnpjCpf:base.cnpjCpf, razaoSocial:base.razaoSocial, nomeFantasia:base.nomeFantasia, proprietario:base.proprietario, codigoCliente:base.codigoCliente }); setIsBaseModalOpen(true); }}
                                      className="bg-[#1a4a8a] hover:bg-[#1e5aaa] text-white px-3 py-1.5 rounded-lg text-xs transition-colors">Config.</button>
                                    <button onClick={() => handleDeleteBase(base.id)}
                                      className="bg-red-800 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs transition-colors">✕</button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Modal Dispositivos */}
                            <AnimatePresence>
                              {selectedClient === String(base.id) && (
                                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                                  <motion.div initial={{ scale:0.9,opacity:0 }} animate={{ scale:1,opacity:1 }} exit={{ scale:0.9,opacity:0 }}
                                    className="bg-[#0C1635] p-6 rounded-2xl border border-white/10 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
                                    <div className="flex justify-between items-center mb-4">
                                      <h4 className="font-semibold text-lg">Dispositivos — {base.razaoSocial}</h4>
                                      <button onClick={() => setSelectedClient(null)} className="text-gray-400 hover:text-white">✕</button>
                                    </div>
                                    <div className="mb-4 flex gap-4">
                                      <input type="text" placeholder="Pesquisar (ICCID ou IMEI)..." value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="flex-grow bg-[#080E24] border border-white/10 rounded-lg py-2 px-4 text-white placeholder-white/30 focus:border-[#00AEEF] outline-none transition-colors" />
                                      <button onClick={exportToExcel} disabled={!clients.length}
                                        className="bg-[#00D1C1] text-[#0A1128] px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-40">Exportar Excel</button>
                                    </div>
                                    {clients.length === 0 ? (
                                      <p className="text-white/40 text-sm text-center py-6">Nenhum dispositivo importado ainda.</p>
                                    ) : (
                                      <table className="w-full text-left text-sm border-collapse">
                                        <thead><tr className="border-b border-white/20 text-gray-400 text-xs uppercase">
                                          <th className="py-2 px-2">ICCID</th><th className="py-2 px-2">IMEI</th>
                                          <th className="py-2 px-2">Cliente</th><th className="py-2 px-2">Cotação</th><th className="py-2 px-2">SIM Card</th>
                                        </tr></thead>
                                        <tbody>
                                          {clients.filter(c=>(c.iccid||'').includes(searchQuery)||(c.imei||'').includes(searchQuery)).map((c,i)=>(
                                            <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                              <td className="py-2 px-2 font-mono text-[#00AEEF] text-xs">{c.iccid}</td>
                                              <td className="py-2 px-2 font-mono text-xs">{c.imei}</td>
                                              <td className="py-2 px-2">{c.cliente}</td>
                                              <td className="py-2 px-2 text-white/60">{c.cotacao}</td>
                                              <td className="py-2 px-2">{c.simcard}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </motion.div>
                                </div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        )}
      </AnimatePresence>

      {/* ── Modal Gerenciar Perfis ── */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ scale:0.9,opacity:0 }} animate={{ scale:1,opacity:1 }} exit={{ scale:0.9,opacity:0 }}
              className="bg-[#0C1635] p-6 rounded-2xl border border-white/10 w-full max-w-sm">
              <div className="flex justify-between items-center mb-6">
                <h4 className="font-semibold text-lg">Gerenciar Perfis</h4>
                <button onClick={() => { setShowProfileModal(false); setAddUserError(''); }} className="text-gray-400 hover:text-white">✕</button>
              </div>

              {isUserAdmin && (
                <div className="space-y-3 mb-6 pb-6 border-b border-white/10">
                  <p className="text-xs text-white/40 uppercase tracking-wider">Novo usuário</p>
                  <input type="email" placeholder="E-mail" value={newProfileEmail} onChange={e => setNewProfileEmail(e.target.value)}
                    className="w-full bg-[#080E24] border border-white/10 rounded-lg py-2 px-4 text-white placeholder-white/30 focus:border-[#00AEEF] outline-none transition-colors" />
                  <input type="password" placeholder="Senha" value={newProfilePassword} onChange={e => setNewProfilePassword(e.target.value)}
                    className="w-full bg-[#080E24] border border-white/10 rounded-lg py-2 px-4 text-white placeholder-white/30 focus:border-[#00AEEF] outline-none transition-colors" />
                  {addUserError && (
                    <p className="text-xs text-red-400 bg-red-900/20 px-3 py-1.5 rounded-lg border border-red-800/40">{addUserError}</p>
                  )}
                  <button onClick={handleAddUser}
                    className="w-full bg-gradient-to-r from-[#00AEEF] to-[#00D1C1] text-[#0A1128] py-2 rounded-lg font-semibold hover:opacity-90 transition">
                    Adicionar Usuário
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-3">Usuários Cadastrados</p>
                {(isUserAdmin ? registeredUsers : registeredUsers.filter(u => u.email===user?.email)).map((u:any) => (
                  <motion.div key={u.email} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
                    className="flex items-center gap-3 bg-[#080E24] p-3 rounded-xl border border-white/5">
                    <div className={`p-1.5 rounded-full ${u.role==='ADM'?'bg-[#00AEEF]/20':'bg-white/5'}`}>
                      {u.role==='ADM' ? <Shield size={16} className="text-[#00AEEF]"/> : <User size={16} className="text-gray-400"/>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.email}</p>
                      {isUserAdmin ? (
                        <button onClick={() => handleToggleRole(u.email, u.role)}
                          className={`text-xs font-semibold uppercase tracking-wider ${u.role==='ADM'?'text-[#00AEEF]':'text-gray-500 hover:text-gray-300'} transition-colors`}>
                          {u.role} ⇄
                        </button>
                      ) : <p className="text-xs text-gray-500 uppercase">{u.role}</p>}
                    </div>
                    {isUserAdmin && u.email!==user?.email && (
                      <button onClick={() => handleDeleteUser(u.email)} className="text-gray-500 hover:text-red-400 transition-colors">✕</button>
                    )}
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
