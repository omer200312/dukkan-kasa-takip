const SUPABASE_URL = 'https://metbslxdvvnqojrelkfn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BD580x0ix6K0f_pL7dhneA_7HvTeDwE';
const LOCAL_RECORDS_KEY = 'dukkan-kasa-shared-v1';
const CLOUD_MIGRATION_KEY = 'dukkan-kasa-cloud-migrated-v1';
const months = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
let currentUser = '';
let currentAuthUser = null;
let records = [];
let realtimeChannel = null;
let isLoading = false;
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'}).format(Number(value)||0);
const n = id => Number($(id).value)||0;
const today = new Date();

function normalizeUsername(value='') { return value.trim().toLowerCase(); }
function usernameEmail(username) { return `${normalizeUsername(username)}@dukkan-kasa.local`; }
function setBusy(busy) {
  isLoading = busy;
  $('authSubmit').disabled = busy;
  document.querySelectorAll('#transactionForm button, .delete-btn, #restoreBtn').forEach(el => el.disabled = busy);
}
function mapRow(row) {
  return {
    id: row.id,
    date: row.record_date,
    description: row.description || '',
    cash: Number(row.cash) || 0,
    pos: Number(row.pos) || 0,
    pos1: Number(row.pos_one_percent) || 0,
    online: Number(row.online) || 0,
    expenseItem: row.expense_item || '',
    expense: Number(row.expense) || 0,
    note: row.note || '',
    createdAt: new Date(row.created_at).getTime()
  };
}
function toRow(record) {
  return {
    id: isUuid(record.id) ? record.id : crypto.randomUUID(),
    record_date: record.date,
    description: String(record.description || '').slice(0,80),
    cash: Number(record.cash) || 0,
    pos: Number(record.pos) || 0,
    pos_one_percent: Number(record.pos1) || 0,
    online: Number(record.online) || 0,
    expense_item: String(record.expenseItem || '').slice(0,80),
    expense: Number(record.expense) || 0,
    note: String(record.note || '').slice(0,120)
  };
}
function isUuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value)); }
function esc(text=''){ return String(text).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function totals(list){ return list.reduce((a,r)=>{a.cash+=Number(r.cash)||0;a.pos+=Number(r.pos)||0;a.pos1+=Number(r.pos1)||0;a.online+=Number(r.online)||0;a.expense+=Number(r.expense)||0;return a},{cash:0,pos:0,pos1:0,online:0,expense:0}); }
function monthRecords(year,month){ return records.filter(r=>{const [y,m]=r.date.split('-').map(Number);return y===Number(year)&&m===Number(month)}); }
function toast(msg){ const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600); }
function renderAll(){ renderDashboard();renderTransactions();renderReport(); }

async function loadRecords({quiet=false}={}) {
  const { data, error } = await db.from('cash_records').select('*').order('record_date',{ascending:false}).order('created_at',{ascending:false});
  if (error) throw error;
  records = (data || []).map(mapRow);
  renderAll();
  if (!quiet) toast('Ortak kasa güncellendi.');
}
async function migrateLocalRecords() {
  if (localStorage.getItem(CLOUD_MIGRATION_KEY)) return;
  let local = [];
  try { local = JSON.parse(localStorage.getItem(LOCAL_RECORDS_KEY) || '[]'); } catch {}
  if (!Array.isArray(local) || !local.length) {
    localStorage.setItem(CLOUD_MIGRATION_KEY,'1');
    return;
  }
  const rows = local.map(toRow);
  const { error } = await db.from('cash_records').upsert(rows,{onConflict:'id',ignoreDuplicates:true});
  if (error) throw error;
  localStorage.setItem(CLOUD_MIGRATION_KEY,'1');
  toast(`${rows.length} yerel kayıt çevrim içi kasaya aktarıldı.`);
}
function subscribeRealtime() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  realtimeChannel = db.channel('ortak-kasa-degisiklikleri')
    .on('postgres_changes',{event:'*',schema:'public',table:'cash_records'},()=>loadRecords({quiet:true}).catch(showDataError))
    .subscribe();
}
function showDataError(error) {
  console.error(error);
  toast('Çevrim içi kasa bağlantısında sorun oluştu. İnternetinizi kontrol edin.');
}
async function openApp(user) {
  currentAuthUser = user;
  currentUser = user.email?.split('@')[0] || 'kullanıcı';
  $('authScreen').hidden = true;
  document.querySelectorAll('.app-shell').forEach(el=>el.hidden=false);
  $('currentUser').textContent = currentUser;
  setBusy(true);
  try {
    await migrateLocalRecords();
    await loadRecords({quiet:true});
    subscribeRealtime();
  } catch (error) { showDataError(error); }
  finally { setBusy(false); }
}
async function closeApp() {
  if (realtimeChannel) { await db.removeChannel(realtimeChannel); realtimeChannel=null; }
  currentUser='';currentAuthUser=null;records=[];
  document.querySelectorAll('.app-shell').forEach(el=>el.hidden=true);
  $('authScreen').hidden=false;$('authPassword').value='';$('authConfirm').value='';$('authError').textContent='';
}
function showPage(id){ document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav-btn').forEach(x=>x.classList.toggle('active',x.dataset.page===id));window.scrollTo({top:0,behavior:'smooth'});if(id==='dashboard')renderDashboard();if(id==='transactions')renderTransactions();if(id==='reports')renderReport(); }
function renderDashboard(){ const list=monthRecords($('dashYear').value,$('dashMonth').value);const t=totals(list);const revenue=t.cash+t.pos+t.pos1+t.online;const net=revenue-t.expense;$('kpiRevenue').textContent=money(revenue);$('kpiExpense').textContent=money(t.expense);$('kpiNet').textContent=money(net);$('kpiNet').classList.toggle('negative',net<0);$('kpiCount').textContent=list.length;$('cashTotal').textContent=money(t.cash);$('posTotal').textContent=money(t.pos);$('pos1Total').textContent=money(t.pos1);$('onlineTotal').textContent=money(t.online);const latest=[...list].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt).slice(0,5);$('recentList').innerHTML=latest.length?latest.map(r=>{const rev=(Number(r.cash)||0)+(Number(r.pos)||0)+(Number(r.pos1)||0)+(Number(r.online)||0),net=rev-(Number(r.expense)||0);return `<div class="recent-item"><div><strong>${esc(r.description||r.expenseItem||'İşlem')}</strong><small>${new Date(r.date+'T00:00:00').toLocaleDateString('tr-TR')}</small></div><strong class="${net<0?'negative':''}">${money(net)}</strong></div>`}).join(''):'<div class="empty">Bu ay için henüz kayıt yok.</div>'; }
function renderTransactions(){ const q=$('search').value.trim().toLocaleLowerCase('tr');const list=[...records].filter(r=>!q||[r.description,r.expenseItem,r.note,r.date].join(' ').toLocaleLowerCase('tr').includes(q)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);$('transactionRows').innerHTML=list.length?list.map(r=>{const rev=(Number(r.cash)||0)+(Number(r.pos)||0)+(Number(r.pos1)||0)+(Number(r.online)||0),net=rev-(Number(r.expense)||0);return `<tr><td>${new Date(r.date+'T00:00:00').toLocaleDateString('tr-TR')}</td><td><strong>${esc(r.description||'—')}</strong><br><small>${esc(r.note||'')}</small></td><td class="num money-in">${money(rev)}</td><td>${esc(r.expenseItem||'—')}</td><td class="num money-out">${money(r.expense)}</td><td class="num ${net<0?'negative':'money-in'}">${money(net)}</td><td><button class="delete-btn" data-delete="${r.id}">Sil</button></td></tr>`}).join(''):'<tr><td colspan="7" class="empty">Henüz işlem kaydı bulunmuyor.</td></tr>'; }
function renderReport(){ const year=Number($('reportYear').value);let annual={cash:0,pos:0,pos1:0,online:0,expense:0};$('reportRows').innerHTML=months.map((name,i)=>{const t=totals(monthRecords(year,i+1));annual.cash+=t.cash;annual.pos+=t.pos;annual.pos1+=t.pos1;annual.online+=t.online;annual.expense+=t.expense;const rev=t.cash+t.pos+t.pos1+t.online,net=rev-t.expense;return `<tr><td>${name}</td><td class="num">${money(t.cash)}</td><td class="num">${money(t.pos)}</td><td class="num">${money(t.pos1)}</td><td class="num">${money(t.online)}</td><td class="num money-in">${money(rev)}</td><td class="num money-out">${money(t.expense)}</td><td class="num ${net<0?'negative':'money-in'}">${money(net)}</td></tr>`}).join('');const rev=annual.cash+annual.pos+annual.pos1+annual.online,net=rev-annual.expense;$('reportTotal').innerHTML=`<tr><td>YIL TOPLAMI</td><td class="num">${money(annual.cash)}</td><td class="num">${money(annual.pos)}</td><td class="num">${money(annual.pos1)}</td><td class="num">${money(annual.online)}</td><td class="num">${money(rev)}</td><td class="num">${money(annual.expense)}</td><td class="num">${money(net)}</td></tr>`; }
function updateFormSummary(){ const rev=n('cash')+n('pos')+n('pos1')+n('online');$('formRevenue').textContent=money(rev);$('formNet').textContent=money(rev-n('expense')); }
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href);}
function backup(){download(`dukkan-kasa-yedek-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:2,source:'supabase',exportedAt:new Date().toISOString(),records},null,2),'application/json');toast('JSON yedeği indirildi.');}
function exportCsv(){const rows=[['Tarih','Açıklama','Nakit','POS / Kart','POS %1','Yemek Kartı / Online','Gider Kalemi','Gider','Not'],...records.map(r=>[r.date,r.description,r.cash,r.pos,r.pos1||0,r.online,r.expenseItem,r.expense,r.note])];download('dukkan-kasa-kayitlari.csv','\ufeff'+rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n'),'text/csv;charset=utf-8');toast('CSV dosyası indirildi.');}

months.forEach((m,i)=>$('dashMonth').add(new Option(m,i+1)));$('dashYear').value=today.getFullYear();$('dashMonth').value=today.getMonth()+1;$('reportYear').value=today.getFullYear();$('date').value=today.toISOString().slice(0,10);
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.go)));['dashYear','dashMonth'].forEach(id=>$(id).addEventListener('change',renderDashboard));$('reportYear').addEventListener('change',renderReport);['cash','pos','pos1','online','expense'].forEach(id=>$(id).addEventListener('input',updateFormSummary));$('search').addEventListener('input',renderTransactions);
$('transactionForm').addEventListener('submit',async e=>{e.preventDefault();const record={date:$('date').value,description:$('description').value.trim(),cash:n('cash'),pos:n('pos'),pos1:n('pos1'),online:n('online'),expenseItem:$('expenseItem').value.trim(),expense:n('expense'),note:$('note').value.trim()};if(record.cash+record.pos+record.pos1+record.online+record.expense<=0){toast('En az bir tutar girin.');return}if(record.expense>0&&!record.expenseItem){toast('Gider kalemini yazın.');return}setBusy(true);try{const {error}=await db.from('cash_records').insert(toRow(record));if(error)throw error;e.target.reset();$('date').value=record.date;updateFormSummary();await loadRecords({quiet:true});toast('İşlem ortak kasaya kaydedildi.');}catch(error){showDataError(error)}finally{setBusy(false)}});
$('transactionRows').addEventListener('click',async e=>{const id=e.target.dataset.delete;if(!id||!confirm('Bu kaydı ortak kasadan silmek istediğinize emin misiniz?'))return;setBusy(true);try{const {error}=await db.from('cash_records').delete().eq('id',id);if(error)throw error;await loadRecords({quiet:true});toast('Kayıt ortak kasadan silindi.');}catch(error){showDataError(error)}finally{setBusy(false)}});
$('backupBtn').addEventListener('click',backup);$('backupBtn2').addEventListener('click',backup);$('exportCsvBtn').addEventListener('click',exportCsv);$('restoreBtn').addEventListener('click',()=>$('restoreInput').click());
$('restoreInput').addEventListener('change',async e=>{try{const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text());if(!Array.isArray(data.records))throw Error();if(!confirm(`Yedekte ${data.records.length} kayıt var. Ortak kasadaki mevcut kayıtların üzerine yazılsın mı?`))return;setBusy(true);const {error:deleteError}=await db.from('cash_records').delete().not('id','is',null);if(deleteError)throw deleteError;if(data.records.length){const {error:insertError}=await db.from('cash_records').insert(data.records.map(toRow));if(insertError)throw insertError}await loadRecords({quiet:true});toast('Yedek ortak kasaya yüklendi.');}catch(error){console.error(error);toast('Yedek yüklenemedi. Geçerli bir dosya seçin.');}finally{setBusy(false);e.target.value='';}});
$('logoutBtn').addEventListener('click',async()=>{if(!confirm('Oturumu kapatmak istiyor musunuz?'))return;await db.auth.signOut();await closeApp();});
$('authForm').addEventListener('submit',async e=>{e.preventDefault();const username=normalizeUsername($('authUsername').value);const password=$('authPassword').value;$('authError').textContent='';if(!/^[a-z0-9._-]{3,30}$/.test(username)){$('authError').textContent='Kullanıcı adı 3-30 karakter olmalı; küçük harf, sayı, nokta, tire veya alt çizgi kullanılabilir.';return}if(password.length<6){$('authError').textContent='Şifre en az 6 karakter olmalıdır.';return}setBusy(true);try{const {data,error}=await db.auth.signInWithPassword({email:usernameEmail(username),password});if(error)throw error;if(!data.user)throw new Error('Giriş tamamlanamadı.');await openApp(data.user);toast('Giriş başarılı. Ortak kasa açıldı.');}catch(error){console.error(error);$('authError').textContent='Kullanıcı adı veya şifre hatalı.';}finally{setBusy(false)}});

updateFormSummary();
(async()=>{const {data:{session}}=await db.auth.getSession();if(session?.user)await openApp(session.user);else await closeApp();})();
