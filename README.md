# Dükkan Kasa Takip

GitHub Pages üzerinde çalışabilen, kurulum gerektirmeyen günlük gelir-gider takip uygulaması.

Gelir kanalları: Nakit, POS / Kart, POS %1 ve Yemek Kartı / Online.

## GitHub Pages'ta yayınlama

1. Bu klasördeki `index.html`, `styles.css` ve `app.js` dosyalarını GitHub deponuzun ana dizinine yükleyin.
2. GitHub deposunda **Settings → Pages** bölümünü açın.
3. **Deploy from a branch**, ardından `main` ve `/ (root)` seçeneklerini seçip kaydedin.

Veriler tarayıcının yerel depolamasında tutulur. Düzenli olarak uygulamadaki **Yedekle** düğmesiyle JSON yedeği indirin.

## Kullanıcı hesabı

İlk açılışta **Yeni kullanıcı oluştur** seçeneğiyle kullanıcı adı ve şifre belirleyin. Şifre düz metin olarak kaydedilmez. Aynı tarayıcıda oluşturulan bütün kullanıcılar aynı ortak kasa kayıtlarını görür ve düzenler. Kullanıcı hesapları ve kasa verileri kullanılan tarayıcıya özeldir; tarayıcı verileri silinirse hesaplar ve kayıtlar da silinir. Farklı cihazlarda ortak kasa kullanımı için çevrimiçi veritabanı ve sunucu tabanlı kimlik doğrulama gerekir.

İlk hazır kullanıcı: `omerfaruk`. Güvenlik için ilk yayımdan sonra başlangıç şifresini değiştirecek çevrimiçi kullanıcı yönetimi eklenmelidir.
