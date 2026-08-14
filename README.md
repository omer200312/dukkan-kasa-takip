# Dükkan Kasa Takip

GitHub Pages üzerinde çalışan, Supabase ile cihazlar arasında ortak günlük gelir-gider takip uygulaması.

Gelir kanalları: Nakit, POS / Kart, POS %1 ve Yemek Kartı / Online.

## GitHub Pages'ta yayınlama

1. Bu klasördeki `index.html`, `styles.css` ve `app.js` dosyalarını GitHub deponuzun ana dizinine yükleyin.
2. GitHub deposunda **Settings → Pages** bölümünü açın.
3. **Deploy from a branch**, ardından `main` ve `/ (root)` seçeneklerini seçip kaydedin.

Veriler Supabase üzerindeki ortak kasada tutulur. İlk çevrim içi girişte bu tarayıcıda eski yerel kayıtlar varsa Supabase'e aktarılır. Uygulamadaki **Yedekle** düğmesiyle ayrıca JSON yedeği indirilebilir.

## Kullanıcı hesabı

Kullanıcı hesapları Supabase Auth bölümünden yönetilir. Uygulamada kayıt olma özelliği güvenlik amacıyla kapalıdır. Supabase'te oluşturulan tüm kullanıcılar, Row Level Security kuralları kapsamında aynı ortak kasa kayıtlarını görür ve düzenler.

Varsayılan kullanıcı adı `omerfaruk` olarak tanımlanmıştır. Uygulama kullanıcı adını Supabase tarafında `kullaniciadi@dukkan-kasa.local` biçimine dönüştürür.

İlk hazır kullanıcı: `omerfaruk`. Güvenlik için ilk yayımdan sonra başlangıç şifresini değiştirecek çevrimiçi kullanıcı yönetimi eklenmelidir.
