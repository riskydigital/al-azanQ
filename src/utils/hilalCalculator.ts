import * as Astronomy from 'astronomy-engine';

export interface HilalInfo {
  ijtimaTime: Date;
  moonAgeHours: number;
  moonAltitude: number;
  elongation: number;
  isMabimsEligible: boolean;
}

/**
 * Menghitung parameter astronomi bulan (Hilal) pada saat Maghrib
 * * @param maghribDate Obyek Date yang tepat menunjukkan jam/menit/detik Maghrib hari ini
 * @param lat Garis Lintang (Latitude) lokasi HP
 * @param lon Garis Bujur (Longitude) lokasi HP
 * @param elevation Ketinggian lokasi dari permukaan laut (default 0 meter)
 * @returns HilalInfo (Ijtima, Umur, Ketinggian, Elongasi, Status MABIMS)
 */
export function getHilalData(
  maghribDate: Date,
  lat: number,
  lon: number,
  elevation: number = 0
): HilalInfo {
  const observer = new Astronomy.Observer(lat, lon, elevation);
  const maghribAstroTime = Astronomy.MakeTime(maghribDate);

  // --- 1. CARI WAKTU IJTIMA' (KONJUNGSI / NEW MOON) ---
  // Kita mundur 30 hari dari Maghrib ini, lalu mencari fase bulan baru (0 derajat) ke depan
  const pastDate = new Date(maghribDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  let ijtimaAstro = Astronomy.SearchMoonPhase(0, pastDate, 35);
  let lastIjtima = ijtimaAstro;

  // Terus cari maju sampai kita menemukan Ijtima' terakhir yang terjadi SEBELUM Maghrib ini
  while (true) {
    // Tambah sedikit waktu agar pencarian maju ke siklus berikutnya
    const nextDateToSearch = new Date(ijtimaAstro.date.getTime() + 1000); 
    const nextIjtima = Astronomy.SearchMoonPhase(0, nextDateToSearch, 35);
    
    if (nextIjtima.date > maghribDate) {
      break; // Jika Ijtima' berikutnya terjadi setelah Maghrib, maka pencarian berhenti
    }
    lastIjtima = nextIjtima;
    ijtimaAstro = nextIjtima;
  }

  const ijtimaTime = lastIjtima.date;

  // --- 2. HITUNG UMUR BULAN ---
  // Selisih antara jam Maghrib dan jam Ijtima' (dalam hitungan Jam)
  const moonAgeMs = maghribDate.getTime() - ijtimaTime.getTime();
  const moonAgeHours = moonAgeMs / (1000 * 60 * 60);

  // --- 3. HITUNG TINGGI HILAL (ALTITUDE) ---
  // Mencari posisi bulan relatif terhadap horizon observer saat Maghrib
  const moonEquator = Astronomy.Equator('Moon', maghribAstroTime, observer, true, true);
  const moonHorizon = Astronomy.Horizon(maghribAstroTime, observer, moonEquator.ra, moonEquator.dec, 'normal');
  const moonAltitude = moonHorizon.altitude;

  // --- 4. HITUNG ELONGASI (JARAK SUDUT MATAHARI & BULAN) ---
  // Jarak sudut pusat piringan matahari ke pusat piringan bulan
  const sunEquator = Astronomy.Equator('Sun', maghribAstroTime, observer, true, true);
  const elongation = Astronomy.AngleBetween(sunEquator.vec, moonEquator.vec);

  // --- 5. DEFAULT EVALUASI KRITERIA MABIMS BARU BISA BERUBAH LIVE SESUAI KONSTANTA SETING---
  // MABIMS mensyaratkan: Tinggi minimal 3 derajat DAN Elongasi minimal 6.4 derajat
  const isMabimsEligible = moonAltitude >= 3 && elongation >= 6.4;

  return {
    ijtimaTime,
    moonAgeHours,
    moonAltitude,
    elongation,
    isMabimsEligible
  };
}