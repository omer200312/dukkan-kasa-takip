import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight, ArrowUpRight, Banknote, BarChart3, CalendarDays, CheckCircle2,
  ChevronRight, CircleUserRound, Cloud, CreditCard, Download, FileUp, LayoutDashboard,
  LoaderCircle, LogOut, Menu, Plus, ReceiptText, Search, ShieldCheck, ShoppingBag,
  Smartphone, Trash2, TrendingUp, WalletCards, X,
} from 'lucide-react'
import { supabase } from './supabase.js'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const LOCAL_RECORDS_KEY = 'dukkan-kasa-shared-v1'
const CLOUD_MIGRATION_KEY = 'dukkan-kasa-cloud-migrated-v1'
const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1

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
  }), { cash: 0, pos: 0, pos1: 0, online: 0, expense: 0 })
}

const revenueOf = record => record.cash + record.pos + record.pos1 + record.online
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
]

function Sidebar({ page, go, username }) {
  return <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col bg-slate-950 p-5 text-white lg:flex"><div className="px-2 py-2"><Brand light /></div><nav className="mt-9 flex-1 space-y-2">{navItems.map(item => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => go(item.id)} />)}</nav><div className="rounded-2xl border border-slate-800 bg-slate-900 p-3"><div className="mb-3 flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-emerald-500/15 font-bold uppercase text-emerald-400">{username[0]}</div><div className="min-w-0"><strong className="block truncate text-sm">{username}</strong><small className="flex items-center gap-1 text-slate-400"><i className="size-1.5 rounded-full bg-emerald-400" /> Ortak kasa aktif</small></div></div><button onClick={() => confirm('Oturumu kapatmak istiyor musunuz?') && supabase.auth.signOut()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800"><LogOut size={15} /> Çıkış yap</button></div></aside>
}

function NavButton({ item, active, onClick }) { const Icon = item.icon; return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition ${active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}><Icon size={20} />{item.label}</button> }
function MobileHeader({ onMenu, username }) { return <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur lg:hidden"><Brand /><button onClick={onMenu} aria-label="Menüyü aç" className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-700"><Menu /></button><span className="sr-only">{username}</span></header> }
function MobileDrawer({ page, go, close, username }) { return <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Menüyü kapat" onClick={close} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" /><aside className="absolute inset-y-0 right-0 w-[min(86vw,340px)] bg-slate-950 p-5 text-white shadow-2xl"><div className="flex items-center justify-between"><Brand light /><button onClick={close} className="grid size-10 place-items-center rounded-xl bg-slate-800"><X /></button></div><nav className="mt-9 space-y-2">{navItems.map(item => <NavButton key={item.id} item={item} active={page === item.id} onClick={() => go(item.id)} />)}</nav><div className="absolute bottom-6 left-5 right-5"><p className="mb-3 text-sm text-slate-400">Giriş yapan: <strong className="text-white">{username}</strong></p><button onClick={() => confirm('Oturumu kapatmak istiyor musunuz?') && supabase.auth.signOut()} className="btn-secondary w-full border-slate-700 bg-slate-900 text-slate-200"><LogOut size={17} /> Çıkış yap</button></div></aside></div> }
function BottomNav({ page, go }) { return <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,.06)] backdrop-blur lg:hidden">{navItems.map(item => { const Icon = item.icon; const active = page === item.id; return <button key={item.id} onClick={() => go(item.id)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${active ? 'bg-emerald-50 text-emerald-600' : 'text-slate-400'}`}><Icon size={21} />{item.id === 'transactions' ? 'İşlemler' : item.label}</button> })}</nav> }

function PageHeading({ eyebrow, title, description, children }) { return <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{children}</div> }
function Field({ label, children, className = '' }) { return <label className={className}><span className="field-label">{label}</span>{children}</label> }

function Dashboard({ records, go }) {
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const list = useMemo(() => records.filter(r => { const [y, m] = r.date.split('-').map(Number); return y === Number(year) && m === Number(month) }), [records, year, month])
  const sum = totals(list), revenue = sum.cash + sum.pos + sum.pos1 + sum.online, net = revenue - sum.expense
  const latest = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 5)
  const payments = [{ label: 'Nakit', value: sum.cash, color: 'bg-emerald-500', icon: Banknote }, { label: 'POS / Kart', value: sum.pos, color: 'bg-blue-500', icon: CreditCard }, { label: 'POS %1', value: sum.pos1, color: 'bg-violet-500', icon: WalletCards }, { label: 'Yemek kartı / Online', value: sum.online, color: 'bg-amber-500', icon: Smartphone }]
  return <>
    <PageHeading eyebrow="GENEL DURUM" title="Kasa kontrol paneli" description="Gelir, gider ve net kasanızı tek bakışta takip edin."><div className="grid grid-cols-2 gap-2"><select aria-label="Yıl" className="field w-28" value={year} onChange={e => setYear(e.target.value)}>{[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y}>{y}</option>)}</select><select aria-label="Ay" className="field w-32" value={month} onChange={e => setMonth(e.target.value)}>{MONTHS.map((m, i) => <option value={i + 1} key={m}>{m}</option>)}</select></div></PageHeading>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi title="Toplam Ciro" value={money(revenue)} note="Tüm gelir kanalları" icon={TrendingUp} tone="emerald" />
      <Kpi title="Toplam Gider" value={money(sum.expense)} note="Gider kalemleri toplamı" icon={ArrowDownRight} tone="red" />
      <Kpi title="Net Kasa" value={money(net)} note="Ciro eksi gider" icon={net >= 0 ? ArrowUpRight : ArrowDownRight} tone={net >= 0 ? 'blue' : 'red'} />
      <Kpi title="İşlem Sayısı" value={list.length} note="Seçili ay kayıtları" icon={ReceiptText} tone="violet" />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.1fr]">
      <section className="panel p-5 sm:p-6"><PanelTitle eyebrow="ÖDEME DAĞILIMI" title="Gelir kanalları" /><div className="mt-6 space-y-5">{payments.map(item => { const Icon = item.icon; const percentage = revenue ? Math.round(item.value / revenue * 100) : 0; return <div key={item.label}><div className="mb-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Icon size={17} className="text-slate-400" />{item.label}</span><span className="text-right"><strong className="text-sm text-slate-900">{money(item.value)}</strong><small className="ml-2 text-slate-400">%{percentage}</small></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${percentage}%` }} /></div></div> })}</div></section>
      <section className="panel p-5 sm:p-6"><PanelTitle eyebrow="SON HAREKETLER" title="En son kayıtlar"><button onClick={() => go('transactions')} className="text-sm font-bold text-emerald-600">Tümünü gör</button></PanelTitle><div className="mt-4 divide-y divide-slate-100">{latest.length ? latest.map(r => { const netRecord = revenueOf(r) - r.expense; return <div key={r.id} className="flex items-center gap-3 py-3.5"><div className={`grid size-10 shrink-0 place-items-center rounded-xl ${netRecord >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>{netRecord >= 0 ? <ArrowUpRight size={19} /> : <ArrowDownRight size={19} />}</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-800">{r.description || r.expenseItem || 'İşlem'}</strong><small className="text-slate-400">{displayDate(r.date)}</small></div><strong className={`text-sm ${netRecord >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{netRecord > 0 ? '+' : ''}{money(netRecord)}</strong></div> }) : <Empty text="Bu ay için henüz kayıt yok." />}</div></section>
    </div>
  </>
}

function Kpi({ title, value, note, icon: Icon, tone }) { const tones = { emerald: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-500', blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600' }; return <article className="panel p-5"><div className="flex items-start justify-between"><span className="text-sm font-semibold text-slate-500">{title}</span><div className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={20} /></div></div><strong className="mt-4 block text-2xl font-extrabold tracking-tight text-slate-950">{value}</strong><small className="mt-1 block text-xs text-slate-400">{note}</small></article> }
function PanelTitle({ eyebrow, title, children }) { return <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{title}</h2></div>{children}</div> }
function Empty({ text }) { return <div className="py-10 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ReceiptText /></div><p className="text-sm text-slate-400">{text}</p></div> }

function Transactions({ records, loading, setLoading, reload, notify }) {
  const initial = { date: localDate(), description: '', cash: '', pos: '', pos1: '', online: '', expenseItem: '', expense: '', note: '' }
  const [form, setForm] = useState(initial)
  const [search, setSearch] = useState('')
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const num = key => Number(form[key]) || 0
  const formRevenue = num('cash') + num('pos') + num('pos1') + num('online'), formNet = formRevenue - num('expense')
  const filtered = useMemo(() => records.filter(r => !search || [r.date, r.description, r.expenseItem, r.note].join(' ').toLocaleLowerCase('tr').includes(search.toLocaleLowerCase('tr'))), [records, search])
  const submit = async event => {
    event.preventDefault()
    if (formRevenue + num('expense') <= 0) return notify('En az bir tutar girin.')
    if (num('expense') > 0 && !form.expenseItem.trim()) return notify('Lütfen gider kalemini yazın.')
    setLoading(true)
    try {
      const { error } = await supabase.from('cash_records').insert(toRow({ ...form, expense: num('expense') }))
      if (error) throw error
      setForm({ ...initial, date: form.date })
      await reload({ quiet: true }); notify('İşlem ortak kasaya kaydedildi.')
    } catch (error) { console.error(error); notify('Kayıt eklenemedi. Bağlantınızı kontrol edin.') } finally { setLoading(false) }
  }
  const remove = async id => {
    if (!confirm('Bu kaydı ortak kasadan silmek istediğinize emin misiniz?')) return
    setLoading(true)
    try { const { error } = await supabase.from('cash_records').delete().eq('id', id); if (error) throw error; await reload({ quiet: true }); notify('Kayıt silindi.') }
    catch (error) { console.error(error); notify('Kayıt silinemedi.') } finally { setLoading(false) }
  }
  const exportCsv = () => {
    const rows = [['Tarih', 'Açıklama', 'Nakit', 'POS / Kart', 'POS %1', 'Yemek Kartı / Online', 'Gider Kalemi', 'Gider', 'Not'], ...records.map(r => [r.date, r.description, r.cash, r.pos, r.pos1, r.online, r.expenseItem, r.expense, r.note])]
    download('dukkan-kasa-kayitlari.csv', '\ufeff' + rows.map(row => row.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(';')).join('\n'), 'text/csv;charset=utf-8')
    notify('CSV dosyası indirildi.')
  }
  return <>
    <PageHeading eyebrow="GÜNLÜK KAYIT" title="Yeni işlem ekle" description="Gelir ve giderleri ayrı ayrı, açıklamasıyla kaydedin." />
    <form onSubmit={submit} className="panel overflow-hidden">
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
      <div className="flex flex-col gap-4 border-t border-slate-100 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex gap-7"><span><small className="block text-xs text-slate-400">Toplam ciro</small><strong className="text-base text-emerald-600">{money(formRevenue)}</strong></span><span><small className="block text-xs text-slate-400">Net kasa</small><strong className={formNet >= 0 ? 'text-blue-600' : 'text-red-500'}>{money(formNet)}</strong></span></div><button disabled={loading} className="btn-primary w-full sm:w-auto"><Plus size={19} /> İşlemi Kaydet</button></div>
    </form>
    <section className="panel mt-5 overflow-hidden"><div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6"><PanelTitle eyebrow="KAYITLAR" title="İşlem geçmişi" /><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="field h-11 pl-10" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Kayıtlarda ara" /></div><button type="button" onClick={exportCsv} className="btn-secondary shrink-0"><Download size={17} /><span className="hidden sm:inline">CSV indir</span></button></div></div>
      <div className="divide-y divide-slate-100 md:hidden">{filtered.length ? filtered.map(r => <TransactionCard key={r.id} record={r} remove={remove} />) : <Empty text="Henüz işlem kaydı bulunmuyor." />}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><Th>Tarih</Th><Th>Açıklama</Th><Th right>Ciro</Th><Th>Gider kalemi</Th><Th right>Gider</Th><Th right>Net</Th><Th /></tr></thead><tbody className="divide-y divide-slate-100">{filtered.length ? filtered.map(r => <TransactionRow key={r.id} record={r} remove={remove} />) : <tr><td colSpan="7"><Empty text="Henüz işlem kaydı bulunmuyor." /></td></tr>}</tbody></table></div>
    </section>
  </>
}

function AmountField({ label, icon: Icon, value, onChange, expense = false }) { return <Field label={label}><div className="relative"><Icon className={`absolute left-3.5 top-3.5 ${expense ? 'text-red-400' : 'text-slate-400'}`} size={19} /><input className={`field pl-11 ${expense ? 'border-red-100 bg-red-50/40 focus:border-red-400 focus:ring-red-400/10' : ''}`} inputMode="decimal" type="number" min="0" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder="0,00" /></div></Field> }
function Th({ children, right = false }) { return <th className={`px-5 py-3.5 font-bold ${right ? 'text-right' : ''}`}>{children}</th> }
function TransactionRow({ record: r, remove }) { const revenue = revenueOf(r), net = revenue - r.expense; return <tr className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{displayDate(r.date)}</td><td className="max-w-[230px] px-5 py-4"><strong className="block truncate text-slate-800">{r.description || '—'}</strong>{r.note && <small className="block truncate text-slate-400">{r.note}</small>}</td><td className="px-5 py-4 text-right font-bold text-emerald-600">{money(revenue)}</td><td className="px-5 py-4 text-slate-600">{r.expenseItem || '—'}</td><td className="px-5 py-4 text-right font-semibold text-red-500">{money(r.expense)}</td><td className={`px-5 py-4 text-right font-bold ${net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{money(net)}</td><td className="px-5 py-4 text-right"><button aria-label="Kaydı sil" onClick={() => remove(r.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 size={17} /></button></td></tr> }
function TransactionCard({ record: r, remove }) { const revenue = revenueOf(r), net = revenue - r.expense; return <article className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{r.description || r.expenseItem || 'İşlem'}</strong><small className="mt-1 flex items-center gap-1 text-slate-400"><CalendarDays size={13} />{displayDate(r.date)}</small></div><button aria-label="Kaydı sil" onClick={() => remove(r.id)} className="rounded-lg bg-slate-50 p-2 text-slate-400"><Trash2 size={17} /></button></div><div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center"><span><small className="block text-[10px] uppercase text-slate-400">Ciro</small><strong className="text-xs text-emerald-600">{shortMoney(revenue)}</strong></span><span><small className="block text-[10px] uppercase text-slate-400">Gider</small><strong className="text-xs text-red-500">{shortMoney(r.expense)}</strong></span><span><small className="block text-[10px] uppercase text-slate-400">Net</small><strong className={`text-xs ${net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{shortMoney(net)}</strong></span></div>{(r.expenseItem || r.note) && <p className="mt-3 text-xs leading-5 text-slate-500">{r.expenseItem && <><strong>Gider:</strong> {r.expenseItem} </>}{r.note && <>• {r.note}</>}</p>}</article> }

function Reports({ records, loading, setLoading, reload, notify }) {
  const [year, setYear] = useState(currentYear)
  const restoreInput = useRef(null)
  const rows = MONTHS.map((name, index) => { const sum = totals(records.filter(r => { const [y, m] = r.date.split('-').map(Number); return y === Number(year) && m === index + 1 })); const revenue = sum.cash + sum.pos + sum.pos1 + sum.online; return { name, ...sum, revenue, net: revenue - sum.expense } })
  const annual = rows.reduce((a, r) => ({ cash: a.cash + r.cash, pos: a.pos + r.pos, pos1: a.pos1 + r.pos1, online: a.online + r.online, revenue: a.revenue + r.revenue, expense: a.expense + r.expense, net: a.net + r.net }), { cash: 0, pos: 0, pos1: 0, online: 0, revenue: 0, expense: 0, net: 0 })
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
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><Kpi title="Yıllık Ciro" value={money(annual.revenue)} note={`${year} toplamı`} icon={TrendingUp} tone="emerald" /><Kpi title="Yıllık Gider" value={money(annual.expense)} note={`${year} toplamı`} icon={ArrowDownRight} tone="red" /><Kpi title="Yıllık Net" value={money(annual.net)} note="Ciro eksi gider" icon={annual.net >= 0 ? ArrowUpRight : ArrowDownRight} tone={annual.net >= 0 ? 'blue' : 'red'} /></div>
    <section className="panel overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><Th>Ay</Th><Th right>Nakit</Th><Th right>POS / Kart</Th><Th right>POS %1</Th><Th right>Online</Th><Th right>Toplam Ciro</Th><Th right>Gider</Th><Th right>Net Kasa</Th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(r => <ReportRow key={r.name} row={r} />)}</tbody><tfoot className="bg-slate-950 font-bold text-white"><ReportRow row={{ name: 'YIL TOPLAMI', ...annual }} total /></tfoot></table></div></section>
    <section className="mt-5 flex flex-col gap-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-7"><div className="flex gap-4"><div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-400"><Cloud /></div><div><h2 className="font-extrabold">Çevrim içi ve güvende</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">Kayıtlar Supabase üzerinde tutulur ve tüm cihazlarda ortak görünür. Ek olarak JSON yedeği alabilirsiniz.</p></div></div><div className="flex shrink-0 flex-col gap-2 sm:flex-row"><button disabled={loading} onClick={() => restoreInput.current?.click()} className="btn-secondary border-slate-600 bg-slate-800 text-white hover:bg-slate-700"><FileUp size={17} /> Yedekten yükle</button><button onClick={backup} className="btn-primary"><Download size={17} /> JSON yedeği indir</button><input ref={restoreInput} onChange={restore} type="file" accept="application/json" hidden /></div></section>
  </>
}

function ReportRow({ row: r, total = false }) { const cell = total ? 'px-5 py-4 text-right' : 'px-5 py-3.5 text-right text-slate-600'; return <tr className={total ? '' : 'hover:bg-slate-50'}><td className={`px-5 py-3.5 font-bold ${total ? '' : 'text-slate-800'}`}>{r.name}</td><td className={cell}>{money(r.cash)}</td><td className={cell}>{money(r.pos)}</td><td className={cell}>{money(r.pos1)}</td><td className={cell}>{money(r.online)}</td><td className={`${cell} font-bold ${total ? '' : 'text-emerald-600'}`}>{money(r.revenue)}</td><td className={`${cell} ${total ? '' : 'text-red-500'}`}>{money(r.expense)}</td><td className={`${cell} font-bold ${total ? '' : r.net >= 0 ? 'text-blue-600' : 'text-red-500'}`}>{money(r.net)}</td></tr> }

export default App
