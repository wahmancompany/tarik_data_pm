// Netlify Function: tarik-data (tanpa dependency / zero-dep)
// Token diambil dari Environment Variable MENTOR_AUTH_TOKEN (rahasia, hanya admin).
// Mengembalikan data PM yang sudah diringkas per teknisi (JSON). Excel dibuat di halaman.

const BALI_NAMES = ["Nancy Riyani Ridwan","Mohamad Iqbal Septiana","Muhammad Zainur Rokhim","Komang Sumerta","Gede Susila Dharma","Dikanio Dwi Septi","Ida Bagus Gede Darma Putra","I Kadek Jepri","Sartika","I Gede Budhi Sanjaya","Vita Martha Diana","Zulkarnain","Rahmat Fitriadi","Komang Merta","Ngakan Nyoman Darmayasa","Raizzal Ahmad Weikiansyah","Made Mahendra Putra","I Made Edy Tiro Sugiarta","Ni Luh Putu Lidya Sarita Dewi","Laila Muluda Yani","Aldi Eka Putra","Alfatah Suparno","Fakhri Hidayat","Sesilia Febriyanti Dila Alli","Muhammad Maimum Alfan","I Dewa Made Putra Juniarta","Fikri Rahmadi Indrawan","I Nyoman Wandi Dwiparwata","Imamah Syamsiah","Ni Putu Eka Wijayati","Al Asaril Fatoni","Mochamad Chaisar Arif Rozak","Adriansyah Putra Widitama","Erwin Raniar","Ni Kadek Widya Sari","Ryan Hidayatullah","Ade Ravi Putra Arya"];
const NUSRA_NAMES = ["Hardyhansyah Abdul Adjid Mekeseer","Nurhasin","Januarius Natonis","Yordant Bonbalan","Muhammad Noor Taufik","Junaidy Bastian Dama","Videlis Bala","Irmansyah","Julamdo Harter Katta","Selamun","Imam Mahdin","Marthen Jakobus Ludji","Ulul Arham","Zidan Maulana","Adi Putra Imanuel Lede","Loudric Junino Pratama Lapenangga","Ferdisitas Dam Fayon","Iwan Suryadi Saputra","Nazwir Kahfi","Aleander Servani Onggo","BOT BALI DISMANTLE"];

const PAGE_SIZE = 1500;

function monthRange() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const start = y + '-' + pad(m + 1) + '-01';
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const end = y + '-' + pad(m + 1) + '-' + pad(lastDay);
  return { start, end };
}

// Tanggal hari ini di zona WIB (+07:00), sesuai format done_date dari MENTOR.
function todayWIB() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function buildUrl(page) {
  const { start, end } = monthRange();
  const u = new URL('https://memo-api.pcsindonesia.com/v2/master/ticket');
  const params = {
    page: String(page), page_size: String(PAGE_SIZE), filter: '', order: 'created_at:-1',
    param: 'sp_id:8', start_date: start, end_date: end, date_field: 'created_at',
    leader_id: '792', is_historical: '0', preload: 'User,InstallTypeTicket'
  };
  Object.entries(params).forEach(([k, v]) => u.searchParams.append(k, v));
  return u.toString();
}

async function fetchAll(token) {
  const headers = { Authorization: token };
  const first = await fetch(buildUrl(1), { headers });
  if (first.status === 401 || first.status === 403) {
    throw new Error('Token tidak valid atau kedaluwarsa. Admin perlu memperbarui token.');
  }
  if (!first.ok) throw new Error('Gagal mengambil data (status ' + first.status + ').');
  const firstData = await first.json();
  const total = firstData.count || 0;
  let all = firstData.data || [];
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages > 1) {
    const reqs = [];
    for (let p = 2; p <= pages; p++) {
      reqs.push(fetch(buildUrl(p), { headers }).then((r) => (r.ok ? r.json() : { data: [] })));
    }
    const results = await Promise.all(reqs);
    for (const d of results) if (d && d.data) all = all.concat(d.data);
  }
  return all;
}

function summarize(rows) {
  const today = todayWIB();
  const pmRows = rows.filter((r) => r.install_type_ticket && r.install_type_ticket.name === 'Preventive Maintenance (PM)');
  const seen = new Set();
  const summary = {};
  for (const r of pmRows) {
    const key = r.subtiket_id + '|' + r.tid;
    if (seen.has(key)) continue;
    seen.add(key);
    const tek = (r.User && r.User.name) || 'Unknown';
    const ddRaw = r.done_date ? String(r.done_date).trim() : '';
    const done = ddRaw.length > 0;
    if (!summary[tek]) summary[tek] = { onProgress: 0, pending: 0, done: 0, doneToday: 0, total: 0 };
    summary[tek].onProgress += done ? 0 : 1;
    summary[tek].done += done ? 1 : 0;
    if (done && ddRaw.slice(0, 10) === today) summary[tek].doneToday += 1;
    summary[tek].total += 1;
  }
  const agg = (names) => Object.entries(summary)
    .filter(([t]) => names.includes(t))
    .map(([t, c]) => ({ teknisi: t, onProgress: c.onProgress, pending: c.pending, done: c.done, doneToday: c.doneToday, total: c.total, pctDone: c.total > 0 ? Math.round((c.done / c.total) * 100) : 0 }))
    .sort((a, b) => b.pctDone - a.pctDone)
    .map((r, i) => ({ ...r, no: i + 1 }));
  return { bali: agg(BALI_NAMES), nusra: agg(NUSRA_NAMES), today };
}

exports.handler = async function () {
  const token = process.env.MENTOR_AUTH_TOKEN;
  if (!token) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'MENTOR_AUTH_TOKEN belum diatur di Environment Variables Netlify.' }) };
  }
  try {
    const rows = await fetchAll(token);
    const data = summarize(rows);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) };
  }
};
