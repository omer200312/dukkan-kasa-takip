import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Banknote, BarChart3, CalendarDays, CheckCircle2,
  ChevronRight, CircleUserRound, Cloud, CreditCard, Download, FileUp, LayoutDashboard,
  LoaderCircle, LogOut, Menu, Plus, ReceiptText, Search, ShieldCheck, ShoppingBag,
  Smartphone, Trash2, TrendingUp, WalletCards, X, Calculator, Percent, Building2,
  Printer, FileText, Pencil, Save,
} from 'lucide-react'
import { supabase } from './supabase.js'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const LOCAL_RECORDS_KEY = 'dukkan-kasa-shared-v1'
const CLOUD_MIGRATION_KEY = 'dukkan-kasa-cloud-migrated-v1'
const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1
const POS_COMMISSION_RATE = 0.03

const money = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0)
const shortMoney = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value) || 0)
const localDate = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const displayDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
const normalizeUsername = value => value.trim().toLowerCase()
const usernameEmail = username => `${normalizeUsername(username)}@dukkan-kasa.local`
const isUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value))

function mapRow(row) {
  return {
    id: row.id, date: row.record_date, description: row.description || '', cash: Number(row.cash) || 0,
    pos: Number(row.pos) || 0, pos1: Number(row.pos_one_percent) || 0, online: Number(row.online) || 0,
    expenseItem: row.expense_item || '', expense: Number(row.expense) || 0, note: row.note || '',
    createdAt: new Date(row.created_at).getTime(),
  }
}

function toRow(record) {
  return {
    id: isUuid(record.id) ? record.id : crypto.randomUUID(), record_date: record.date,
    description: String(record.description || '').slice(0, 80), cash: Number(record.cash) || 0,
    pos: Number(record.pos) || 0, pos_one_percent: Number(record.pos1) || 0,
    online: Number(record.online) || 0, expense_item: String(record.expenseItem || '').slice(0, 80),
    expense: Number(record.expense) || 0, note: String(record.note || '').slice(0, 120),
  }
}

function totals(list) {
  return list.reduce((sum, item) => ({
    cash: sum.cash + item.cash, pos: sum.pos + item.pos, pos1: sum.pos1 + item.pos1,
    online: sum.online + item.online, expense: sum.expense + item.expense,
    posCommission: sum.posCommission + (item.pos + item.pos1) * POS_COMMISSION_RATE,
  }), { cash: 0, pos: 0, pos1: 0, online: 0, expense: 0, posCommission: 0 })
}

const revenueOf = record => record.cash + record.pos + record.pos1 + record.online
const posCommissionOf = record => (record.pos + record.pos1) * POS_COMMISSION_RATE
const netOf = record => revenueOf(record) - record.expense - posCommissionOf(record)
const download = (name, text, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [toast, setToast] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const toastTimer = useRef(null)

  const notify = useCallback(message => {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2800)
  }, [])

  const loadRecords = useCallback(async ({ quiet = false } = {}) => {
    const { data, error } = await supabase.from('cash_records').select('*')
      .order('record_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error
    setRecords((data || []).map(mapRow))
    if (!quiet) notify('Ortak kasa güncellendi.')
  }, [notify])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setSession(data.session); setAuthReady(true) }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => { active = false; listener.subscription.unsubscribe(); clearTimeout(toastTimer.current) }
  }, [])

  useEffect(() => {
    if (!session?.user) { setRecords([]); return undefined }
    let disposed = false
    const start = async () => {
      setLoading(true)
      try {
        if (!localStorage.getItem(CLOUD_MIGRATION_KEY)) {
          let local = []
          try { local = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]') } catch { local = [] }
          if (Array.isArray(local) && local.length) {
            const { error } = await supabase.from('cash_records').upsert(local.map(toRow), { onConflict: 'id', ignoreDuplicates: true })
            if (error) throw error
            notify(`${local.length} yerel kayıt ortak kasaya aktarıldı.`)
          }
          localStorage.setItem(CLOUD_MIGRATION_KEY, '1')
        }
        if (!disposed) await loadRecords({ quiet: true })
      } catch (error) {
        console.error(error)
        notify('Çevrim içi kasaya bağlanılamadı. İnternetinizi kontrol edin.')
      } finally { if (!disposed) setLoading(false) }
    }
    start()
    const channel = supabase.channel('ortak-kasa-react').on(
      'postgres_changes', { event: '*', schema: 'public', table: 'cash_records' },
      () => loadRecords({ quiet: true }).catch(console.error),
    ).subscribe()
    return () => { disposed = true; supabase.removeChannel(channel) }
  }, [session?.user?.id, loadRecords, notify])

  const go = next => { setPage(next); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  if (!authReady) return <FullLoader />
  if (!session) return <Login onSuccess={() => notify('Giriş başarılı. Ortak kasa açıldı.')} />

  const username = session.user.email?.split('@')[0] || 'kullanıcı'
  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar page={page} go={go} username={username} />
      <MobileHeader onMenu={() => setMobileMenu(true)} username={username} />
      {mobileMenu && <MobileDrawer page={page} go={go} close={() => setMobileMenu(false)} username={username} />}
      <main className="mx-auto min-h-screen max-w-[1600px] px-4 pb-28 pt-6 md:px-7 lg:ml-[260px] lg:px-10 lg:pb-12 lg:pt-8">
        {page === 'dashboard' && <Dashboard records={records} go={go} />}
        {page === 'transactions' && <Transactions records={records} loading={loading} setLoading={setLoading} reload={loadRecords} notify={notify} />}
        {page === 'reports' && <Reports records={records} loading={loading} setLoading={setLoading} reload={loadRecords} notify={notify} />}
        {page === 'vat' && <VatCalculator loading={loading} setLoading={setLoading} notify={notify} />}
        {page === 'print' && <PrintCenter records={records} notify={notify} />}
      </main>
      <BottomNav page={page} go={go} />
      {loading && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/15 backdrop-blur-[1px]"><div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 font-semibold shadow-2xl"><LoaderCircle className="animate-spin text-emerald-500" /> İşlem yapılıyor...</div></div>}
      {toast && <div role="status" className="toast-in fixed bottom-24 left-1/2 z-[80] flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white shadow-2xl lg:bottom-8"><CheckCircle2 className="shrink-0 text-emerald-400" size={20} />{toast}</div>}
    </div>
  )
}

function FullLoader() {
  return <div className="grid min-h-screen place-items-center bg-slate-950 text-white"><div className="text-center"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-emerald-500"><Banknote /></div><LoaderCircle className="mx-auto animate-spin text-emerald-400" /><p className="mt-3 text-sm text-slate-400">Kasa hazırlanıyor</p></div></div>
}

function Login({ onSuccess }) {
  const [username, setUsername] = useState('omerfaruk')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault()
    const clean = normalizeUsername(username)
    if (!/^[a-z0-9._-]{3,30}$/.test(clean)) return setError('Geçerli bir kullanıcı adı girin.')
    if (password.length < 6) return setError('Şifre en az 6 karakter olmalıdır.')
    setBusy(true); setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: usernameEmail(clean), password })
    setBusy(false)
    if (authError || !data.user) return setError('Kullanıcı adı veya şifre hatalı.')
    onSuccess()
  }
  return (
    <div className="relative grid min-h-screen overflow-hidden bg-slate-950 lg:grid-cols-[1.1fr_.9fr]">
      <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,#10b981_0,transparent_30%),radial-gradient(circle_at_80%_80%,#2563eb_0,transparent_30%)]" />
      <section className="relative hidden flex-col justify-between p-14 lg:flex xl:p-20">
        <Brand light />
        <div className="max-w-xl"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-300"><Cloud size={17} /> Tüm cihazlarda aynı ortak kasa</div><h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight text-white xl:text-6xl">Dükkânınızın nabzı,<br /><span className="text-emerald-400">tek ekranda.</span></h1><p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">Günlük gelirleri, gider kalemlerini ve aylık performansı sade bir panelden takip edin.</p></div>
        <div className="flex gap-7 text-sm text-slate-400"><span className="flex items-center gap-2"><ShieldCheck className="text-emerald-400" size={18} /> Güvenli giriş</span><span className="flex items-center gap-2"><Smartphone className="text-emerald-400" size={18} /> Mobil uyumlu</span></div>
      </section>
      <section className="relative flex min-h-screen items-center justify-center px-5 py-10 lg:bg-white lg:px-12">
        <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl shadow-black/25 sm:p-9 lg:shadow-none">
          <div className="mb-9 lg:hidden"><Brand /></div>
          <p className="eyebrow">HOŞ GELDİNİZ</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Kasaya giriş yapın</h2><p className="mt-3 text-sm leading-6 text-slate-500">Ortak kayıtlarınıza ulaşmak için bilgilerinizi girin.</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <Field label="Kullanıcı adı"><div className="relative"><CircleUserRound className="absolute left-3.5 top-3.5 text-slate-400" size={20} /><input className="field pl-11" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Kullanıcı adınız" /></div></Field>
            <Field label="Şifre"><div className="relative"><ShieldCheck className="absolute left-3.5 top-3.5 text-slate-400" size={20} /><input className="field px-11" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Şifreniz" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-2.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100">{showPassword ? 'Gizle' : 'Göster'}</button></div></Field>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
            <button disabled={busy} className="btn-primary w-full">{busy ? <LoaderCircle className="animate-spin" /> : <><span>Giriş Yap</span><ChevronRight size={19} /></>}</button>
          </form>
          <div className="mt-7 flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500"><Cloud className="mt-0.5 shrink-0 text-emerald-500" size={18} /> Giriş yapan bütün kullanıcılar aynı çevrim içi kasa kayıtlarını görür.</div>
        </div>
      </section>
    </div>
  )
}

function Brand({ light = false }) {
  return <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-emerald-500 text-xl font-black text-white shadow-lg shadow-emerald-500/20">₺</div><div><strong className={`block text-base font-extrabold ${light ? 'text-white' : 'text-slate-900'}`}>Dükkan Kasa</strong><small className={light ? 'text-slate-400' : 'text-slate-500'}>Gelir • Gider • Ciro</small></div></div>
}

const navItems = [
  { id: 'dashboard', label: 'Ana Menü', icon: LayoutDashboard },
  { id: 'transactions', label: 'Günlük İşlemler', icon: ReceiptText },
  { id: 'reports', label: 'Aylık Rapor', icon: BarChart3 },
  { id: 'vat', label: 'KDV Hesaplama', icon: Calculator },
  { id: 'print', label: 'Çıktı Merkezi', icon: Printer },
]

function Sidebar({ page, go, username }) {
  return <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col bg-slate-950 p-5 text-white lg:flex"><div className="px-2 py-2"><Brand light /></div><nav className="mt-9 flex-1 space-y-2">{navItems.map(item => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => go(item.id)} />)}</nav><div className="rounded-2xl border border-slate-800 bg-slate-900 p-3"><div className="mb-3 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 font-bold uppercase text-emerald-400">{username[0]}</div><div className="min-w-0"><strong className="block truncate text-sm">{username}</strong><small className="flex items-center gap-1 text-slate-400"><i className="size-1.5 rounded-full bg-emerald-400" /> Ortak kasa aktif</small></div></div><button onClick={() => confirm('Oturumu kapatmak istiyor musunuz?') && supabase.auth.signOut()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800"><LogOut size={15} /> Çıkış yap</button></div></aside>
}

function NavButton({ item, active, onClick }) { const Icon = item.icon; return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}><Icon size={20} />{item.label}</button> }
function MobileHeader({ onMenu, username }) { return <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:hidden"><Brand /><button onClick={onMenu} aria-label="Menüyü aç" className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-700"><Menu /></button><span className="sr-only">{username}</span></header> }
function MobileDrawer({ page, go, close, username }) { return <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Menüyü kapat" onClick={close} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" /><aside className="absolute inset-y-0 right-0 w-[min(86vw,340px)] bg-slate-950 p-5 text-white shadow-2xl"><div className="flex items-center justify-between"><Brand light /><button onClick={close} className="grid size-10 place-items-center rounded-xl bg-slate-800"><X /></button></div><nav className="mt-9 space-y-2">{navItems.map(item => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => go(item.id)} />)}</nav><div className="absolute bottom-6 left-5 right-5"><p className="mb-3 text-sm text-slate-400">Giriş yapan: <strong className="text-white">{username}</strong></p><button onClick={() => confirm('Oturumu kapatmak istiyor musunuz?') && supabase.auth.signOut()} className="btn-secondary w-full border-slate-700 bg-slate-900 text-slate-200"><LogOut size={17} /> Çıkış yap</button></div></aside></div> }
function BottomNav({ page, go }) { return <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,.06)] backdrop-blur lg:hidden">{navItems.map(item => { const Icon = item.icon; const active = page === item.id; const shortLabel = item.id === 'transactions' ? 'İşlemler' : item.id === 'reports' ? 'Rapor' : item.id === 'vat' ? 'KDV' : item.id === 'print' ? 'Çıktı' : item.label; return <button key={item.id} onClick={() => go(item.id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[9px] font-bold sm:text-[10px] ${active ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}><Icon size={19} />{shortLabel}</button> })}</nav> }

function PageHeading({ eyebrow, title, description, children }) { return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{children}</div> }
function Field({ label, children, className = '' }) { return <label className={className}><span className="field-label">{label}</span>{children}</label> }

function Dashboard({ records, go }) {
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const list = useMemo(() => records.filter(r => { const [y, m] = r.date.split('-').map(Number); return y === Number(year) && m === Number(month) }), [records, year, month])
  const sum = totals(list), revenue = sum.cash + sum.pos + sum.pos1 + sum.online, net = revenue - sum.expense - sum.posCommission
  const latest = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5)
  const payments = [{ label: 'Nakit', value: sum.cash, color: 'bg-emerald-500', icon: Banknote }, { label: 'POS / Kart', value: sum.pos, color: 'bg-blue-500', icon: CreditCard }, { label: 'POS %1', value: sum.pos1, color: 'bg-violet-500', icon: WalletCards }, { label: 'Yemek kartı / Online', value: sum.online, color: 'bg-amber-500', icon: Smartphone }]
  return <>
    <PageHeading eyebrow="GENEL DURUM" title="Kasa kontrol paneli" description="Gelir, gider ve net kasanızı tek bakışta takip edin."><div className="grid grid-cols-2 gap-2"><select aria-label="Yıl" className="field w-28" value={year} onChange={e => setYear(e.target.value)}>{[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y}>{y}</option>)}</select><select aria-label="Ay" className="field w-32" value={month} onChange={e => setMonth(e.target.value)}>{MONTHS.map((m, i) => <option value={i + 1} key={m}>{m}</option>)}</select></div></PageHeading>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Kpi title="Toplam Ciro" value={money(revenue)} note="Tüm gelir kanalları" icon={TrendingUp} tone="emerald" />
      <Kpi title="Toplam Gider" value={money(sum.expense)} note="Gider kalemleri toplamı" icon={ArrowDownRight} tone="red" />
      <Kpi title="POS Komisyonu" value={money(sum.posCommission)} note="Kart işlemlerinin %3'ü" icon={Percent} tone="violet" />
      <Kpi title="Net Kasa" value={money(net)} note="Ciro − gider − komisyon" icon={net >= 0 ? ArrowUpRight : ArrowDownRight} tone={net >= 0 ? 'blue' : 'red'} />
      <Kpi title="İşlem Sayısı" value={list.length} note="Seçili ay kayıtları" icon={ReceiptText} tone="violet" />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <section className="panel p-5 sm:p-6"><PanelTitle eyebrow="ÖDEME DAĞILIMI" title="Gelir kanalları" /><div className="mt-6 space-y-5">{payments.map(item => { const Icon = item.icon; const percentage = revenue ? Math.round(item.value / revenue * 100) : 0; return <div key={item.label}><div className="mb-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Icon size={17} className="text-slate-400" />{item.label}</span><span className="text-right"><strong className="text-sm text-slate-900">{money(item.value)}</strong><small className="ml-2 text-slate-400">%{percentage}</small></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${percentage}%` }} /></div></div> })}</div></section>
      <section className="panel p-5 sm:p-6"><PanelTitle eyebrow="SON HAREKETLER" title="En son kayıtlar"><button onClick={() => go('transactions')} className="text-sm font-bold text-emerald-600">Tümünü gör</button></PanelTitle><div className="mt-4 divide-y divide-slate-100">{latest.length ? latest.map(r => { const netRecord = netOf(r); return <div key={r.id} className="flex items-center gap-3 py-3.5"><div className={`grid size-10 shrink-0 place-items-center rounded-xl ${netRecord >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{netRecord >= 0 ? <ArrowUpRight size={19} /> : <ArrowDownRight size={19} />}</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{r.description || r.expenseItem || 'İşlem'}</strong><small className="text-slate-400">{displayDate(r.date)}</small></div><strong className={`text-sm ${netRecord >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{netRecord > 0 ? '+' : ''}{money(netRecord)}</strong></div> }) : <Empty text="Bu ay için henüz kayıt yok." />}</div></section>
    </div>
  </>
}

function Kpi({ title, value, note, icon: Icon, tone }) { const tones = { emerald: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-500', blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600' }; return <article className="panel p-5"><div className="flex items-start justify-between"><span className="text-sm font-semibold text-slate-500">{title}</span><div className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={20} /></div></div><strong className="mt-4 block text-2xl font-extrabold tracking-tight text-slate-950">{value}</strong><small className="mt-1 block text-xs text-slate-400">{note}</small></article> }
function PanelTitle({ eyebrow, title, children }) { return <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{title}</h2></div>{children}</div> }
function Empty({ text }) { return <div className="py-10 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ReceiptText /></div><p className="text-sm text-slate-400">{text}</p></div> }

function Transactions({ records, loading, setLoading, reload, notify }) {
  const initial = { date: localDate(), description: '', cash: '', pos: '', pos1: '', online: '', expenseItem: '', expense: '', note: '' }
  const [form, setForm] = useState(initial)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const formRef = useRef(null)
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const num = key => Number(form[key]) || 0
  const formRevenue = num('cash') + num('pos') + num('pos1') + num('online')
  const formPosCommission = (num('pos') + num('pos1')) * POS_COMMISSION_RATE
  const formNet = formRevenue - num('expense') - formPosCommission
  const filtered = useMemo(() => records.filter(r => !search || [r.date, r.description, r.expenseItem, r.note].join(' ').toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))), [records, search])
  const resetForm = (date = localDate()) => {
    setEditingId(null)
    setForm({ ...initial, date })
  }
  const startEdit = record => {
    setEditingId(record.id)
    setForm({
      date: record.date,
      description: record.description,
      cash: record.cash || '',
      pos: record.pos || '',
      pos1: record.pos1 || '',
      online: record.online || '',
      expenseItem: record.expenseItem,
      expense: record.expense || '',
      note: record.note,
    })
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const submit = async event => {
    event.preventDefault()
    if (formRevenue + num('expense') <= 0) return notify('En az bir tutar girin.')
    if (num('expense') > 0 && !form.expenseItem.trim()) return notify('Lütfen gider kalemini yazın.')
    setLoading(true)
    try {
      const row = toRow({ ...form, id: editingId || crypto.randomUUID(), expense: num('expense') })
      const { id, ...changes } = row
      const request = editingId
        ? supabase.from('cash_records').update(changes).eq('id', editingId).select('id').single()
        : supabase.from('cash_records').insert(row).select('id').single()
      const { error } = await request
      if (error) throw error
      const wasEditing = Boolean(editingId)
      resetForm(form.date)
      await reload({ quiet: true }); notify(wasEditing ? 'Kasa kaydı güncellendi.' : 'İşlem ortak kasaya kaydedildi.')
    } catch (error) { console.error(error); notify(editingId ? 'Kayıt güncellenemedi.' : 'Kayıt eklenemedi. Bağlantınızı kontrol edin.') } finally { setLoading(false) }
  }
  const remove = async id => {
    if (!confirm('Bu kaydı ortak kasadan silmek istediğinize emin misiniz?')) return
    setLoading(true)
    try { const { error } = await supabase.from('cash_records').delete().eq('id', id).select('id').single(); if (error) throw error; if (editingId === id) resetForm(); await reload({ quiet: true }); notify('Kayıt silindi.') }
    catch (error) { console.error(error); notify('Kayıt silinemedi.') } finally { setLoading(false) }
  }
  const exportCsv = () => {
    const rows = [['Tarih', 'Açıklama', 'Nakit', 'POS / Kart', 'POS %1', 'Yemek Kartı / Online', 'POS Komisyonu (%3)', 'Gider Kalemi', 'Gider', 'Net Kasa', 'Not'], ...records.map(r => [r.date, r.description, r.cash, r.pos, r.pos1, r.online, posCommissionOf(r), r.expenseItem, r.expense, netOf(r), r.note])]
    download('dukkan-kasa-kayitlari.csv', '\ufeff' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8')
    notify('CSV dosyası indirildi.')
  }
  return <>
    <PageHeading eyebrow="GÜNLÜK KAYIT" title={editingId ? 'Kasa kaydını düzenle' : 'Yeni işlem ekle'} description={editingId ? 'Seçtiğiniz kaydın bilgilerini değiştirip yeniden kaydedin.' : 'Gelir ve giderleri ayrı ayrı, açıklamasıyla kaydedin.'} />
    <form ref={formRef} onSubmit={submit} className={`panel scroll-mt-5 overflow-hidden ${editingId ? 'ring-2 ring-emerald-400/40' : ''}`}>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        <Field label="Tarih"><input className="field" type="date" required value={form.date} onChange={e => set('date', e.target.value)} /></Field>
        <Field label="Açıklama / Gelir kalemi" className="sm:col-span-1 xl:col-span-3"><input className="field" maxLength="80" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Örn. Günlük satış" /></Field>
        <AmountField label="Nakit" icon={Banknote} value={form.cash} onChange={v => set('cash', v)} />
        <AmountField label="POS / Kart" icon={CreditCard} value={form.pos} onChange={v => set('pos', v)} />
        <AmountField label="POS %1" icon={WalletCards} value={form.pos1} onChange={v => set('pos1', v)} />
        <AmountField label="Yemek kartı / Online" icon={Smartphone} value={form.online} onChange={v => set('online', v)} />
        <Field label="Gider kalemi" className="sm:col-span-1 xl:col-span-2"><input className="field border-red-100 bg-red-50/40 focus:border-red-400 focus:ring-red-400/10" maxLength="80" value={form.expenseItem} onChange={e => set('expenseItem', e.target.value)} placeholder="Örn. Elektrik, kira, mal alımı" /></Field>
        <AmountField label="Gider tutarı" icon={ArrowDownRight} value={form.expense} onChange={v => set('expense', v)} expense />
        <Field label="Not"><input className="field" maxLength="120" value={form.note} onChange={e => set('note', e.target.value)} placeholder="İsteğe bağlı" /></Field>
      </div>
      <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex flex-wrap gap-7"><span><small className="block text-xs text-slate-400">Toplam ciro</small><strong className="text-base text-emerald-600">{money(formRevenue)}</strong></span><span><small className="block text-xs text-slate-400">POS komisyonu (%3)</small><strong className="text-base text-violet-600">−{money(formPosCommission)}</strong></span><span><small className="block text-xs text-slate-400">Net kasa</small><strong className={formNet >= 0 ? 'text-blue-600' : 'text-red-500'}>{money(formNet)}</strong></span></div><div className="flex w-full gap-2 sm:w-auto">{editingId && <button type="button" disabled={loading} onClick={() => resetForm()} className="btn-secondary flex-1 sm:flex-none"><X size={18} /> Vazgeç</button>}<button type="submit" disabled={loading} className="btn-primary flex-1 sm:flex-none">{editingId ? <Save size={19} /> : <Plus size={19} />} {editingId ? 'Değişiklikleri Kaydet' : 'İşlemi Kaydet'}</button></div></div>
    </form>
    <section className="panel mt-5 overflow-hidden"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"><PanelTitle eyebrow="KAYITLAR" title="İşlem geçmişi" /><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="field h-11 pl-10" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Kayıtlarda ara" /></div><button type="button" onClick={exportCsv} className="btn-secondary shrink-0"><Download size={17} /><span className="hidden sm:inline">CSV indir</span></button></div></div>
      <div className="divide-y divide-slate-100 md:hidden">{filtered.length ? filtered.map(r => <TransactionCard key={r.id} record={r} edit={startEdit} remove={remove} />) : <Empty text="Henüz işlem kaydı bulunmuyor." />}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><Th>Tarih</Th><Th>Açıklama</Th><Th right>Ciro</Th><Th right>POS Kesinti</Th><Th>Gider kalemi</Th><Th right>Gider</Th><Th right>Net</Th><Th right>İşlemler</Th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.length ? filtered.map(r => <TransactionRow key={r.id} record={r} edit={startEdit} remove={remove} />) : <tr><td colSpan="8"><Empty text="Henüz işlem kaydı bulunmuyor." /></td></tr>}</tbody></table></div>
    </section>
  </>
}

function AmountField({ label, icon: Icon, value, onChange, expense = false }) { return <Field label={label}><div className="relative"><Icon className={`absolute left-3.5 top-3.5 ${expense ? 'text-red-400' : 'text-slate-400'}`} size={19} /><input className={`field pl-11 ${expense ? 'border-red-100 bg-red-50/40 focus:border-red-400 focus:ring-red-400/10' : ''}`} inputMode="decimal" type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder="0,00" /></div></Field> }
function Th({ children, right = false }) { return <th className={`px-5 py-3.5 font-bold ${right ? 'text-right' : ''}`}>{children}</th> }
function TransactionRow({ record: r, edit, remove }) { const revenue = revenueOf(r), commission = posCommissionOf(r), net = netOf(r); return <tr className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{displayDate(r.date)}</td><td className="max-w-[230px] px-5 py-4"><strong className="block truncate text-slate-800">{r.description || '—'}</strong>{r.note && <small className="block truncate text-slate-400">{r.note}</small>}</td><td className="px-5 py-4 text-right font-bold text-emerald-600">{money(revenue)}</td><td className="px-5 py-4 text-right font-semibold text-violet-600">−{money(commission)}</td><td className="px-5 py-4 text-slate-600">{r.expenseItem || '—'}</td><td className="px-5 py-4 text-right font-semibold text-red-500">{money(r.expense)}</td><td className={`px-5 py-4 text-right font-bold ${net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{money(net)}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" aria-label="Kaydı düzenle" title="Düzenle" onClick={() => edit(r)} className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"><Pencil size={17} /></button><button type="button" aria-label="Kaydı sil" title="Sil" onClick={() => remove(r.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 size={17} /></button></div></td></tr> }
function TransactionCard({ record: r, edit, remove }) { const revenue = revenueOf(r), commission = posCommissionOf(r), net = netOf(r); return <article className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{r.description || r.expenseItem || 'İşlem'}</strong><small className="mt-1 flex items-center gap-1 text-slate-400"><CalendarDays size={13} />{displayDate(r.date)}</small></div><div className="flex gap-1"><button type="button" aria-label="Kaydı düzenle" onClick={() => edit(r)} className="rounded-lg bg-blue-50 p-2 text-blue-600"><Pencil size={17} /></button><button type="button" aria-label="Kaydı sil" onClick={() => remove(r.id)} className="rounded-lg bg-red-50 p-2 text-red-500"><Trash2 size={17} /></button></div></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-center sm:grid-cols-4"><span><small className="block text-[10px] uppercase text-slate-400">Ciro</small><strong className="text-xs text-emerald-600">{shortMoney(revenue)}</strong></span><span><small className="block text-[10px] uppercase text-slate-400">POS Kesinti</small><strong className="text-xs text-violet-600">−{shortMoney(commission)}</strong></span><span><small className="block text-[10px] uppercase text-slate-400">Gider</small><strong className="text-xs text-red-500">{shortMoney(r.expense)}</strong></span><span><small className="block text-[10px] uppercase text-slate-400">Net</small><strong className={`text-xs ${net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{shortMoney(net)}</strong></span></div>{(r.expenseItem || r.note) && <p className="mt-3 text-xs leading-5 text-slate-500">{r.expenseItem && <><strong>Gider:</strong> {r.expenseItem} </>}{r.note && <>• {r.note}</>}</p>}</article> }

function Reports({ records, loading, setLoading, reload, notify }) {
  const [year, setYear] = useState(currentYear)
  const restoreInput = useRef(null)
  const rows = MONTHS.map((name, index) => { const sum = totals(records.filter(r => { const [y, m] = r.date.split('-').map(Number); return y === Number(year) && m === index + 1 })); const revenue = sum.cash + sum.pos + sum.pos1 + sum.online; return { name, ...sum, revenue, net: revenue - sum.expense - sum.posCommission } })
  const annual = rows.reduce((a, r) => ({ cash: a.cash + r.cash, pos: a.pos + r.pos, pos1: a.pos1 + r.pos1, online: a.online + r.online, revenue: a.revenue + r.revenue, posCommission: a.posCommission + r.posCommission, expense: a.expense + r.expense, net: a.net + r.net }), { cash: 0, pos: 0, pos1: 0, online: 0, revenue: 0, posCommission: 0, expense: 0, net: 0 })
  const backup = () => { download(`dukkan-kasa-yedek-${localDate()}.json`, JSON.stringify({ version: 2, source: 'supabase', exportedAt: new Date().toISOString(), records }, null, 2), 'application/json'); notify('JSON yedeği indirildi.') }
  const restore = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!Array.isArray(data.records)) throw new Error('Geçersiz yedek')
      if (!confirm(`Yedekte ${data.records.length} kayıt var. Ortak kasadaki kayıtların üzerine yazılsın mı?`)) return
      setLoading(true)
      const { error: deleteError } = await supabase.from('cash_records').delete().not('id', 'is', null)
      if (deleteError) throw deleteError
      if (data.records.length) { const { error } = await supabase.from('cash_records').insert(data.records.map(toRow)); if (error) throw error }
      await reload({ quiet: true }); notify('Yedek ortak kasaya yüklendi.')
    } catch (error) { console.error(error); notify('Yedek yüklenemedi. Geçerli bir dosya seçin.') } finally { setLoading(false); event.target.value = '' }
  }
  return <>
    <PageHeading eyebrow="YILLIK BAKIŞ" title="Aylık rapor" description="Yıl boyunca ciro, gider ve net kasa performansını karşılaştırın."><Field label="Rapor yılı"><input className="field w-32" type="number" min="2020" max="2100" value={year} onChange={e => setYear(e.target.value)} /></Field></PageHeading>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Kpi title="Yıllık Ciro" value={money(annual.revenue)} note={`${year} brüt toplamı`} icon={TrendingUp} tone="emerald" /><Kpi title="POS Komisyonu" value={money(annual.posCommission)} note="Kart işlemlerinin %3'ü" icon={Percent} tone="violet" /><Kpi title="Yıllık Gider" value={money(annual.expense)} note={`${year} toplamı`} icon={ArrowDownRight} tone="red" /><Kpi title="Yıllık Net" value={money(annual.net)} note="Ciro − gider − komisyon" icon={annual.net >= 0 ? ArrowUpRight : ArrowDownRight} tone={annual.net >= 0 ? 'blue' : 'red'} /></div>
    <section className="panel overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><Th>Ay</Th><Th right>Nakit</Th><Th right>POS / Kart</Th><Th right>POS %1</Th><Th right>Online</Th><Th right>Toplam Ciro</Th><Th right>POS Kesinti</Th><Th right>Gider</Th><Th right>Net Kasa</Th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(r => <ReportRow key={r.name} row={r} />)}</tbody><tfoot className="bg-slate-950 font-bold text-white"><ReportRow row={{ name: 'YIL TOPLAMI', ...annual }} total /></tfoot></table></div></section>
    <section className="mt-5 flex flex-col gap-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-7"><div className="flex gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-400"><Cloud /></div><div><h2 className="font-extrabold">Çevrim içi ve güvende</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">Kayıtlar Supabase üzerinde tutulur ve tüm cihazlarda ortak görünür. Ek olarak JSON yedeği alabilirsiniz.</p></div></div><div className="flex shrink-0 flex-col gap-2 sm:flex-row"><button disabled={loading} onClick={() => restoreInput.current?.click()} className="btn-secondary border-slate-600 bg-slate-800 text-white hover:bg-slate-700"><FileUp size={17} /> Yedekten yükle</button><button onClick={backup} className="btn-primary"><Download size={17} /> JSON yedeği indir</button><input ref={restoreInput} onChange={restore} type="file" accept="application/json" hidden /></div></section>
  </>
}

function PrintCenter({ records, notify }) {
  const [documentMode, setDocumentMode] = useState(false)
  const [reportType, setReportType] = useState('daily')
  const [date, setDate] = useState(localDate())
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [vatInvoices, setVatInvoices] = useState([])

  useEffect(() => {
    supabase.from('vat_invoices').select('*').order('invoice_date', { ascending: true }).then(({ data, error }) => {
      if (error) { console.error(error); notify('Fatura kayıtları yüklenemedi.'); return }
      setVatInvoices((data || []).map(item => ({ ...item, base_amount: Number(item.base_amount) || 0, vat_rate: Number(item.vat_rate) || 0, vat_amount: Number(item.vat_amount) || 0, total_amount: Number(item.total_amount) || 0 })))
    })
  }, [notify])

  const dailyRecords = useMemo(() => records.filter(item => item.date === date), [records, date])
  const monthlyRecords = useMemo(() => records.filter(item => { const [itemYear, itemMonth] = item.date.split('-').map(Number); return itemYear === Number(year) && itemMonth === Number(month) }), [records, year, month])
  const monthlyInvoices = useMemo(() => vatInvoices.filter(item => { const [itemYear, itemMonth] = item.invoice_date.split('-').map(Number); return itemYear === Number(year) && itemMonth === Number(month) }), [vatInvoices, year, month])
  const reportRecords = reportType === 'daily' ? dailyRecords : monthlyRecords
  const reportTotals = totals(reportRecords)
  const reportRevenue = reportTotals.cash + reportTotals.pos + reportTotals.pos1 + reportTotals.online
  const reportNet = reportRevenue - reportTotals.expense - reportTotals.posCommission
  const salesVat = monthlyInvoices.filter(item => item.invoice_type === 'sale').reduce((sum, item) => sum + item.vat_amount, 0)
  const purchaseVat = monthlyInvoices.filter(item => item.invoice_type === 'purchase').reduce((sum, item) => sum + item.vat_amount, 0)
  const vatBalance = salesVat - purchaseVat
  const title = reportType === 'daily' ? 'Günlük Kasa Raporu' : reportType === 'monthly' ? 'Aylık Kasa Raporu' : 'KDV ve Fatura Dökümü'
  const period = reportType === 'daily' ? displayDate(date) : `${MONTHS[Number(month) - 1]} ${year}`
  const documentCode = reportType === 'daily' ? date.replaceAll('-', '') : `${year}${String(month).padStart(2, '0')}`

  const openPrintDocument = () => {
    setDocumentMode(true)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  return <div className={documentMode ? 'print-document-mode fixed inset-0 z-[100] overflow-y-auto bg-slate-200' : ''}>
    {documentMode && <div className="no-print sticky top-0 z-10 flex flex-col gap-3 bg-slate-950 px-4 py-3 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><strong className="block">Belge önizleme</strong><small className="text-slate-400">{title} • {period}</small></div><div className="flex gap-2"><button onClick={() => setDocumentMode(false)} className="btn-secondary flex-1 border-slate-700 bg-slate-900 text-white sm:flex-none"><X size={18} /> Geri Dön</button><button onClick={() => window.print()} className="btn-primary flex-1 sm:flex-none"><Printer size={18} /> Yazdır / PDF Kaydet</button></div></div>}
    {!documentMode && <div className="no-print">
      <PageHeading eyebrow="PDF VE YAZDIRMA" title="Çıktı merkezi" description="Raporunuzu seçin, önizleyin ve yazdırma ekranından PDF olarak kaydedin veya kâğıda çıktı alın." />
      <section className="panel mb-5 p-5 sm:p-6"><div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end"><Field label="Rapor türü"><select className="field" value={reportType} onChange={event => setReportType(event.target.value)}><option value="daily">Günlük kasa raporu</option><option value="monthly">Aylık kasa raporu</option><option value="vat">KDV / fatura dökümü</option></select></Field>{reportType === 'daily' ? <Field label="Rapor tarihi"><input className="field w-full md:w-44" type="date" value={date} onChange={event => setDate(event.target.value)} /></Field> : <div className="grid grid-cols-2 gap-2"><Field label="Yıl"><input className="field w-full md:w-28" type="number" min="2020" max="2100" value={year} onChange={event => setYear(event.target.value)} /></Field><Field label="Ay"><select className="field w-full md:w-36" value={month} onChange={event => setMonth(event.target.value)}>{MONTHS.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}</select></Field></div>}<button onClick={openPrintDocument} className="btn-primary"><Printer size={19} /> Belgeyi Aç / PDF</button></div><div className="mt-4 flex items-start gap-3 rounded-xl bg-blue-50 p-3.5 text-xs leading-5 text-blue-700"><FileText className="mt-0.5 shrink-0" size={18} /> Rapor ayrı bir belge önizlemesinde açılır. Bu pencereden yalnızca raporu yazdırabilir veya <strong>PDF olarak kaydedebilirsiniz.</strong></div></section>
    </div>}

    <section className={`print-sheet panel mx-auto max-w-[1100px] overflow-hidden bg-white ${documentMode ? 'my-5 min-w-[1050px] sm:my-8' : ''}`}>
      <header className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 px-6 py-7 text-white sm:px-9 sm:py-9"><div className="absolute -right-14 -top-20 size-56 rounded-full border-[28px] border-emerald-400/10" /><div className="absolute bottom-0 left-0 h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-500" /><div className="relative flex items-start justify-between gap-6"><div><div className="mb-7 flex items-center gap-3"><div className="grid size-12 place-items-center rounded-2xl bg-emerald-400 text-2xl font-black text-slate-950 shadow-lg shadow-emerald-950/30">₺</div><div><strong className="block text-xl font-black tracking-tight">DÜKKAN KASA</strong><small className="text-[10px] font-bold uppercase tracking-[.22em] text-emerald-300">Finansal Yönetim Sistemi</small></div></div><span className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[9px] font-extrabold uppercase tracking-[.2em] text-emerald-200">Resmî Rapor Dökümü</span><h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{title}</h1><p className="mt-1 text-sm font-semibold text-slate-300">Rapor dönemi: {period}</p></div><div className="min-w-[190px] rounded-2xl border border-white/10 bg-white/5 p-4 text-right backdrop-blur"><span className="block text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">Belge No</span><strong className="mt-1 block text-sm">DK-{reportType.toUpperCase()}-{documentCode}</strong><span className="mt-4 block text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">Oluşturma Tarihi</span><strong className="mt-1 block text-xs text-slate-200">{new Date().toLocaleString('tr-TR')}</strong></div></div></header>

      {reportType !== 'vat' ? <CashPrintReport records={reportRecords} sum={reportTotals} revenue={reportRevenue} net={reportNet} /> : <VatPrintReport invoices={monthlyInvoices} salesVat={salesVat} purchaseVat={purchaseVat} balance={vatBalance} />}

      <footer className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-4 text-[9px] text-slate-400 sm:px-8"><span>Dükkan Kasa Takip tarafından elektronik olarak oluşturulmuştur.</span><span className="font-bold uppercase tracking-wider text-slate-500">Gelir • Gider • KDV</span></footer>
    </section>
  </div>
}

function CashPrintReport({ records, sum, revenue, net }) {
  return <div className="p-6 sm:p-8"><div className="mb-3 flex items-end justify-between"><div><p className="text-[9px] font-extrabold uppercase tracking-[.2em] text-emerald-600">Finansal Özet</p><h2 className="mt-1 text-lg font-black text-slate-900">Dönem sonuçları</h2></div><span className="rounded-full bg-violet-50 px-3 py-1.5 text-[10px] font-bold text-violet-700">POS kesintisi otomatik: %3</span></div><div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5"><PrintStat label="Brüt Ciro" value={money(revenue)} tone="emerald" /><PrintStat label="POS Komisyonu" value={`−${money(sum.posCommission)}`} tone="violet" /><PrintStat label="Toplam Gider" value={`−${money(sum.expense)}`} tone="red" /><PrintStat label="Net Kasa" value={money(net)} tone={net >= 0 ? 'blue' : 'red'} /><PrintStat label="İşlem Sayısı" value={records.length} tone="slate" /></div><div className="mb-7 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><PrintStat label="Nakit" value={money(sum.cash)} small tone="emerald" /><PrintStat label="POS / Kart" value={money(sum.pos)} small tone="blue" /><PrintStat label="POS %1" value={money(sum.pos1)} small tone="violet" /><PrintStat label="Online" value={money(sum.online)} small tone="amber" /></div><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">İşlem detayları</h2><span className="text-[10px] text-slate-400">Tutarlar Türk Lirası (₺)</span></div><div className="overflow-hidden rounded-xl border border-slate-200"><table className="w-full text-left text-[10px]"><thead className="bg-emerald-700 text-white"><tr><th className="p-2.5">Tarih</th><th className="p-2.5">Açıklama</th><th className="p-2.5 text-right">Nakit</th><th className="p-2.5 text-right">POS</th><th className="p-2.5 text-right">POS %1</th><th className="p-2.5 text-right">Online</th><th className="p-2.5 text-right">Kesinti</th><th className="p-2.5">Gider Kalemi</th><th className="p-2.5 text-right">Gider</th><th className="p-2.5 text-right">Net</th></tr></thead><tbody>{records.length ? records.map((item, index) => <tr key={item.id} className={index % 2 ? 'bg-slate-50' : 'bg-white'}><td className="p-2.5 whitespace-nowrap font-semibold">{displayDate(item.date)}</td><td className="p-2.5">{item.description || '—'}</td><td className="p-2.5 text-right">{money(item.cash)}</td><td className="p-2.5 text-right">{money(item.pos)}</td><td className="p-2.5 text-right">{money(item.pos1)}</td><td className="p-2.5 text-right">{money(item.online)}</td><td className="p-2.5 text-right font-semibold text-violet-700">−{money(posCommissionOf(item))}</td><td className="p-2.5">{item.expenseItem || '—'}</td><td className="p-2.5 text-right text-red-600">{money(item.expense)}</td><td className="p-2.5 text-right font-black text-blue-700">{money(netOf(item))}</td></tr>) : <tr><td colSpan="10" className="p-8 text-center text-slate-400">Bu dönem için kayıt bulunmuyor.</td></tr>}</tbody><tfoot className="bg-slate-900 font-bold text-white"><tr><td colSpan="2" className="p-3">GENEL TOPLAM</td><td className="p-3 text-right">{money(sum.cash)}</td><td className="p-3 text-right">{money(sum.pos)}</td><td className="p-3 text-right">{money(sum.pos1)}</td><td className="p-3 text-right">{money(sum.online)}</td><td className="p-3 text-right">−{money(sum.posCommission)}</td><td /><td className="p-3 text-right">−{money(sum.expense)}</td><td className="p-3 text-right text-emerald-300">{money(net)}</td></tr></tfoot></table></div><div className="mt-7 grid grid-cols-2 gap-8"><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Açıklama / Not</span><div className="mt-6 border-b border-slate-300" /></div><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Kontrol Eden / İmza</span><div className="mt-6 border-b border-slate-300" /></div></div></div>
}

function VatPrintReport({ invoices, salesVat, purchaseVat, balance }) {
  const totalBase = invoices.reduce((total, item) => total + item.base_amount, 0)
  const totalInvoice = invoices.reduce((total, item) => total + item.total_amount, 0)
  return <div className="p-6 sm:p-8"><div className="mb-3"><p className="text-[9px] font-extrabold uppercase tracking-[.2em] text-emerald-600">KDV Özeti</p><h2 className="mt-1 text-lg font-black text-slate-900">Vergi hesaplama sonucu</h2></div><div className="mb-7 grid grid-cols-3 gap-3"><PrintStat label="Hesaplanan KDV" value={money(salesVat)} tone="emerald" /><PrintStat label="İndirilecek KDV" value={money(purchaseVat)} tone="violet" /><PrintStat label={balance >= 0 ? 'Ödenecek KDV' : 'Devreden KDV'} value={money(Math.abs(balance))} tone={balance >= 0 ? 'red' : 'blue'} /></div><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">Fatura detayları</h2><span className="text-[10px] text-slate-400">{invoices.length} fatura kaydı</span></div><div className="overflow-hidden rounded-xl border border-slate-200"><table className="w-full text-left text-[11px]"><thead className="bg-emerald-700 text-white"><tr><th className="p-3">Tarih</th><th className="p-3">Tür</th><th className="p-3">Firma / Fatura</th><th className="p-3 text-right">Matrah</th><th className="p-3 text-right">Oran</th><th className="p-3 text-right">KDV</th><th className="p-3 text-right">Toplam</th></tr></thead><tbody>{invoices.length ? invoices.map((item, index) => <tr key={item.id} className={index % 2 ? 'bg-slate-50' : 'bg-white'}><td className="p-3 whitespace-nowrap font-semibold">{displayDate(item.invoice_date)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${item.invoice_type === 'sale' ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'}`}>{item.invoice_type === 'sale' ? 'SATIŞ / GİDEN' : 'ALIŞ / GELEN'}</span></td><td className="p-3"><strong className="block">{item.company_name || '—'}</strong><span className="text-slate-400">{item.invoice_no || item.description || ''}</span></td><td className="p-3 text-right">{money(item.base_amount)}</td><td className="p-3 text-right">%{item.vat_rate}</td><td className="p-3 text-right font-bold">{money(item.vat_amount)}</td><td className="p-3 text-right font-semibold">{money(item.total_amount)}</td></tr>) : <tr><td colSpan="7" className="p-8 text-center text-slate-400">Bu dönem için fatura bulunmuyor.</td></tr>}</tbody><tfoot className="bg-slate-900 font-bold text-white"><tr><td colSpan="3" className="p-3">FATURA TOPLAMLARI</td><td className="p-3 text-right">{money(totalBase)}</td><td /><td className="p-3 text-right">{money(salesVat + purchaseVat)}</td><td className="p-3 text-right text-emerald-300">{money(totalInvoice)}</td></tr></tfoot></table></div><div className="mt-7 grid grid-cols-2 gap-8"><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Mali Müşavir Notu</span><div className="mt-6 border-b border-slate-300" /></div><div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center"><span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Onay / İmza</span><div className="mt-6 border-b border-slate-300" /></div></div></div>
}

function PrintStat({ label, value, small = false, tone = 'slate' }) { const tones = { emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800', red: 'border-red-200 bg-red-50 text-red-700', violet: 'border-violet-200 bg-violet-50 text-violet-700', blue: 'border-blue-200 bg-blue-50 text-blue-700', amber: 'border-amber-200 bg-amber-50 text-amber-700', slate: 'border-slate-200 bg-slate-50 text-slate-800' }; return <div className={`rounded-xl border ${tones[tone]} ${small ? 'p-3' : 'p-4'}`}><small className="block text-[9px] font-extrabold uppercase tracking-wider opacity-60">{label}</small><strong className={`mt-1 block ${small ? 'text-sm' : 'text-lg'}`}>{value}</strong></div> }

function VatCalculator({ loading, setLoading, notify }) {
  const emptyForm = { invoiceDate: localDate(), invoiceType: 'sale', invoiceNo: '', companyName: '', description: '', baseAmount: '', vatRate: '20', note: '' }
  const [invoices, setInvoices] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [search, setSearch] = useState('')
  const formRef = useRef(null)
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const loadInvoices = useCallback(async () => {
    const { data, error } = await supabase.from('vat_invoices').select('*').order('invoice_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error
    setInvoices((data || []).map(row => ({ ...row, base_amount: Number(row.base_amount) || 0, vat_rate: Number(row.vat_rate) || 0, vat_amount: Number(row.vat_amount) || 0, total_amount: Number(row.total_amount) || 0 })))
  }, [])

  useEffect(() => {
    loadInvoices().catch(error => { console.error(error); notify('KDV kayıtları yüklenemedi.') })
    const channel = supabase.channel('ortak-kdv-react').on('postgres_changes', { event: '*', schema: 'public', table: 'vat_invoices' }, () => loadInvoices().catch(console.error)).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadInvoices, notify])

  const periodInvoices = useMemo(() => invoices.filter(item => {
    const [itemYear, itemMonth] = item.invoice_date.split('-').map(Number)
    return itemYear === Number(year) && itemMonth === Number(month)
  }), [invoices, year, month])
  const calculatedVat = periodInvoices.filter(item => item.invoice_type === 'sale').reduce((sum, item) => sum + item.vat_amount, 0)
  const deductibleVat = periodInvoices.filter(item => item.invoice_type === 'purchase').reduce((sum, item) => sum + item.vat_amount, 0)
  const vatBalance = calculatedVat - deductibleVat
  const baseAmount = Number(form.baseAmount) || 0
  const vatRate = Number(form.vatRate) || 0
  const previewVat = Math.round(baseAmount * vatRate) / 100
  const previewTotal = baseAmount + previewVat
  const visibleInvoices = useMemo(() => periodInvoices.filter(item => !search || [item.company_name, item.invoice_no, item.description, item.note].join(' ').toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))), [periodInvoices, search])

  const resetForm = (invoiceDate = localDate(), invoiceType = 'sale') => {
    setEditingId(null)
    setForm({ ...emptyForm, invoiceDate, invoiceType })
  }
  const startEdit = item => {
    setEditingId(item.id)
    setForm({
      invoiceDate: item.invoice_date,
      invoiceType: item.invoice_type,
      invoiceNo: item.invoice_no || '',
      companyName: item.company_name || '',
      description: item.description || '',
      baseAmount: item.base_amount || '',
      vatRate: String(item.vat_rate),
      note: item.note || '',
    })
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const submit = async event => {
    event.preventDefault()
    if (baseAmount <= 0) return notify('Fatura matrahını girin.')
    if (vatRate < 0 || vatRate > 100) return notify('KDV oranı 0 ile 100 arasında olmalı.')
    setLoading(true)
    try {
      const changes = {
        invoice_date: form.invoiceDate, invoice_type: form.invoiceType, invoice_no: form.invoiceNo.trim().slice(0, 80),
        company_name: form.companyName.trim().slice(0, 100), description: form.description.trim().slice(0, 120),
        base_amount: baseAmount, vat_rate: vatRate, note: form.note.trim().slice(0, 160),
      }
      const request = editingId
        ? supabase.from('vat_invoices').update(changes).eq('id', editingId).select('id').single()
        : supabase.from('vat_invoices').insert(changes).select('id').single()
      const { error } = await request
      if (error) throw error
      const wasEditing = Boolean(editingId)
      resetForm(form.invoiceDate, form.invoiceType)
      await loadInvoices(); notify(wasEditing ? 'KDV faturası güncellendi.' : 'KDV faturası ortak kayıtlara eklendi.')
    } catch (error) { console.error(error); notify(editingId ? 'KDV kaydı güncellenemedi.' : 'KDV kaydı eklenemedi.') } finally { setLoading(false) }
  }
  const remove = async id => {
    if (!confirm('Bu KDV faturasını silmek istediğinize emin misiniz?')) return
    setLoading(true)
    try { const { error } = await supabase.from('vat_invoices').delete().eq('id', id).select('id').single(); if (error) throw error; if (editingId === id) resetForm(); await loadInvoices(); notify('KDV kaydı silindi.') }
    catch (error) { console.error(error); notify('KDV kaydı silinemedi.') } finally { setLoading(false) }
  }

  return <>
    <PageHeading eyebrow="KDV TAKİBİ" title="KDV hesaplama" description="Satış faturalarındaki hesaplanan KDV ile alış faturalarındaki indirilecek KDV'yi aylık olarak karşılaştırın.">
      <div className="grid grid-cols-2 gap-2"><select aria-label="KDV yılı" className="field w-28" value={year} onChange={e => setYear(e.target.value)}>{[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(value => <option key={value}>{value}</option>)}</select><select aria-label="KDV ayı" className="field w-32" value={month} onChange={e => setMonth(e.target.value)}>{MONTHS.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}</select></div>
    </PageHeading>

    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi title="Hesaplanan KDV" value={money(calculatedVat)} note="Satış faturaları" icon={ArrowUpRight} tone="emerald" />
      <Kpi title="İndirilecek KDV" value={money(deductibleVat)} note="Alış / gider faturaları" icon={ArrowDownRight} tone="violet" />
      <Kpi title={vatBalance >= 0 ? 'Ödenecek KDV' : 'Devreden KDV'} value={money(Math.abs(vatBalance))} note={vatBalance >= 0 ? 'Hesaplanan eksi indirilecek' : 'Sonraki aya devreden tutar'} icon={Calculator} tone={vatBalance >= 0 ? 'red' : 'blue'} />
    </div>

    <form ref={formRef} onSubmit={submit} className={`panel mt-5 scroll-mt-5 overflow-hidden ${editingId ? 'ring-2 ring-emerald-400/40' : ''}`}>
      <div className="border-b border-slate-100 p-5 sm:p-6"><PanelTitle eyebrow={editingId ? 'FATURA DÜZENLEME' : 'YENİ FATURA'} title={editingId ? 'KDV kaydını düzenle' : 'KDV kaydı ekle'} /></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
        <Field label="Fatura türü"><select className="field" value={form.invoiceType} onChange={e => set('invoiceType', e.target.value)}><option value="sale">Satış / Giden fatura</option><option value="purchase">Alış / Gelen fatura</option></select></Field>
        <Field label="Fatura tarihi"><input className="field" type="date" required value={form.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} /></Field>
        <Field label="Firma / Müşteri"><div className="relative"><Building2 className="absolute left-3.5 top-3.5 text-slate-400" size={19} /><input className="field pl-11" value={form.companyName} onChange={e => set('companyName', e.target.value)} maxLength="100" placeholder="Firma adı" /></div></Field>
        <Field label="Fatura no"><input className="field" value={form.invoiceNo} onChange={e => set('invoiceNo', e.target.value)} maxLength="80" placeholder="Örn. GIB2026001" /></Field>
        <Field label="KDV hariç tutar (matrah)"><div className="relative"><Banknote className="absolute left-3.5 top-3.5 text-slate-400" size={19} /><input className="field pl-11" type="number" inputMode="decimal" min="0" step="0.01" required value={form.baseAmount} onChange={e => set('baseAmount', e.target.value)} placeholder="0,00" /></div></Field>
        <Field label="KDV oranı (%)"><div className="relative"><Percent className="absolute left-3.5 top-3.5 text-slate-400" size={19} /><input className="field pl-11" type="number" inputMode="decimal" min="0" max="100" step="0.01" required value={form.vatRate} onChange={e => set('vatRate', e.target.value)} list="vat-rates" /><datalist id="vat-rates"><option value="0" /><option value="1" /><option value="10" /><option value="20" /></datalist></div></Field>
        <Field label="Açıklama"><input className="field" value={form.description} onChange={e => set('description', e.target.value)} maxLength="120" placeholder="Mal / hizmet açıklaması" /></Field>
        <Field label="Not"><input className="field" value={form.note} onChange={e => set('note', e.target.value)} maxLength="160" placeholder="İsteğe bağlı" /></Field>
      </div>
      <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="grid grid-cols-3 gap-6"><span><small className="block text-xs text-slate-400">Matrah</small><strong>{money(baseAmount)}</strong></span><span><small className="block text-xs text-slate-400">KDV</small><strong className="text-violet-600">{money(previewVat)}</strong></span><span><small className="block text-xs text-slate-400">Fatura toplamı</small><strong className="text-emerald-600">{money(previewTotal)}</strong></span></div><div className="flex w-full gap-2 sm:w-auto">{editingId && <button type="button" disabled={loading} onClick={() => resetForm()} className="btn-secondary flex-1 sm:flex-none"><X size={18} /> Vazgeç</button>}<button type="submit" disabled={loading} className="btn-primary flex-1 sm:flex-none">{editingId ? <Save size={19} /> : <Plus size={19} />} {editingId ? 'Değişiklikleri Kaydet' : 'Faturayı Kaydet'}</button></div></div>
    </form>

    <section className="panel mt-5 overflow-hidden"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"><PanelTitle eyebrow="FATURALAR" title={`${MONTHS[Number(month) - 1]} ${year} KDV kayıtları`} /><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="field h-11 pl-10" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Firma veya faturada ara" /></div></div>
      <div className="divide-y divide-slate-100 md:hidden">{visibleInvoices.length ? visibleInvoices.map(item => <VatCard key={item.id} item={item} edit={startEdit} remove={remove} />) : <Empty text="Seçili ayda KDV faturası yok." />}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><Th>Tarih</Th><Th>Tür</Th><Th>Firma / Fatura</Th><Th right>Matrah</Th><Th right>Oran</Th><Th right>KDV</Th><Th right>Toplam</Th><Th right>İşlemler</Th></tr></thead><tbody className="divide-y divide-slate-100">{visibleInvoices.length ? visibleInvoices.map(item => <VatRow key={item.id} item={item} edit={startEdit} remove={remove} />) : <tr><td colSpan="8"><Empty text="Seçili ayda KDV faturası yok." /></td></tr>}</tbody></table></div>
    </section>
  </>
}

function VatTypeBadge({ type }) { const sale = type === 'sale'; return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${sale ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'}`}>{sale ? 'Satış / Giden' : 'Alış / Gelen'}</span> }
function VatRow({ item, edit, remove }) { return <tr className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{displayDate(item.invoice_date)}</td><td className="px-5 py-4"><VatTypeBadge type={item.invoice_type} /></td><td className="max-w-[240px] px-5 py-4"><strong className="block truncate text-slate-800">{item.company_name || '—'}</strong><small className="block truncate text-slate-400">{item.invoice_no || item.description || '—'}</small></td><td className="px-5 py-4 text-right text-slate-600">{money(item.base_amount)}</td><td className="px-5 py-4 text-right text-slate-500">%{item.vat_rate}</td><td className={`px-5 py-4 text-right font-bold ${item.invoice_type === 'sale' ? 'text-emerald-600' : 'text-violet-600'}`}>{money(item.vat_amount)}</td><td className="px-5 py-4 text-right font-bold text-slate-800">{money(item.total_amount)}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" aria-label="KDV kaydını düzenle" title="Düzenle" onClick={() => edit(item)} className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"><Pencil size={17} /></button><button type="button" aria-label="KDV kaydını sil" title="Sil" onClick={() => remove(item.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 size={17} /></button></div></td></tr> }
function VatCard({ item, edit, remove }) { return <article className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><VatTypeBadge type={item.invoice_type} /><strong className="mt-2 block truncate text-sm text-slate-900">{item.company_name || item.description || 'Fatura'}</strong><small className="mt-1 block text-slate-400">{displayDate(item.invoice_date)} {item.invoice_no && `• ${item.invoice_no}`}</small></div><div className="flex gap-1"><button type="button" aria-label="KDV kaydını düzenle" onClick={() => edit(item)} className="rounded-lg bg-blue-50 p-2 text-blue-600"><Pencil size={17} /></button><button type="button" aria-label="KDV kaydını sil" onClick={() => remove(item.id)} className="rounded-lg bg-red-50 p-2 text-red-500"><Trash2 size={17} /></button></div></div><div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center"><span><small className="block text-[10px] uppercase text-slate-400">Matrah</small><strong className="text-xs text-slate-700">{shortMoney(item.base_amount)}</strong></span><span><small className="block text-[10px] uppercase text-slate-400">KDV %{item.vat_rate}</small><strong className={`text-xs ${item.invoice_type === 'sale' ? 'text-emerald-600' : 'text-violet-600'}`}>{shortMoney(item.vat_amount)}</strong></span><span><small className="block text-[10px] uppercase text-slate-400">Toplam</small><strong className="text-xs text-slate-900">{shortMoney(item.total_amount)}</strong></span></div></article> }

function ReportRow({ row: r, total = false }) { const cell = total ? 'px-5 py-4 text-right' : 'px-5 py-3.5 text-right text-slate-600'; return <tr className={total ? '' : 'hover:bg-slate-50'}><td className={`px-5 py-3.5 font-bold ${total ? '' : 'text-slate-800'}`}>{r.name}</td><td className={cell}>{money(r.cash)}</td><td className={cell}>{money(r.pos)}</td><td className={cell}>{money(r.pos1)}</td><td className={cell}>{money(r.online)}</td><td className={`${cell} font-bold ${total ? '' : 'text-emerald-600'}`}>{money(r.revenue)}</td><td className={`${cell} ${total ? '' : 'text-violet-600'}`}>−{money(r.posCommission)}</td><td className={`${cell} ${total ? '' : 'text-red-500'}`}>{money(r.expense)}</td><td className={`${cell} font-bold ${total ? '' : r.net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{money(r.net)}</td></tr> }

export default App
