//import { Coordinates, CalculationMethod, PrayerTimes } from 'adhan';
import { getHijriDay } from '@/utils/date';
import {clearCache} from '@/store/adhan_calc_cache';
import LocationProvider from 'react-native-get-location';
import {t} from '@lingui/macro';
import {Button, HStack, ScrollView, Stack, Text, Box} from 'native-base';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {AppState, Linking} from 'react-native';
import {getHilalData, HilalInfo} from '@/utils/hilalCalculator';
import {updateWidgets} from '@/tasks/update_widgets';
import {
	Gesture,
	GestureDetector,
	Directions,
	GestureHandlerRootView,
} from 'react-native-gesture-handler';
import {runOnJS} from 'react-native-reanimated';
import {useStore} from 'zustand';
import {shallow} from 'zustand/shallow';
import {getPrayerTimes} from '@/adhan';
import {AddCircleIcon} from '@/assets/icons/material_icons/add_circle';
import {ExploreIcon} from '@/assets/icons/material_icons/explore';
import {RestoreIcon} from '@/assets/icons/material_icons/restore';
import {SettingsSharpIcon} from '@/assets/icons/material_icons/settings_sharp';
import {UpdateIcon} from '@/assets/icons/material_icons/update';
import Divider from '@/components/Divider';
import PrayerTimesBox from '@/components/PrayerTimesBox';
import {SafeArea} from '@/components/safe_area';
import {isRTL} from '@/i18n';

import {navigate} from '@/navigation/root_navigation';

import {translateRoute} from '@/navigation/types';
import {SettingsWasImportedKey} from '@/screens/settings_backup/import_settings';
import {calcSettings} from '@/store/calculation';
import {homeStore} from '@/store/home';
import {settings} from '@/store/settings';
import {deleteItem, getItem} from '@/store/simple';

import {getArabicDate, getDayName, getFormattedDate} from '@/utils/date';
import {showBatteryOptimizationReminder} from '@/utils/dialogs';
import {useNoInitialEffect} from '@/utils/hooks/use_no_initial_effect';
import {getLocationLabel} from '@/utils/location';
import {askPermissions} from '@/utils/permission';
import {shouldShowRamadanNotice, showRamadanAlert} from '@/utils/ramadan';

type DayDetails = {
	dateString: string;
	dayName: string;
	arabicDate: string;
};

// Helper JDN & Ijtima (Identik dengan logika PTCQ.java)
const dateToJDN = (d: number, m: number, y: number) => {
    let year = y, month = m;
    if (month <= 2) { year--; month += 12; }
    const a = Math.floor(year / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + d + b - 1524.5;
};

// Helper Pencarian Ijtima' (Murni)
const calculateIjtimaBefore = (jd: number) => {
    const date = new Date((jd - 2440587.5) * 86400000);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    let k = Math.floor((y + (m - 0.5) / 12.0 - 2000.0) * 12.3685);
    let t = k / 1236.85;
    let jde = 2451550.09765 + 29.530588853 * k + 0.0001337 * t * t - 0.00000015 * t * t * t;
    while (jde > jd) {
        k -= 1; t = k / 1236.85;
        jde = 2451550.09765 + 29.530588853 * k + 0.0001337 * t * t;
	}
    return jde; // Mengembalikan JDN Ijtima (UT)
};

// Helper Astronomi Murni untuk Sunset Sabang (Bypass Library Adhan)
const getAccurateMaghrib = (targetDate: Date, lat: number, lon: number): Date => {
    const rad = Math.PI / 180;
    const start = new Date(targetDate.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((targetDate.getTime() - start.getTime()) / 86400000);
	
    // Deklinasi Matahari & Equation of Time
    const B = rad * (360 / 365) * (dayOfYear - 81);
    const declination = 23.45 * Math.sin(B);
    const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
	
    const latRad = lat * rad;
    const decRad = declination * rad;
    const altRad = -0.833 * rad; // Refraksi atmosfer saat Sunset standar
    
    const cosH0 = (Math.sin(altRad) - Math.sin(latRad) * Math.sin(decRad)) / (Math.cos(latRad) * Math.cos(decRad));
	
    // Jika terjadi anomali (kutub), fallback ke 18:00
    if (cosH0 < -1 || cosH0 > 1) return new Date(targetDate.setHours(18, 0, 0, 0));
	
    const H0 = Math.acos(cosH0) / rad;
    const sunsetUTC = 12 - (lon / 15) + (H0 / 15) - (EoT / 60);
	
    const result = new Date(targetDate);
    result.setUTCHours(Math.floor(sunsetUTC));
    result.setUTCMinutes(Math.floor((sunsetUTC % 1) * 60));
    result.setUTCSeconds(0);
	
    return result;
};

// Tambahkan isPastMaghrib sebagai parameter ke-4
function getDayDetails(date: Date, maghribTime?: Date, autoAdjustment: number = 0, isPastMaghrib: boolean = false): DayDetails {
    const hijriTargetDate = new Date(date);
    if (autoAdjustment !== 0) {
        hijriTargetDate.setDate(hijriTargetDate.getDate() + autoAdjustment);
	}
    
    return {
        dayName: getDayName(date),
        dateString: getFormattedDate(date),
        arabicDate: getArabicDate(hijriTargetDate, isPastMaghrib), 
	};
}

export function Home() {
	const {
		currentDate,
		increaseCurrentDateByOne,
		decreaseCurrentDateByOne,
		resetCurrentDate,
		isNotToday,
	} = useStore(
    homeStore,
    state => ({
		currentDate: state.date,
		isNotToday: state.isNotToday,
		increaseCurrentDateByOne: state.increaseCurrentDateByOne,
		decreaseCurrentDateByOne: state.decreaseCurrentDateByOne,
		resetCurrentDate: state.resetCurrentDate,
	}),
    shallow,
	);
	
	const impactfulSettings = useStore(
    settings,
    s => ({
		NUMBERING_SYSTEM: s.NUMBERING_SYSTEM,
		SELECTED_ARABIC_CALENDAR: s.SELECTED_ARABIC_CALENDAR,
		SELECTED_SECONDARY_CALENDAR: s.SELECTED_SECONDARY_CALENDAR,
		CALC_SETTINGS_HASH: s.CALC_SETTINGS_HASH,
		HIDDEN_PRAYERS: s.HIDDEN_PRAYERS,
		DELIVERED_ALARM_TIMESTAMPS: s.DELIVERED_ALARM_TIMESTAMPS,
		HIGHLIGHT_CURRENT_PRAYER: s.HIGHLIGHT_CURRENT_PRAYER,
	}),
    shallow,
	);
	
	
	// 1. Ambil Pengaturan Nasional dari Store
	const useNationalDateCalc = useStore(settings, s => s.USE_NATIONAL_DATE_CALC);
	const zeroKmLat = useStore(settings, s => s.NATIONAL_ZERO_KM_LAT);
	const zeroKmLon = useStore(settings, s => s.NATIONAL_ZERO_KM_LON);
	
	// 2. Tambahkan State untuk Info Hilal Nasional
	const [hilalInfoNational, setHilalInfoNational] = useState<HilalInfo | null>(null);
	
	
	const location = useStore(calcSettings, s => s.LOCATION);
	const prayerTimes = useMemo(() => getPrayerTimes(currentDate), [currentDate, location]);
	const [hilalInfo, setHilalInfo] = useState<HilalInfo | null>(null);
	const [hilalDebug, setHilalDebug] = useState<string>("Inisialisasi awal...");
	const [autoAdjustment, setAutoAdjustment] = useState<number>(0);
	const [absoluteMabimsDay, setAbsoluteMabimsDay] = useState<number>(0);
	const [tmDebug, setTmDebug] = useState<string>("TM: Loading...");
	// 🔥 STATE KHUSUS UNTUK TEKS SATELIT (TIER 1)
	const [liveCoords, setLiveCoords] = useState<{lat: number, long: number} | null>(null);
	
	// 🔥 AMBIL SAKLAR DAN ANGKA DARI GUDANG SETTINGS
	const useCustomHilal = useStore(settings, s => s.USE_CUSTOM_HILAL_CRITERIA);
	const minAltitude = useStore(settings, s => s.HILAL_MIN_ALTITUDE);
	const minElongation = useStore(settings, s => s.HILAL_MIN_ELONGATION);

	// 🔥 PENGATURAN KOMPENSASI TOPO-GEO BMKG
	// Tambahkan fallback default jika pengaturan belum diset oleh user
	const useTopoGeoCompensation = useStore(settings, s => s.USE_TOPO_GEO_COMPENSATION ?? true);
	const compensationAltitude = useStore(settings, s => s.COMPENSATION_ALTITUDE ?? -0.05);
	const compensationElongation = useStore(settings, s => s.COMPENSATION_ELONGATION ?? 0.65);

	// Resolusi nilai kalibrasi secara reaktif berdasarkan status saklar On/Off
	const BMKG_CALIBRATION = useMemo(() => {
		return {
			altitude: useTopoGeoCompensation ? Number(compensationAltitude) : 0,
			elongation: useTopoGeoCompensation ? Number(compensationElongation) : 0,
		};
	}, [useTopoGeoCompensation, compensationAltitude, compensationElongation]);
	// ---------------------------------------------------
	
	// 🔥 ALARM PENDETEKSI MAGHRIB REAL-TIME & LIVE GPS 🔥
	const [isPastMaghrib, setIsPastMaghrib] = useState(false);
	
	
	// 🔥 PENGATUR LABEL INSTAN (Saat Saklar Mudik Dinyalakan/Dimatikan) 🔥
	const useLiveGps = useStore(settings, s => s.USE_LIVE_GPS);
	
	useEffect(() => {
		const currentLoc = calcSettings.getState().LOCATION;
		
		if (useLiveGps) {
			// 1. Jika mode mudik DINYALAKAN, langsung timpa labelnya detik itu juga!
			if (currentLoc && currentLoc.label !== '📍 Live GPS (Mudik)') {
				calcSettings.getState().setSetting('LOCATION', {
					...currentLoc,
					label: '📍 Live GPS (Mudik)',
				});
			}
			} else {
			// 2. Jika mode mudik DIMATIKAN, sembunyikan satelit & hapus label palsunya
			setLiveCoords(null); 
			if (currentLoc && currentLoc.label === '📍 Live GPS (Mudik)') {
				const { label, ...restLoc } = currentLoc; 
				calcSettings.getState().setSetting('LOCATION', restLoc);
			}
		}
	}, [useLiveGps]); // Efek ini HANYA meledak saat saklar disentuh
	
	// 🔥 RADAR TIER 1 (UI) & TIER 2 (KALKULASI 5KM) 🔥
	useEffect(() => {
		const checkTime = () => {
			const realToday = new Date();
			const ptToday = getPrayerTimes(realToday);
			const maghribTodayTime = ptToday?.maghrib?.getTime();
			
			if (maghribTodayTime) {
				setIsPastMaghrib(Date.now() >= maghribTodayTime);
			}
		};
		
		const checkLocation = () => {
			if (useLiveGps) {
				LocationProvider.getCurrentPosition({
					enableHighAccuracy: true, timeout: 15000,
					}).then(loc => {
					setLiveCoords({ lat: loc.latitude, long: loc.longitude });
					const prevLoc = calcSettings.getState().LOCATION;
					const latDiff = Math.abs((prevLoc?.lat || 0) - loc.latitude);
					const lonDiff = Math.abs((prevLoc?.long || 0) - loc.longitude);
					
					if (latDiff > 0.05 || lonDiff > 0.05) {
						clearCache();
						calcSettings.getState().setSetting('LOCATION', {
							lat: loc.latitude, long: loc.longitude, label: '📍 Live GPS (Mudik)',
						});
					}
				}).catch((err) => console.log("Live GPS No Signal", err));
			}
		};
		
		checkTime();
		checkLocation();
		
		const realToday = new Date();
		const ptToday = getPrayerTimes(realToday);
		const maghribTodayTime = ptToday?.maghrib?.getTime() || 0;
		let timer: NodeJS.Timeout;
		
		if (maghribTodayTime && Date.now() < maghribTodayTime) {
			timer = setTimeout(() => setIsPastMaghrib(true), maghribTodayTime - Date.now());
		}
		
		const subscription = AppState.addEventListener('change', nextAppState => {
			if (nextAppState === 'active') {
				checkTime();
				checkLocation();
			}
		});
		
		const interval = setInterval(() => {
			checkTime();
			checkLocation();
		}, 1 * 60 * 1000); 
		
		return () => {
			if (timer) clearTimeout(timer);
			clearInterval(interval);
			subscription.remove();
		};
		// 🔥 PASTIKAN: isNotToday ATAU currentDate TIDAK ADA DI DALAM ARRAY INI!
	}, [useLiveGps]);
	
	const day = useMemo(() => {
		const details = getDayDetails(currentDate, prayerTimes?.maghrib, autoAdjustment, isPastMaghrib);
		// 🔥 UI PATCH: Menampilkan 30 dengan aman tanpa freeze!
		if (useCustomHilal && absoluteMabimsDay === 30) {
			details.arabicDate = details.arabicDate.replace('29', '30').replace('٢٩', '٣٠');
		}
		return details;
	}, [currentDate, prayerTimes, autoAdjustment, isPastMaghrib, useCustomHilal, absoluteMabimsDay]);
	
	const currentHijriDayStr = useMemo(() => {
		const targetDate = new Date(currentDate);
		if (autoAdjustment !== 0) {
			targetDate.setDate(targetDate.getDate() + autoAdjustment);
		}
		let str = getHijriDay(targetDate, isPastMaghrib);
		// 🔥 UI PATCH untuk string murni
		if (useCustomHilal && absoluteMabimsDay === 30) {
			str = str.replace('29', '30').replace('٢٩', '٣٠');
		}
		return str;
	}, [currentDate, autoAdjustment, isPastMaghrib, useCustomHilal, absoluteMabimsDay]);
	
	
	const isHilalWatchDay = useMemo(() => {
		return currentHijriDayStr.includes('29') || 
		currentHijriDayStr.includes('30') || 
		currentHijriDayStr.includes('٢٩') || 
		currentHijriDayStr.includes('٣٠');
	}, [currentHijriDayStr]);
	// 🔥 TAMBAHKAN DETEKTOR AYYAMUL BIDH DI SINI 🔥
	// 4. Detektor Ayyamul Bidh (13, 14, 15)
	const isAyyamulBidh = useMemo(() => {
		const d = currentHijriDayStr;
		return d.includes('13') || d.includes('14') || d.includes('15') || 
		d.includes('١٣') || d.includes('١٤') || d.includes('١٥');
	}, [currentHijriDayStr]);
	
	// 🔥 PELATUK SINKRONISASI WIDGET PAKSA 🔥
	useEffect(() => {
		updateWidgets().catch((err) => console.log("Gagal update widget:", err));
		// Tambahkan location di sini agar saat mudik, Widget ikut ter-refresh!
	}, [day.arabicDate, isPastMaghrib, location]);
	// ----------------------------------------
	
	// 1. ---  DASHBOARD HILAL (AWARENESS HARI ESOK)  ---
	useEffect(() => {
		const lat = location?.lat;
		const lon = location?.long;
		
		let targetObservationDate = new Date(currentDate);
		if (isPastMaghrib) {
			targetObservationDate.setDate(targetObservationDate.getDate() + 1);
		}
		
		const targetPrayerTimes = getPrayerTimes(targetObservationDate);
		const maghribLocal = targetPrayerTimes?.maghrib;
		
		if (!lat || !lon || !maghribLocal) return;
		
		try {
			const targetAlt = Number(minAltitude) || 0;
			const targetElong = Number(minElongation) || 0;
			
			// ==========================================
			// A. HITUNG HILAL LOKASI REAL (LOKAL)
			// ==========================================
			const localData = getHilalData(new Date(maghribLocal), lat, lon);
			
			// Terapkan Kalibrasi BMKG
			const currentAlt = Number(localData?.altitude ?? localData?.alt ?? localData?.moonAltitude ?? 0) + BMKG_CALIBRATION.altitude;
			const currentElong = Number(localData?.elongation ?? localData?.elong ?? localData?.moonElongation ?? 0) + BMKG_CALIBRATION.elongation;
			
			// Tulis ulang nilai agar UI menampilkannya dengan benar
			localData.moonAltitude = currentAlt;
			localData.elongation = currentElong;
			localData.isMabimsEligible = (currentAlt >= targetAlt) && (currentElong >= targetElong);
			setHilalInfo(localData);
			
			// ==========================================
			// B. HITUNG HILAL TITIK 0 KM (NASIONAL)
			// ==========================================
			const maghribNational = getAccurateMaghrib(targetObservationDate, Number(zeroKmLat), Number(zeroKmLon));
			
			const nationalData = getHilalData(maghribNational, zeroKmLat, zeroKmLon);
			
			// Terapkan Kalibrasi BMKG
			const natAlt = Number(nationalData?.altitude ?? nationalData?.alt ?? nationalData?.moonAltitude ?? 0) + BMKG_CALIBRATION.altitude;
			const natElong = Number(nationalData?.elongation ?? nationalData?.elong ?? nationalData?.moonElongation ?? 0) + BMKG_CALIBRATION.elongation;
			
			// Tulis ulang nilai
			nationalData.moonAltitude = natAlt;
			nationalData.elongation = natElong;
			nationalData.isMabimsEligible = (natAlt >= targetAlt) && (natElong >= targetElong);
			setHilalInfoNational(nationalData);
			
			} catch (error: any) {
			setHilalDebug("Error Dasbor: " + (error.message || "Unknown error"));
		}
	}, [currentDate, isPastMaghrib, prayerTimes, location, minAltitude, minElongation, zeroKmLat, zeroKmLon, BMKG_CALIBRATION]);
	
	// 2. --- HILAL ENGINE (MURNI, STABIL, TANPA IJTIMA JDN) ---
	useEffect(() => {
		if (!useCustomHilal) {
			setAutoAdjustment(0);
			return;
		}
		
		const calcLat = useNationalDateCalc ? zeroKmLat : location?.lat;
		const calcLon = useNationalDateCalc ? zeroKmLon : location?.long;
		if (!calcLat || !calcLon) return;
		
		try {
			const calendarType = impactfulSettings.SELECTED_ARABIC_CALENDAR || 'islamic';
			const formatter = new Intl.DateTimeFormat(`en-US-u-ca-${calendarType}`, { day: 'numeric' });
			
			// 🔥 1. JANGKAR MUTLAK: Hitung dari Hari yang SEDANG DILIHAT!
			// Hal ini menjamin navigasi tanggal Anda presisi ke mana pun Anda geser kalendernya
			const viewedDate = new Date(currentDate);
			if (isPastMaghrib) {
				viewedDate.setDate(viewedDate.getDate() + 1);
			}
			viewedDate.setHours(12, 0, 0, 0);
			
			// 2. Cari titik awal 4 bulan yang lalu
			let anchorDate = new Date(viewedDate);
			anchorDate.setMonth(anchorDate.getMonth() - 4);
			anchorDate.setDate(1);
			
			let guard = 0;
			while (guard < 60) {
				if (parseInt(formatter.format(anchorDate), 10) === 1) break;
				anchorDate.setDate(anchorDate.getDate() + 1);
				guard++;
			}
			
			// 3. Simulasi Maju ala MABIMS
			let mabimsStart = new Date(anchorDate);
			let safety = 0;
			let lastAlt = 0;
			
			while (safety < 6) {
				let day29 = new Date(mabimsStart);
				day29.setDate(day29.getDate() + 28);
				
				let maghrib;
				if (useNationalDateCalc && zeroKmLat && zeroKmLon) {
					// Gunakan Helper Astronomi untuk Maghrib Sabang
					maghrib = getAccurateMaghrib(day29, Number(zeroKmLat), Number(zeroKmLon));
					} else {
					// Gunakan Maghrib Lokal
					const ptLocal = getPrayerTimes(day29);
					maghrib = ptLocal?.maghrib || new Date(day29.setHours(18, 0, 0, 0));
				}
				
				const hilal = getHilalData(maghrib, calcLat, calcLon);
				
				// 🔥 TERAPKAN KALIBRASI KE MESIN PENANGGALAN
				const alt = Number(hilal?.altitude ?? hilal?.alt ?? hilal?.moonAltitude ?? 0) + BMKG_CALIBRATION.altitude;
				const elong = Number(hilal?.elongation ?? hilal?.elong ?? hilal?.moonElongation ?? 0) + BMKG_CALIBRATION.elongation;
				
				const isVisible = (alt >= (Number(minAltitude) || 0)) && (elong >= (Number(minElongation) || 0));
				const monthLength = isVisible ? 29 : 30;
				
				let nextMonthStart = new Date(mabimsStart);
				nextMonthStart.setDate(nextMonthStart.getDate() + monthLength);
				
				// Break jika sudah melewati atau pas di hari yang DI-VIEW
				if (viewedDate.getTime() < nextMonthStart.getTime()) {
					lastAlt = alt;
					break;
				}
				mabimsStart = nextMonthStart;
				safety++;
			}
			
			// 4. Hitung MABIMS hari yang dilihat
			const diffTime = viewedDate.getTime() - mabimsStart.getTime();
			const mabimsDay = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
			setAbsoluteMabimsDay(mabimsDay); // Nilai ini akan memberi tahu UI jika tanggal adalah 30
			
			// 5. Cari Adjustment Murni
			let bestAdj = 0;
			let found = false;
			for (let adj = -5; adj <= 5; adj++) {
				let testD = new Date(viewedDate);
				testD.setDate(testD.getDate() + adj);
				if (parseInt(formatter.format(testD), 10) === mabimsDay) {
					bestAdj = adj; found = true; break;
				}
			}
			
			if (!found && mabimsDay === 30) {
				for (let adj = -5; adj <= 5; adj++) {
					let testD = new Date(viewedDate);
					testD.setDate(testD.getDate() + adj);
					// Jika MABIMS=30, paksa Android mencetak 29 (nanti ditimpa oleh UI Patch kita di atas)
					if (parseInt(formatter.format(testD), 10) === 29) {
						bestAdj = adj; break;
					}
				}
			}
			
			setTmDebug(`IR: ON | MABIMS Tgl ${mabimsDay} | Adj=${bestAdj}\nAlt 29th: ${lastAlt.toFixed(2)} vs Tgt: ${minAltitude}`);
			setAutoAdjustment(bestAdj);
			
			} catch (error: any) {
			setAutoAdjustment(0);
		}
	// 🔥 PENTING: Pelatuk ini WAJIB diisi dengan currentDate dan isPastMaghrib
	}, [currentDate, isPastMaghrib, location, useCustomHilal, minAltitude, minElongation, useNationalDateCalc, impactfulSettings.SELECTED_ARABIC_CALENDAR, BMKG_CALIBRATION]);
	// ---------------------------------
	
	useEffect(() => {
		askPermissions().finally(async () => {
			if (getItem(SettingsWasImportedKey)) {
				await showBatteryOptimizationReminder().then(() => {
					deleteItem(SettingsWasImportedKey);
				});
			}
			if (shouldShowRamadanNotice()) {
				showRamadanAlert();
			}
		});
	}, []);
	
	useNoInitialEffect(() => {
		resetCurrentDate();
	}, [impactfulSettings, resetCurrentDate]);
	
	const goToLocations = useCallback(() => navigate('FavoriteLocations'), []);
	const goToMonthlyView = useCallback(() => navigate('MonthlyView'), []);
	
	const locationText = useMemo(() => getLocationLabel(location), [location]);
	
	const flingLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
		runOnJS(increaseCurrentDateByOne)();
	});
	const flingRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
		runOnJS(decreaseCurrentDateByOne)();
	});
	
	return (
    <SafeArea>
	<GestureHandlerRootView style={{flex: 1}}>
	<GestureDetector gesture={flingLeft}>
	<GestureDetector gesture={flingRight}>
	<ScrollView>
	<Stack flex={1} alignItems="stretch" pb="4">
	<HStack
	mb="-3"
	px="3"
	justifyContent="space-between"
	alignItems="center">
	<Text py="1" onPress={goToMonthlyView} flex={1}>
	{day.dateString}
	</Text>
	<HStack alignItems="center">
	<Button
	accessibilityLabel={translateRoute('QadaCounter')}
	p="2"
	marginLeft="3"
	variant="ghost"
	onPress={() => {
		navigate('QadaCounter');
	}}>
	<AddCircleIcon size="2xl" />
	</Button>
	<Button
	accessibilityLabel={translateRoute('QiblaFinder')}
	p="2"
	variant="ghost"
	onPress={() => {
		navigate('QiblaFinder');
	}}>
	<ExploreIcon size="2xl" />
	</Button>
	<Button
	accessibilityLabel={translateRoute('Settings')}
	p="2"
	marginRight="-3"
	variant="ghost"
	onPress={() => {
		navigate('Settings');
	}}>
	<SettingsSharpIcon size="2xl" />
	</Button>
	</HStack>
	</HStack>
	<Divider
	borderColor="coolGray.300"
	mb="-2"
	_text={{fontWeight: 'bold'}}>
	{day.dayName}
	</Divider>
	<HStack
	mt="2"
	justifyContent="space-between"
	alignItems="center"
	flexWrap="wrap"
	w="100%"
	flexDirection={isRTL ? 'row-reverse' : 'row'}>
	<Button variant="ghost" onPress={decreaseCurrentDateByOne}>
	<Stack
	flexDirection={isRTL ? 'row' : 'row-reverse'}
	alignItems="center">
	<Text fontSize="xs" mx="1">{t`Prev Day`}</Text>
	<RestoreIcon size="xl" />
	</Stack>
	</Button>
	{isNotToday && (
		<Button
		onPress={resetCurrentDate}
		variant="outline"
		py="2"
		px="1"
		flexShrink={1}
		_text={{
			adjustsFontSizeToFit: true,
			fontSize: 'xs',
			minimumFontScale: 0.8,
			noOfLines: 1,
			_light: {
				color: 'primary.700',
			},
			_dark: {
				color: 'primary.300',
			},
		}}
		borderColor="primary.500">
		{t`Show Today`}
		</Button>
	)}
	<Button variant="ghost" onPress={increaseCurrentDateByOne}>
	<Stack
	flexDirection={isRTL ? 'row' : 'row-reverse'}
	alignItems="center">
	<UpdateIcon size="xl" />
	<Text mx="1" fontSize="xs">{t`Next Day`}</Text>
	</Stack>
	</Button>
	</HStack>
	<PrayerTimesBox
	pt="2.5"
	prayerTimes={prayerTimes}
	settings={impactfulSettings}
	/>
	
	<Text
	key={impactfulSettings.SELECTED_ARABIC_CALENDAR}
	fontSize="md"
	textAlign="center">
	{day.arabicDate}
	</Text>
	
	{/* 🔥 UI AYYAMUL BIDH 🔥 */}
	{isAyyamulBidh && (
        <Text fontSize="xs" fontWeight="bold" color="emerald.600" textAlign="center" mt="-1" mb="1" _dark={{color: 'emerald.400'}}>
		✨ Ayyamul Bidh ✨
        </Text>
	)}
	
	{/* --- DASHBOARD HILAL MABIMS --- */}
	<Box
	bg="#FFF8E7" 
	p="4"
	mx="4"
	mt="4"
	borderRadius="md"
	borderWidth={1}
	borderColor="#D4AF37"
	_dark={{ bg: 'gray.800', borderColor: '#D4AF37' }} 
	>
	{/* 🔥 JUDUL DINAMIS 🔥 */}
	<Text fontSize="md" fontWeight="bold" color="#D4AF37"  textAlign="center">
	{isHilalWatchDay ? 'Info Hilal MABIMS 🌙' : 'Info Posisi Bulan 🌙'}
	</Text>
	<Text color="#D4AF37" mb="2" textAlign="center">
	(Saat Maghrib)
	</Text>	
	
	{!hilalInfo ? (
		<Text textAlign="center" fontWeight="bold" color="red.500" mt="2">
		⏳ {hilalDebug}
		</Text>
		) : (
		<Box>
		{/* --- LOKASI SAAT INI (LOKAL) --- */}
		<Text fontWeight="bold" mb="2" _light={{color: 'gray.600'}} _dark={{color: 'gray.400'}}>
		📍 Posisi Real (Lokal)
		</Text>
		<HStack justifyContent="space-between" mb="1">
		<Text fontSize="sm" _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Umur:</Text>
		<Text fontSize="sm" fontWeight="bold">{hilalInfo.moonAgeHours.toFixed(1)} Jam</Text>
		</HStack>
		<HStack justifyContent="space-between" mb="1">
		<Text fontSize="sm" _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Tinggi:</Text>
		<Text fontSize="sm" fontWeight="bold">{hilalInfo.moonAltitude.toFixed(2)}°</Text>
		</HStack>
		<HStack justifyContent="space-between" mb="2">
		<Text fontSize="sm" _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Elongasi:</Text>
		<Text fontSize="sm" fontWeight="bold">{hilalInfo.elongation.toFixed(2)}°</Text>
		</HStack>
		
		{/* --- TITIK 0 KM (NASIONAL) --- */}
		{/* 🔥 UI AKAN HILANG JIKA SAKLAR NASIONAL DIMATIKAN 🔥 */}
		{(hilalInfoNational && useNationalDateCalc) && (
			<>
			<Divider bg="gray.300" my="2" />
			<Text fontWeight="bold" mb="2" _light={{color: 'gray.600'}} _dark={{color: 'gray.400'}}>
			🇮🇩 Titik 0 KM (Ref. Tanggal)
			</Text>
			<HStack justifyContent="space-between" mb="1">
			<Text fontSize="sm" _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Umur:</Text>
			<Text fontSize="sm" fontWeight="bold">{hilalInfoNational.moonAgeHours.toFixed(1)} Jam</Text>
			</HStack>
			<HStack justifyContent="space-between" mb="1">
			<Text fontSize="sm" _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Tinggi:</Text>
			<Text fontSize="sm" fontWeight="bold">{hilalInfoNational.moonAltitude.toFixed(2)}°</Text>
			</HStack>
			<HStack justifyContent="space-between" mb="2">
			<Text fontSize="sm" _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Elongasi:</Text>
			<Text fontSize="sm" fontWeight="bold">{hilalInfoNational.elongation.toFixed(2)}°</Text>
			</HStack>
			</>
		)}
		
		<Divider bg="gray.300" my="2" />
		
		{/* 🔥 STATUS HIDDEN: Hanya tampil di tgl 29 & 30 🔥 */}
		{isHilalWatchDay && (
			<Text
			color={(useNationalDateCalc ? hilalInfoNational?.isMabimsEligible : hilalInfo.isMabimsEligible) ? 'green.600' : 'red.500'}
			fontWeight="bold"
			textAlign="center"
			>
			{(useNationalDateCalc ? hilalInfoNational?.isMabimsEligible : hilalInfo.isMabimsEligible) 
				? '✅ Maghrib [nanti] memenuhi Syarat' 
			: '❌ Belum Terlihat (Istikmal)'}
			</Text>
		)}
		</Box>
	)}
	
	{/* --- DEBUG PRINT--- */}
	<Text textAlign="center" fontSize="xs" color="gray.400" mt="1">
	{/*tmDebug*/}
	</Text>
	</Box>
	{/* --- SELESAI DASHBOARD HILAL --- */}
	
	{location && (
		<Button
		pt="1"
		p="3"
		accessibilityActions={[
			{
				name: 'activate',
				label: t`See favorite locations`,
			},
		]}
		onPress={goToLocations}
		onAccessibilityAction={goToLocations}
		variant="unstyled">
		
		{/* Gunakan Box dengan alignItems center agar teks turun ke bawah dengan rapi */}
		<Box alignItems="center" justifyContent="center">
		<Text
		borderBottomWidth={1}
		borderColor="muted.300"
		_dark={{
			borderColor: 'muted.500',
		}}>
		{locationText}
		</Text>
		
		{/* 🔥 PEMBUKTIAN KOORDINAT LIVE GPS (TIER 1) 🔥 */}
		{useLiveGps && liveCoords && (
			<Text fontSize="2xs" color="emerald.600" mt="1" fontWeight="bold" textAlign="center" _dark={{color: 'emerald.400'}}>
			Satelit: {liveCoords.lat.toFixed(5)}, {liveCoords.long.toFixed(5)}
			</Text>
		)}
		</Box>
		
		</Button>
	)}
	{/* 🔥 TOMBOL MASJID TERDEKAT 🔥 */}
	{location?.lat && location?.long && (
		<Button
		mt="2"
		mb="4"
		mx="12"
		variant="outline"
		colorScheme="emerald"
		borderRadius="full"
		borderWidth={1.5}
		onPress={() => {
			// URL ini sangat ampuh: Jika HP punya Google Maps, dia buka aplikasinya.
			// Jika tidak, dia akan buka di browser bawaan.
			const url = `https://www.google.com/maps/search/masjid+terdekat/@${location.lat},${location.long},14z/data=!3m2!1e3!4b1!4m4!2m3!5m1!10e2!6e1`;
			Linking.openURL(url).catch(() => console.log('Gagal membuka map'));
		}}
		>
		<Text fontWeight="bold" color="emerald.600" _dark={{color: 'emerald.400'}}>
		🕌 Cari Masjid Terdekat
		</Text>
		</Button>
	)}
	</Stack>
	</ScrollView>
	</GestureDetector>
	</GestureDetector>
	</GestureHandlerRootView>
    </SafeArea>
	);
}