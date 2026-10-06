import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Banknote, CalendarDays, Camera, ExternalLink, FileImage, ImagePlus,
  FileDown, Pencil, ReceiptText, Search, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react'
import { supabase } from './supabase.js'

const BUCKET = 'receipt-images'
const MAX_FILE_SIZE = 6 * 1024 * 1024
const MAX_SOURCE_SIZE = 20 * 1024 * 1024
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const CATEGORIES = ['Mal / Malzeme', 'Market', 'Akaryakıt', 'Fatura', 'Yemek', 'Temizlik', 'Demirbaş', 'Diğer']

const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const localDate = () => dateKey(new Date())
const displayDate = value => new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })
const money = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(value) || 0)
const formatBytes = value => value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`

const wrapCanvasText = (context, text, maxWidth) => {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let line = words.shift()
  words.forEach(word => {
    const candidate = `${line} ${word}`
    if (context.measureText(candidate).width <= maxWidth) line = candidate
    else { lines.push(line); line = word }
  })
  lines.push(line)
  return lines
}

async function loadReceiptImage(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Fiş fotoğrafı indirilemedi.')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const image = new Image()
  image.decoding = 'async'
  image.src = objectUrl
  try {
    await image.decode()
    return { image, release: () => URL.revokeObjectURL(objectUrl) }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

async function renderReceiptPage(item, periodLabel, pageNumber, pageCount) {
  const canvas = document.createElement('canvas')
  canvas.width = 1240
  canvas.height = 1754
  const context = canvas.getContext('2d')

  context.fillStyle = '#f1f5f9'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#071226'
  context.fillRect(0, 0, canvas.width, 210)
  context.fillStyle = '#10b981'
  context.fillRect(0, 200, canvas.width, 10)

  context.fillStyle = '#34d399'
  context.font = '700 22px Arial, sans-serif'
  context.fillText('DÜKKAN KASA • FİŞ ARŞİVİ', 72, 68)
  context.fillStyle = '#ffffff'
  context.font = '800 44px Arial, sans-serif'
  context.fillText(item.merchant || 'Fiş', 72, 128)
  context.fillStyle = '#94a3b8'
  context.font = '500 22px Arial, sans-serif'
  context.fillText(`${periodLabel} • ${pageNumber}/${pageCount}`, 72, 170)

  const cardX = 52
  const cardY = 250
  const cardW = canvas.width - 104
  const cardH = 1370
  context.fillStyle = '#ffffff'
  context.fillRect(cardX, cardY, cardW, cardH)

  const metaY = cardY + 58
  const columns = [
    ['TARİH', displayDate(item.date)],
    ['KATEGORİ', item.category],
    ['TUTAR', money(item.amount)],
  ]
  columns.forEach(([label, value], index) => {
    const x = cardX + 46 + index * 355
    context.fillStyle = '#94a3b8'
    context.font = '700 16px Arial, sans-serif'
    context.fillText(label, x, metaY)
    context.fillStyle = index === 2 ? '#059669' : '#0f172a'
    context.font = '800 25px Arial, sans-serif'
    context.fillText(value, x, metaY + 38)
  })

  const imageX = cardX + 46
  const imageY = cardY + 155
  const imageW = cardW - 92
  const imageH = 1035
  context.fillStyle = '#e2e8f0'
  context.fillRect(imageX, imageY, imageW, imageH)

  let imageLoaded = false
  if (item.signedUrl) {
    try {
      const loaded = await loadReceiptImage(item.signedUrl)
      const scale = Math.min(imageW / loaded.image.naturalWidth, imageH / loaded.image.naturalHeight)
      const width = loaded.image.naturalWidth * scale
      const height = loaded.image.naturalHeight * scale
      context.fillStyle = '#ffffff'
      context.fillRect(imageX, imageY, imageW, imageH)
      context.drawImage(loaded.image, imageX + (imageW - width) / 2, imageY + (imageH - height) / 2, width, height)
      loaded.release()
      imageLoaded = true
    } catch (error) { console.error(error) }
  }
  if (!imageLoaded) {
    context.fillStyle = '#64748b'
    context.textAlign = 'center'
    context.font = '700 28px Arial, sans-serif'
    context.fillText('Fiş fotoğrafı PDF için açılamadı', imageX + imageW / 2, imageY + imageH / 2)
    context.textAlign = 'left'
  }

  context.fillStyle = '#94a3b8'
  context.font = '700 16px Arial, sans-serif'
  context.fillText('AÇIKLAMA / NOT', imageX, imageY + imageH + 54)
  context.fillStyle = '#334155'
  context.font = '500 21px Arial, sans-serif'
  const noteLines = wrapCanvasText(context, item.note || 'Not eklenmemiş.', imageW).slice(0, 3)
  noteLines.forEach((line, index) => context.fillText(line, imageX, imageY + imageH + 88 + index * 31))

  context.fillStyle = '#64748b'
  context.font = '500 17px Arial, sans-serif'
  context.fillText('Dükkan Kasa Takip tarafından oluşturulmuştur.', 58, 1698)
  context.textAlign = 'right'
  context.fillText(`${pageNumber} / ${pageCount}`, canvas.width - 58, 1698)
  context.textAlign = 'left'

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), imageLoaded }
}

function extensionFor(file) {
  const byType = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }
  return byType[file.type] || file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
}

async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* Older browsers continue with the image element fallback. */ }
  }

  const url = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  try {
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

async function compressReceiptImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Yalnızca fotoğraf dosyası seçebilirsiniz.')
  if (file.size > MAX_SOURCE_SIZE) throw new Error('Fotoğraf çok büyük. Lütfen 20 MB altında bir fotoğraf seçin.')

  if (['image/heic', 'image/heif'].includes(file.type)) {
    if (file.size > MAX_FILE_SIZE) throw new Error('HEIC fotoğrafı 6 MB sınırını aşıyor. Kamera ayarından “En Uyumlu / JPG” seçerek tekrar çekin.')
    return file
  }

  try {
    const decoded = await decodeImage(file)
    const scale = Math.min(1, 1800 / Math.max(decoded.width, decoded.height))
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
      decoded.close()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(decoded.width * scale))
    canvas.height = Math.max(1, Math.round(decoded.height * scale))
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
    decoded.close()

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) throw new Error('Fotoğraf hazırlanamadı.')
    const compressed = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'fis'}.jpg`, { type: 'image/jpeg' })
    const result = compressed.size < file.size ? compressed : file
    if (result.size > MAX_FILE_SIZE) throw new Error('Fotoğraf 6 MB sınırını aşıyor. Daha düşük çözünürlüklü bir fotoğraf seçin.')
    return result
  } catch (error) {
    if (error.message?.includes('MB') || error.message?.includes('hazırlanamadı')) throw error
    if (file.size <= MAX_FILE_SIZE) return file
    throw new Error('Fotoğraf küçültülemedi. Lütfen 6 MB altında JPG veya PNG seçin.')
  }
}

function mapReceipt(row, signedUrl = '') {
  return {
    id: row.id,
    date: row.receipt_date,
    merchant: row.merchant || '',
    category: row.category || 'Diğer',
    amount: Number(row.amount) || 0,
    note: row.note || '',
    filePath: row.file_path,
    fileName: row.original_file_name || 'Fiş fotoğrafı',
    mimeType: row.mime_type || 'image/jpeg',
    fileSize: Number(row.file_size) || 0,
    createdAt: row.created_at,
    signedUrl,
  }
}

export default function Receipts({ loading, setLoading, notify }) {
  const emptyForm = { date: localDate(), merchant: '', category: 'Mal / Malzeme', amount: '', note: '' }
  const today = new Date()
  const [receipts, setReceipts] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [viewing, setViewing] = useState(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const fileInputRef = useRef(null)
  const formRef = useRef(null)

  const loadReceipts = useCallback(async ({ quiet = false } = {}) => {
    const { data, error } = await supabase.from('receipts').select('*')
      .order('receipt_date', { ascending: false }).order('created_at', { ascending: false })
    if (error) throw error

    const rows = data || []
    const paths = rows.map(row => row.file_path).filter(Boolean)
    let signedByPath = new Map()
    if (paths.length) {
      const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60)
      if (signedError) console.error(signedError)
      else signedByPath = new Map((signed || []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl]))
    }

    setReceipts(rows.map(row => mapReceipt(row, signedByPath.get(row.file_path) || '')))
    if (!quiet) notify('Fiş arşivi güncellendi.')
  }, [notify])

  useEffect(() => {
    loadReceipts({ quiet: true }).catch(error => { console.error(error); notify('Fiş arşivi yüklenemedi.') })
    const channel = supabase.channel('ortak-fis-arsivi-react').on(
      'postgres_changes', { event: '*', schema: 'public', table: 'receipts' },
      () => loadReceipts({ quiet: true }).catch(console.error),
    ).subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadReceipts, notify])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const years = useMemo(() => {
    const values = new Set([today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1])
    receipts.forEach(item => values.add(Number(item.date.slice(0, 4))))
    return [...values].sort((a, b) => b - a)
  }, [receipts])

  const visibleReceipts = useMemo(() => receipts.filter(item => {
    const [itemYear, itemMonth] = item.date.split('-').map(Number)
    const matchesPeriod = itemYear === Number(year) && itemMonth === Number(month)
    const haystack = [item.merchant, item.category, item.note, item.fileName].join(' ').toLocaleLowerCase('tr')
    return matchesPeriod && (!search || haystack.includes(search.toLocaleLowerCase('tr')))
  }), [receipts, year, month, search])

  const periodReceipts = useMemo(() => receipts.filter(item => {
    const [itemYear, itemMonth] = item.date.split('-').map(Number)
    return itemYear === Number(year) && itemMonth === Number(month)
  }), [receipts, year, month])
  const total = periodReceipts.reduce((sum, item) => sum + item.amount, 0)
  const average = periodReceipts.length ? total / periodReceipts.length : 0

  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))

  const selectFile = selected => {
    if (!selected) return
    if (!selected.type.startsWith('image/')) return notify('Lütfen bir fotoğraf dosyası seçin.')
    if (selected.size > MAX_SOURCE_SIZE) return notify('Fotoğraf 20 MB sınırını aşıyor.')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
  }

  const resetForm = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setForm({ ...emptyForm, date: localDate() })
    setFile(null)
    setPreviewUrl('')
    setEditingId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const startEdit = item => {
    setEditingId(item.id)
    setForm({ date: item.date, merchant: item.merchant, category: item.category, amount: String(item.amount), note: item.note })
    setFile(null)
    setPreviewUrl('')
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const submit = async event => {
    event.preventDefault()
    const amount = Number(form.amount)
    if (!form.merchant.trim()) return notify('Fişin alındığı firma veya işletmeyi yazın.')
    if (!Number.isFinite(amount) || amount < 0) return notify('Geçerli bir fiş tutarı girin.')
    if (!editingId && !file) return notify('Fiş fotoğrafını çekin veya galeriden seçin.')

    setLoading(true)
    let uploadedPath = ''
    try {
      if (editingId) {
        const { error } = await supabase.from('receipts').update({
          receipt_date: form.date,
          merchant: form.merchant.trim().slice(0, 120),
          category: form.category,
          amount,
          note: form.note.trim().slice(0, 300),
          updated_at: new Date().toISOString(),
        }).eq('id', editingId).select('id').single()
        if (error) throw error
      } else {
        const prepared = await compressReceiptImage(file)
        const id = crypto.randomUUID()
        const extension = extensionFor(prepared)
        uploadedPath = `${form.date.slice(0, 4)}/${form.date.slice(5, 7)}/${id}.${extension}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(uploadedPath, prepared, {
          cacheControl: '3600', contentType: prepared.type || 'image/jpeg', upsert: false,
        })
        if (uploadError) throw uploadError

        const { error: insertError } = await supabase.from('receipts').insert({
          id,
          receipt_date: form.date,
          merchant: form.merchant.trim().slice(0, 120),
          category: form.category,
          amount,
          note: form.note.trim().slice(0, 300),
          file_path: uploadedPath,
          original_file_name: file.name.slice(0, 180),
          mime_type: prepared.type || 'image/jpeg',
          file_size: prepared.size,
        }).select('id').single()
        if (insertError) {
          await supabase.storage.from(BUCKET).remove([uploadedPath])
          uploadedPath = ''
          throw insertError
        }
      }

      const message = editingId ? 'Fiş bilgileri güncellendi.' : 'Fiş fotoğrafı ortak arşive kaydedildi.'
      resetForm()
      await loadReceipts({ quiet: true })
      notify(message)
    } catch (error) {
      console.error(error)
      if (uploadedPath) await supabase.storage.from(BUCKET).remove([uploadedPath])
      notify(error.message || (editingId ? 'Fiş güncellenemedi.' : 'Fiş yüklenemedi.'))
    } finally { setLoading(false) }
  }

  const remove = async item => {
    if (!confirm(`${item.merchant || 'Bu fiş'} kaydını ve fotoğrafını kalıcı olarak silmek istiyor musunuz?`)) return
    setLoading(true)
    try {
      const { error } = await supabase.from('receipts').delete().eq('id', item.id).select('id').single()
      if (error) throw error
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([item.filePath])
      if (storageError) console.error(storageError)
      if (editingId === item.id) resetForm()
      if (viewing?.id === item.id) setViewing(null)
      await loadReceipts({ quiet: true })
      notify('Fiş kaydı ve fotoğrafı silindi.')
    } catch (error) {
      console.error(error)
      notify('Fiş silinemedi. Lütfen tekrar deneyin.')
    } finally { setLoading(false) }
  }

  const exportPdf = async () => {
    if (!periodReceipts.length) return notify('PDF oluşturmak için bu ayda en az bir fiş olmalı.')
    setPdfGenerating(true)
    setLoading(true)
    try {
      const paths = periodReceipts.map(item => item.filePath).filter(Boolean)
      const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 15 * 60)
      if (signedError) throw signedError
      const signedByPath = new Map((signed || []).filter(item => item.signedUrl).map(item => [item.path, item.signedUrl]))
      const exportItems = periodReceipts.map(item => ({ ...item, signedUrl: signedByPath.get(item.filePath) || item.signedUrl }))
      const periodLabel = `${MONTHS[Number(month) - 1]} ${year}`
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
      let missingImages = 0

      for (let index = 0; index < exportItems.length; index += 1) {
        if (index > 0) pdf.addPage('a4', 'portrait')
        const page = await renderReceiptPage(exportItems[index], periodLabel, index + 1, exportItems.length)
        if (!page.imageLoaded) missingImages += 1
        pdf.addImage(page.dataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST')
      }

      pdf.save(`fis-arsivi-${year}-${String(month).padStart(2, '0')}.pdf`)
      notify(missingImages
        ? `PDF indirildi. ${missingImages} fotoğraf açılamadı; bilgileri PDF'e eklendi.`
        : `${exportItems.length} fiş tek PDF dosyası olarak indirildi.`)
    } catch (error) {
      console.error(error)
      notify(error.message || 'Fiş PDF dosyası oluşturulamadı.')
    } finally {
      setPdfGenerating(false)
      setLoading(false)
    }
  }

  return <>
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="eyebrow">DİJİTAL ARŞİV</p><h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Fiş Arşivi</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Fişin fotoğrafını çekin, tutarını ve kalemini kaydedin; tüm cihazlardan aynı arşive ulaşın.</p></div>
      <div className="grid grid-cols-2 gap-2"><select aria-label="Fiş yılı" className="field w-full sm:w-28" value={year} onChange={event => setYear(event.target.value)}>{years.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Fiş ayı" className="field w-full sm:w-36" value={month} onChange={event => setMonth(event.target.value)}>{MONTHS.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}</select></div>
    </div>

    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <StatCard icon={ReceiptText} label="Kayıtlı fiş" value={`${periodReceipts.length} adet`} tone="emerald" />
      <StatCard icon={Banknote} label="Fiş toplamı" value={money(total)} tone="blue" />
      <StatCard icon={CalendarDays} label="Ortalama fiş" value={money(average)} tone="violet" />
    </div>

    <section ref={formRef} className="panel overflow-hidden scroll-mt-20">
      <div className="border-b border-slate-100 p-5 sm:p-6"><p className="eyebrow">{editingId ? 'FİŞ DÜZENLEME' : 'YENİ FİŞ'}</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{editingId ? 'Fiş bilgilerini düzenle' : 'Fotoğrafını çek ve kaydet'}</h2></div>
      <form onSubmit={submit}>
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(260px,.8fr)_1.5fr]">
          <div>
            {editingId ? <div className="grid min-h-56 place-items-center rounded-2xl border border-blue-200 bg-blue-50 p-6 text-center"><div><Pencil className="mx-auto text-blue-600" size={34} /><strong className="mt-3 block text-sm text-blue-900">Bilgileri düzenliyorsunuz</strong><p className="mt-2 text-xs leading-5 text-blue-700">Mevcut fotoğraf korunur. Fotoğrafı değiştirmek için kaydı silip yeniden ekleyebilirsiniz.</p></div></div> : <div className={`relative grid min-h-64 place-items-center overflow-hidden rounded-2xl border-2 border-dashed transition ${previewUrl ? 'border-emerald-400 bg-slate-950' : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40'}`}>
              {previewUrl ? <><img src={previewUrl} alt="Seçilen fiş ön izlemesi" className="absolute inset-0 size-full object-contain" /><div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-950/75 p-3 text-white backdrop-blur"><span className="min-w-0 truncate text-xs font-semibold">{file?.name}</span><button type="button" onClick={() => fileInputRef.current?.click()} className="ml-3 shrink-0 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold">Değiştir</button></div></> : <button type="button" onClick={() => fileInputRef.current?.click()} className="p-7 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"><Camera size={27} /></div><strong className="mt-4 block text-sm text-slate-800">Fiş fotoğrafı çek</strong><span className="mt-1 block text-xs leading-5 text-slate-500">Kamerayı açın veya galeriden seçin<br />JPG, PNG, WEBP veya HEIC • En fazla 6 MB</span></button>}
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={event => selectFile(event.target.files?.[0])} />
            </div>}
            {!editingId && <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><ShieldCheck className="mt-0.5 shrink-0" size={17} /> Fotoğraf özel depoda saklanır ve yalnızca giriş yapan kasa kullanıcıları görebilir.</div>}
          </div>

          <div className="grid content-start gap-4 sm:grid-cols-2">
            <Field label="Fiş tarihi"><input className="field" type="date" required value={form.date} onChange={event => set('date', event.target.value)} /></Field>
            <Field label="Kategori"><select className="field" value={form.category} onChange={event => set('category', event.target.value)}>{CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></Field>
            <Field label="Firma / İşletme"><input className="field" maxLength="120" required value={form.merchant} onChange={event => set('merchant', event.target.value)} placeholder="Örn. Toptancı, market" /></Field>
            <Field label="Fiş tutarı"><div className="relative"><Banknote className="absolute left-3.5 top-3.5 text-slate-400" size={19} /><input className="field pl-11" type="number" inputMode="decimal" min="0" step="0.01" required value={form.amount} onChange={event => set('amount', event.target.value)} placeholder="0,00" /></div></Field>
            <Field label="Açıklama / Not" className="sm:col-span-2"><textarea className="field min-h-28 resize-y py-3" maxLength="300" value={form.note} onChange={event => set('note', event.target.value)} placeholder="Fişteki ürünler veya hatırlamak istediğiniz bilgi" /></Field>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs leading-5 text-slate-500"><strong className="text-slate-700">Bilgi:</strong> Fiş arşivi ana ciro ve net kasa hesabını değiştirmez.</p>
          <div className="flex gap-2">{editingId && <button type="button" disabled={loading} onClick={resetForm} className="btn-secondary flex-1 sm:flex-none"><X size={18} /> Vazgeç</button>}<button type="submit" disabled={loading} className="btn-primary flex-1 sm:flex-none">{editingId ? <Pencil size={18} /> : <Upload size={18} />} {editingId ? 'Değişiklikleri Kaydet' : 'Fişi Arşive Kaydet'}</button></div>
        </div>
      </form>
    </section>

    <section className="panel mt-5 overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between sm:p-6"><div><p className="eyebrow">KAYITLAR</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">{MONTHS[Number(month) - 1]} {year} fişleri</h2><p className="mt-1 text-xs text-slate-400">Seçili ayın tüm fiş fotoğraflarını tek PDF dosyasında alın.</p></div><div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"><div className="relative min-w-0 flex-1 sm:w-72"><Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} /><input className="field pl-11" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Firma, kategori veya not ara" /></div><button type="button" onClick={exportPdf} disabled={!periodReceipts.length || pdfGenerating || loading} className="btn-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"><FileDown size={18} /> {pdfGenerating ? 'PDF Hazırlanıyor...' : 'Aylık PDF İndir'}</button></div></div>
      {visibleReceipts.length ? <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">{visibleReceipts.map(item => <ReceiptCard key={item.id} item={item} view={() => setViewing(item)} edit={() => startEdit(item)} remove={() => remove(item)} />)}</div> : <EmptyState />}
    </section>

    {viewing && <ReceiptModal item={viewing} close={() => setViewing(null)} edit={() => { setViewing(null); startEdit(viewing) }} remove={() => remove(viewing)} />}
  </>
}

function Field({ label, children, className = '' }) {
  return <label className={className}><span className="field-label">{label}</span>{children}</label>
}

function StatCard({ icon: Icon, label, value, tone }) {
  const tones = { emerald: 'bg-emerald-50 text-emerald-600', blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600' }
  return <article className="panel flex items-center gap-4 p-4 sm:p-5"><div className={`grid size-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon size={21} /></div><div><small className="block text-xs font-semibold text-slate-400">{label}</small><strong className="mt-1 block text-lg font-extrabold text-slate-900">{value}</strong></div></article>
}

function ReceiptCard({ item, view, edit, remove }) {
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
    <button type="button" onClick={view} className="relative block aspect-[4/3] w-full overflow-hidden bg-slate-100 text-left">{item.signedUrl ? <img src={item.signedUrl} alt={`${item.merchant} fişi`} loading="lazy" className="size-full object-cover transition duration-300 hover:scale-[1.02]" /> : <span className="grid size-full place-items-center text-slate-400"><FileImage size={38} /></span>}<span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">{item.category}</span></button>
    <div className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm text-slate-900">{item.merchant || 'Fiş'}</strong><small className="mt-1 block text-slate-400">{displayDate(item.date)}</small></div><strong className="shrink-0 text-sm text-emerald-600">{money(item.amount)}</strong></div>{item.note && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{item.note}</p>}<div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><small className="text-[10px] text-slate-400">{formatBytes(item.fileSize)}</small><div className="flex gap-1"><button type="button" aria-label="Fişi görüntüle" title="Görüntüle" onClick={view} className="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><ExternalLink size={17} /></button><button type="button" aria-label="Fişi düzenle" title="Düzenle" onClick={edit} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"><Pencil size={17} /></button><button type="button" aria-label="Fişi sil" title="Sil" onClick={remove} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={17} /></button></div></div></div>
  </article>
}

function ReceiptModal({ item, close, edit, remove }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="Fiş fotoğrafı"><button type="button" aria-label="Pencereyi kapat" onClick={close} className="absolute inset-0" /><div className="relative z-10 flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid lg:grid-cols-[1.35fr_.65fr]"><div className="grid min-h-[45vh] place-items-center overflow-auto bg-slate-950 p-3 sm:p-5">{item.signedUrl ? <img src={item.signedUrl} alt={`${item.merchant} fişi`} className="max-h-[75vh] max-w-full object-contain" /> : <div className="text-center text-slate-400"><FileImage className="mx-auto" size={48} /><p className="mt-3 text-sm">Fotoğraf açılamadı.</p></div>}</div><aside className="overflow-y-auto p-5 sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">FİŞ DETAYI</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">{item.merchant || 'Fiş'}</h2></div><button type="button" onClick={close} className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><X size={20} /></button></div><dl className="mt-6 space-y-4 text-sm"><Detail label="Tarih" value={displayDate(item.date)} /><Detail label="Kategori" value={item.category} /><Detail label="Tutar" value={money(item.amount)} strong /><Detail label="Not" value={item.note || '—'} /><Detail label="Dosya" value={`${item.fileName} • ${formatBytes(item.fileSize)}`} /></dl><div className="mt-7 grid gap-2"><a href={item.signedUrl || '#'} target="_blank" rel="noreferrer" className={`btn-primary ${!item.signedUrl ? 'pointer-events-none opacity-50' : ''}`}><ExternalLink size={18} /> Fotoğrafı Tam Boy Aç</a><button type="button" onClick={edit} className="btn-secondary"><Pencil size={18} /> Bilgileri Düzenle</button><button type="button" onClick={remove} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-600 hover:bg-red-100"><Trash2 size={18} /> Fişi Sil</button></div></aside></div></div>
}

function Detail({ label, value, strong = false }) {
  return <div className="rounded-xl bg-slate-50 p-3.5"><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt><dd className={`mt-1 break-words ${strong ? 'text-lg font-extrabold text-emerald-600' : 'font-semibold text-slate-700'}`}>{value}</dd></div>
}

function EmptyState() {
  return <div className="py-16 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><ImagePlus size={26} /></div><h3 className="mt-4 text-sm font-bold text-slate-700">Bu ay için fiş bulunamadı</h3><p className="mt-1 text-xs text-slate-400">İlk fiş fotoğrafını yukarıdaki alandan ekleyebilirsiniz.</p></div>
}
