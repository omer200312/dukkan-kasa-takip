# Dükkan Kasa Takip

React, Tailwind CSS ve Supabase ile hazırlanmış; masaüstü ve mobil cihazlarda çalışan ortak kasa takip uygulaması.

## Özellikler

- Nakit, POS / Kart, POS %1 ve Yemek Kartı / Online gelir takibi
- Kalem kalem gider girişi
- Aylık kontrol paneli ve yıllık rapor
- Supabase ile tüm kullanıcılarda ortak, anlık güncellenen veriler
- CSV dışa aktarma, JSON yedekleme ve yedekten geri yükleme
- Mobil cihazlarda kart görünümü ve alt menü

## Yerel çalıştırma

```bash
pnpm install
pnpm dev
```

Üretim derlemesi için:

```bash
pnpm build
```

## Yayınlama

`main` dalına gönderilen her değişiklik GitHub Actions tarafından derlenir ve `dist` klasörü GitHub Pages'a yayınlanır.

Kullanıcı hesapları Supabase Auth bölümünden yönetilir. Uygulama içinden herkese açık kayıt olma özelliği kapalıdır. Giriş yapan bütün kullanıcılar aynı ortak kasa kayıtlarını görür.
