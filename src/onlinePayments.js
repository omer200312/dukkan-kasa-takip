export const ONLINE_PROVIDERS = [
  { id: 'trendyol_yemek', label: 'Trendyol Yemek', short: 'TY', accent: 'bg-orange-500', soft: 'bg-orange-50 text-orange-700', border: 'border-orange-200' },
  { id: 'migros_yemek', label: 'Migros Yemek', short: 'MY', accent: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
  { id: 'yemeksepeti', label: 'Yemeksepeti', short: 'YS', accent: 'bg-rose-500', soft: 'bg-rose-50 text-rose-700', border: 'border-rose-200' },
  { id: 'multinet', label: 'Multinet', short: 'MN', accent: 'bg-red-500', soft: 'bg-red-50 text-red-700', border: 'border-red-200' },
  { id: 'paye', label: 'Paye', short: 'PY', accent: 'bg-teal-500', soft: 'bg-teal-50 text-teal-700', border: 'border-teal-200' },
  { id: 'metropol', label: 'Metropol', short: 'MP', accent: 'bg-blue-500', soft: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
  { id: 'pluxee', label: 'Pluxee', short: 'PX', accent: 'bg-violet-500', soft: 'bg-violet-50 text-violet-700', border: 'border-violet-200' },
]

export const ONLINE_PROVIDER_MAP = Object.fromEntries(ONLINE_PROVIDERS.map(provider => [provider.id, provider]))

export function mapOnlinePayment(row) {
  return {
    id: row.id,
    date: row.payment_date,
    provider: row.provider,
    amount: Number(row.amount) || 0,
    description: row.description || '',
    note: row.note || '',
    createdAt: new Date(row.created_at).getTime(),
  }
}

export function onlineProviderTotals(records) {
  const totals = Object.fromEntries(ONLINE_PROVIDERS.map(provider => [provider.id, 0]))
  records.forEach(record => { totals[record.provider] = (totals[record.provider] || 0) + record.amount })
  return totals
}

export const onlineGrandTotal = records => records.reduce((total, record) => total + record.amount, 0)
