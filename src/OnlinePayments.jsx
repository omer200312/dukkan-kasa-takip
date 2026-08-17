import { useMemo, useRef, useState } from 'react'
import { BadgeInfo, Banknote, Pencil, Plus, ReceiptText, Save, Search, Trash2, Utensils, X } from 'lucide-react'
import { supabase } from './supabase.js'
import { ONLINE_PROVIDERS, ONLINE_PROVIDER_MAP, onlineGrandTotal, onlineProviderTotals } from './onlinePayments.js'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const now = new Date()
const currentYear = now.getFullYear()
const currentMonth = now.getMonth() + 1
const localDate = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const money = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0)
const displayDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })

export default function OnlinePayments({ records, loading, setLoading, reload, notify }) {
  const emptyForm = { date: localDate(), provider: ONLINE_PROVIDERS[0].id, amount: '', description: '', note: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [providerFilter, setProviderFilter] = useState('all')
  const [search, setSearch] = useState('')
  const formRef = useRef(null)
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))

  const periodRecords = useMemo(() => records.filter(record => {
    const [recordYear, recordMonth] = record.date.split('-').map(Number)
    return recordYear === Number(year) && recordMonth === Number(month)
  }), [records, year, month])
  const providerTotals = useMemo(() => onlineProviderTotals(periodRecords), [periodRecords])
  const periodTotal = useMemo(() => onlineGrandTotal(periodRecords), [periodRecords])
  const visibleRecords = useMemo(() => periodRecords.filter(record => {
    const matchesProvider = providerFilter === 'all' || record.provider === providerFilter
    const query = search.trim().toLocaleLowerCase('tr')
    const matchesSearch = !query || [ONLINE_PROVIDER_MAP[record.provider]?.label, record.description, record.note].join(' ').toLocaleLowerCase('tr').includes(query)
    return matchesProvider && matchesSearch
  }), [periodRecords, providerFilter, search])

  const resetForm = (date = localDate(), provider = ONLINE_PROVIDERS[0].id) => {
    setEditingId(null)
    setForm({ ...emptyForm, date, provider })
  }

  const startEdit = record => {
    setEditingId(record.id)
    setForm({ date: record.date, provider: record.provider, amount: record.amount, description: record.description, note: record.note })
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const submit = async event => {
    event.preventDefault()
    const amount = Number(form.amount) || 0
    if (amount <= 0) return notify('Online işlem tutarını girin.')
    setLoading(true)
    try {
      const changes = {
        payment_date: form.date,
        provider: form.provider,
        amount,
        description: form.description.trim().slice(0, 120),
        note: form.note.trim().slice(0, 180),
      }
      const request = editingId
        ? supabase.from('online_payments').update(changes).eq('id', editingId).select('id').single()
        : supabase.from('online_payments').insert(changes).select('id').single()
      const { error } = await request
      if (error) throw error
      const wasEditing = Boolean(editingId)
      resetForm(form.date, form.provider)
      await reload({ quiet: true })
      notify(wasEditing ? 'Online işlem güncellendi.' : 'Online işlem ortak kayıtlara eklendi.')
    } catch (error) {
      console.error(error)
      notify(editingId ? 'Online işlem güncellenemedi.' : 'Online işlem eklenemedi.')
    } finally { setLoading(false) }
  }

  const remove = async id => {
    if (!confirm('Bu online/yemek kartı işlemini silmek istediğinize emin misiniz?')) return
    setLoading(true)
    try {
      const { error } = await supabase.from('online_payments').delete().eq('id', id).select('id').single()
      if (error) throw error
      if (editingId === id) resetForm()
      await reload({ quiet: true })
      notify('Online işlem silindi.')
    } catch (error) {
      console.error(error)
      notify('Online işlem silinemedi.')
    } finally { setLoading(false) }
  }

  return <>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-emerald-600">AYRI TAKİP MODÜLÜ</p><h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Online / Yemek Kartı</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Online sipariş ve yemek kartı tutarlarını sağlayıcı bazında takip edin. Bu kayıtlar ana ciro, gider ve net kasa hesabına dahil edilmez.</p></div>
      <div className="grid grid-cols-2 gap-2"><select aria-label="Online işlem yılı" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-500 sm:w-28" value={year} onChange={event => setYear(event.target.value)}>{[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map(value => <option key={value}>{value}</option>)}</select><select aria-label="Online işlem ayı" className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-500 sm:w-32" value={month} onChange={event => setMonth(event.target.value)}>{MONTHS.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}</select></div>
    </div>

    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-800"><BadgeInfo className="mt-0.5 shrink-0" size={20} /><p><strong>Ana kasadan bağımsızdır.</strong> Buradaki tutarlar yalnızca online/yemek kartı raporlarında görünür; toplam ciro ve net kasayı değiştirmez.</p></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <article className="rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-xl"><div className="flex items-start justify-between"><span className="text-sm font-semibold text-slate-300">Aylık Ayrı Toplam</span><div className="grid size-10 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><Utensils size={20} /></div></div><strong className="mt-4 block text-2xl font-extrabold">{money(periodTotal)}</strong><small className="mt-1 block text-xs text-slate-400">{periodRecords.length} ayrı işlem • kasaya dahil değil</small></article>
      {ONLINE_PROVIDERS.map(provider => <button type="button" onClick={() => setProviderFilter(provider.id)} key={provider.id} className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${providerFilter === provider.id ? `${provider.border} ring-2 ring-current/10` : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div className={`grid size-10 place-items-center rounded-xl text-xs font-black ${provider.soft}`}>{provider.short}</div><span className={`mt-1 size-2.5 rounded-full ${provider.accent}`} /></div><strong className="mt-4 block text-sm text-slate-700">{provider.label}</strong><span className="mt-1 block text-xl font-extrabold text-slate-950">{money(providerTotals[provider.id])}</span></button>)}
    </div>

    <form ref={formRef} onSubmit={submit} className={`mt-5 scroll-mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${editingId ? 'ring-2 ring-emerald-400/40' : ''}`}>
      <div className="border-b border-slate-100 p-5 sm:p-6"><p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-emerald-600">{editingId ? 'KAYIT DÜZENLEME' : 'YENİ KAYIT'}</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{editingId ? 'Online işlemi düzenle' : 'Online / yemek kartı işlemi ekle'}</h2></div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-5">
        <label><span className="mb-2 block text-sm font-semibold text-slate-700">Sağlayıcı</span><select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-500" value={form.provider} onChange={event => set('provider', event.target.value)}>{ONLINE_PROVIDERS.map(provider => <option value={provider.id} key={provider.id}>{provider.label}</option>)}</select></label>
        <label><span className="mb-2 block text-sm font-semibold text-slate-700">İşlem tarihi</span><input className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-500" type="date" required value={form.date} onChange={event => set('date', event.target.value)} /></label>
        <label><span className="mb-2 block text-sm font-semibold text-slate-700">Tutar</span><div className="relative"><Banknote className="absolute left-3.5 top-3.5 text-slate-400" size={19} /><input className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3.5 text-sm outline-none focus:border-emerald-500" type="number" inputMode="decimal" min="0.01" step="0.01" required value={form.amount} onChange={event => set('amount', event.target.value)} placeholder="0,00" /></div></label>
        <label><span className="mb-2 block text-sm font-semibold text-slate-700">Açıklama</span><input className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-500" value={form.description} onChange={event => set('description', event.target.value)} maxLength="120" placeholder="Örn. Günlük satış" /></label>
        <label><span className="mb-2 block text-sm font-semibold text-slate-700">Not</span><input className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-emerald-500" value={form.note} onChange={event => set('note', event.target.value)} maxLength="180" placeholder="İsteğe bağlı" /></label>
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><p className="text-xs leading-5 text-slate-500">Kaydedilen tutar yalnızca bu modülün raporlarına eklenir.</p><div className="flex gap-2">{editingId && <button type="button" disabled={loading} onClick={() => resetForm()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 sm:flex-none"><X size={18} /> Vazgeç</button>}<button type="submit" disabled={loading} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-60 sm:flex-none">{editingId ? <Save size={19} /> : <Plus size={19} />} {editingId ? 'Değişiklikleri Kaydet' : 'İşlemi Kaydet'}</button></div></div>
    </form>

    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-extrabold uppercase tracking-[.16em] text-emerald-600">AYLIK KAYITLAR</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{MONTHS[Number(month) - 1]} {year} işlemleri</h2></div><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-500 sm:w-64" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Kayıtlarda ara" /></div></div>
        <div className="flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setProviderFilter('all')} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${providerFilter === 'all' ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>Tümü ({periodRecords.length})</button>{ONLINE_PROVIDERS.map(provider => <button type="button" onClick={() => setProviderFilter(provider.id)} key={provider.id} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${providerFilter === provider.id ? `${provider.accent} text-white` : provider.soft}`}>{provider.label}</button>)}</div>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">{visibleRecords.length ? visibleRecords.map(record => <OnlinePaymentCard key={record.id} record={record} edit={startEdit} remove={remove} />) : <OnlineEmpty />}</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400"><tr><th className="px-5 py-3.5">Tarih</th><th className="px-5 py-3.5">Sağlayıcı</th><th className="px-5 py-3.5">Açıklama / Not</th><th className="px-5 py-3.5 text-right">Tutar</th><th className="px-5 py-3.5 text-right">İşlemler</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleRecords.length ? visibleRecords.map(record => <OnlinePaymentRow key={record.id} record={record} edit={startEdit} remove={remove} />) : <tr><td colSpan="5"><OnlineEmpty /></td></tr>}</tbody></table></div>
    </section>
  </>
}

function ProviderBadge({ providerId }) {
  const provider = ONLINE_PROVIDER_MAP[providerId] || { label: providerId, short: '?', soft: 'bg-slate-100 text-slate-700' }
  return <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${provider.soft}`}><span className="grid size-5 place-items-center rounded-full bg-white/70 text-[9px]">{provider.short}</span>{provider.label}</span>
}

function OnlinePaymentRow({ record, edit, remove }) {
  return <tr className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-4 text-slate-500">{displayDate(record.date)}</td><td className="px-5 py-4"><ProviderBadge providerId={record.provider} /></td><td className="max-w-[360px] px-5 py-4"><strong className="block truncate text-slate-800">{record.description || '—'}</strong>{record.note && <small className="block truncate text-slate-400">{record.note}</small>}</td><td className="px-5 py-4 text-right text-base font-extrabold text-slate-900">{money(record.amount)}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button type="button" aria-label="Online işlemi düzenle" onClick={() => edit(record)} className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"><Pencil size={17} /></button><button type="button" aria-label="Online işlemi sil" onClick={() => remove(record.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500"><Trash2 size={17} /></button></div></td></tr>
}

function OnlinePaymentCard({ record, edit, remove }) {
  return <article className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><ProviderBadge providerId={record.provider} /><strong className="mt-2 block truncate text-sm text-slate-900">{record.description || 'Online işlem'}</strong><small className="mt-1 block text-slate-400">{displayDate(record.date)}</small></div><div className="flex shrink-0 gap-1"><button type="button" aria-label="Online işlemi düzenle" onClick={() => edit(record)} className="rounded-lg bg-blue-50 p-2 text-blue-600"><Pencil size={17} /></button><button type="button" aria-label="Online işlemi sil" onClick={() => remove(record.id)} className="rounded-lg bg-red-50 p-2 text-red-500"><Trash2 size={17} /></button></div></div><div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3"><span className="text-xs font-semibold text-slate-500">Ayrı takip tutarı</span><strong className="text-lg text-slate-950">{money(record.amount)}</strong></div>{record.note && <p className="mt-3 text-xs leading-5 text-slate-500">{record.note}</p>}</article>
}

function OnlineEmpty() {
  return <div className="py-10 text-center"><div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ReceiptText /></div><p className="text-sm text-slate-400">Bu seçim için online/yemek kartı kaydı yok.</p></div>
}
