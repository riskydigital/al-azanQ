import {t} from '@lingui/macro';
import {Button, HStack, ScrollView, Stack, Text, Box} from 'native-base'; // Tambahkan Box
import {useCallback, useEffect, useMemo, useState} from 'react'; // Tambahkan useState
import {AppState} from 'react-native';
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
	
	const location = useStore(calcSettings, s => s.LOCATION);
	const prayerTimes = useMemo(() => getPrayerTimes(currentDate), [currentDate]);
	
	const [hilalInfo, setHilalInfo] = useState<HilalInfo | null>(null);
	const [hilalDebug, setHilalDebug] = useState<string>("Inisialisasi awal...");
	const [autoAdjustment, setAutoAdjustment] = useState<number>(0);
	const [tmDebug, setTmDebug] = useState<string>("TM: Loading...");
	
	// 🔥 AMBIL SAKLAR DAN ANGKA DARI GUDANG SETTINGS
	const useCustomHilal = useStore(settings, s => s.USE_CUSTOM_HILAL_CRITERIA);
	const minAltitude = useStore(settings, s => s.HILAL_MIN_ALTITUDE);
	const minElongation = useStore(settings, s => s.HILAL_MIN_ELONGATION);
	// ---------------------------------------------------
	
	// 🔥 ALARM PENDETEKSI MAGHRIB REAL-TIME
	const [isPastMaghrib, setIsPastMaghrib] = useState(false);
	
	useEffect(() => {
		if (!prayerTimes?.maghrib) return;
		
		// Fungsi untuk "Melihat Jam Dinding"
		const checkTime = () => {
			const maghribTime = prayerTimes.maghrib.getTime();
			const now = Date.now();
			setIsPastMaghrib(now >= maghribTime);
		};
		
		// 1. Cek langsung saat aplikasi pertama dibuka
		checkTime();
		
		// 2. Pasang alarm untuk pergantian waktu berjalan normal (saat HP dibiarkan menyala)
		const maghribTime = prayerTimes.maghrib.getTime();
		let timer: NodeJS.Timeout;
		if (Date.now() < maghribTime) {
			timer = setTimeout(() => {
				setIsPastMaghrib(true);
			}, maghribTime - Date.now());
		}
		
		// 3. SENSOR KESADARAN: Bangun & cek ulang saat user kembali dari Settings!
		const subscription = AppState.addEventListener('change', nextAppState => {
			if (nextAppState === 'active') {
				checkTime();
			}
		});
		
		return () => {
			if (timer) clearTimeout(timer);
			subscription.remove();
		};
	}, [prayerTimes]);
	
	const day = useMemo(
	// Masukkan isPastMaghrib ke dalam memo
	() => getDayDetails(currentDate, prayerTimes?.maghrib, autoAdjustment, isPastMaghrib),
	[currentDate, prayerTimes, autoAdjustment, isPastMaghrib] 
	);
	// 🔥 PELATUK SINKRONISASI WIDGET PAKSA 🔥
	// Setiap kali tanggal Arab berubah atau waktu melewati Maghrib, paksa Widget untuk update!
	useEffect(() => {
		updateWidgets().catch((err) => console.log("Gagal update widget:", err));
	}, [day.arabicDate, isPastMaghrib]);
	// ----------------------------------------
	
	// 1. ---  DASBOR HILAL (AWARENESS HARI ESOK)  ---
	useEffect(() => {
		const lat = location?.lat;
		const lon = location?.long;
		
		// 🔥 LOMPATAN WAKTU: Jika sudah lewat Maghrib, kita teropong hilal untuk BESOK sore!
		let targetObservationDate = new Date(currentDate);
		if (isPastMaghrib) {
			targetObservationDate.setDate(targetObservationDate.getDate() + 1);
		}
		
		const targetPrayerTimes = getPrayerTimes(targetObservationDate);
		const maghrib = targetPrayerTimes?.maghrib;
		
		if (!lat || !lon || !maghrib) return;
		
		try {
			const maghribDate = new Date(maghrib);
			if (isNaN(maghribDate.getTime())) return;
			
			const data = getHilalData(maghribDate, lat, lon);
            
			const currentAlt = Number(data?.altitude ?? data?.alt ?? data?.moonAltitude ?? 0);
			const currentElong = Number(data?.elongation ?? data?.elong ?? data?.moonElongation ?? 0);
			
			const targetAlt = Number(minAltitude) || 0;
			const targetElong = Number(minElongation) || 0;
			
			data.isMabimsEligible = (currentAlt >= targetAlt) && (currentElong >= targetElong);
            
			setHilalInfo(data);
			setHilalDebug(`Target Tgl: ${targetObservationDate.getDate()} | Alt:${currentAlt.toFixed(2)}° >= Tgt:${targetAlt}° ? ${data.isMabimsEligible}`); 
			
			} catch (error: any) {
			setHilalDebug("Error Dasbor: " + (error.message || "Unknown error"));
		}
		// Wajib pantau isPastMaghrib di sini!
	}, [currentDate, isPastMaghrib, prayerTimes, location, minAltitude, minElongation]);
	
// 2. --- HILAL ---
	useEffect(() => {
		if (!useCustomHilal) {
			setAutoAdjustment(0);
			setTmDebug("TM: OFF (Standar Global)");
			return;
		}

		const lat = location?.lat;
		const lon = location?.long;
		if (!lat || !lon) return;

		try {
			// Pastikan pakai tipe kalender yang dipilih user
			const calendarType = impactfulSettings.SELECTED_ARABIC_CALENDAR || 'islamic';
			const formatter = new Intl.DateTimeFormat(`en-US-u-ca-${calendarType}`, { day: 'numeric' });
			
			// 1. Tancapkan Jangkar: Mundur 4 bulan ke belakang untuk mencari tanggal 1 Hijriah
			let anchorDate = new Date(currentDate);
			anchorDate.setHours(12, 0, 0, 0); 
			anchorDate.setMonth(anchorDate.getMonth() - 4); 
			anchorDate.setDate(1); 

			let guard = 0;
			while (guard < 60) {
				if (parseInt(formatter.format(anchorDate), 10) === 1) break;
				anchorDate.setDate(anchorDate.getDate() + 1);
				guard++;
			}

			// 2. Jalan Maju (Forward Simulation) mencari Awal Bulan MABIMS saat ini
			let mabimsStart = new Date(anchorDate);
			let currentTarget = new Date(currentDate);
			currentTarget.setHours(12, 0, 0, 0);

			let safety = 0;
			let lastAlt = 0; let lastElong = 0;

			while (safety < 6) { 
				let day29 = new Date(mabimsStart);
				day29.setDate(day29.getDate() + 28); // Lompat ke hari ke-29

				const pt = getPrayerTimes(day29);
				let maghrib = pt?.maghrib || new Date(day29.setHours(18, 0, 0, 0));

				// Teropong Hilal
				const hilal = getHilalData(maghrib, lat, lon);
				const alt = Number(hilal?.altitude ?? hilal?.alt ?? hilal?.moonAltitude ?? 0);
				const elong = Number(hilal?.elongation ?? hilal?.elong ?? hilal?.moonElongation ?? 0);
				const tgtAlt = Number(minAltitude) || 0;
				const tgtElong = Number(minElongation) || 0;

				const isVisible = (alt >= tgtAlt) && (elong >= tgtElong);
				const monthLength = isVisible ? 29 : 30;

				let nextMonthStart = new Date(mabimsStart);
				nextMonthStart.setDate(nextMonthStart.getDate() + monthLength);

				// Jika bulan depan sudah melewati hari ini, STOP! Kita temukan bulannya.
				if (currentTarget.getTime() < nextMonthStart.getTime()) {
					lastAlt = alt; lastElong = elong;
					break;
				}
				mabimsStart = nextMonthStart;
				safety++;
			}

			// 3. Hitung hari ini MABIMS tanggal berapa
			const diffTime = currentTarget.getTime() - mabimsStart.getTime();
			const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
			const mabimsDay = diffDays + 1;

			// 4. Cari penyesuaian (Adjustment) untuk sinkronisasi sistem
			let bestAdj = 0;
			let found = false;
			for (let adj = -5; adj <= 5; adj++) {
				let testD = new Date(currentTarget);
				testD.setDate(testD.getDate() + adj);
				if (parseInt(formatter.format(testD), 10) === mabimsDay) {
					bestAdj = adj; found = true; break;
				}
			}
			
			// Fallback: Jika kalender HP tidak punya tgl 30 (lompat 29 ke 1), cegah loncat bulan
			if (!found && mabimsDay === 30) {
				for (let adj = -5; adj <= 5; adj++) {
					let testD = new Date(currentTarget);
					testD.setDate(testD.getDate() + adj);
					if (parseInt(formatter.format(testD), 10) === 29) {
						bestAdj = adj; break;
					}
				}
			}

			setTmDebug(`IR: ON | MABIMS Tgl ${mabimsDay} | Adj=${bestAdj}\nAlt 29th: ${lastAlt.toFixed(2)} vs Tgt: ${minAltitude}`);
			setAutoAdjustment(bestAdj);

		} catch (error: any) {
			setTmDebug("TM Error: " + error.message);
			setAutoAdjustment(0);
		}
	}, [currentDate, location, useCustomHilal, minAltitude, minElongation, impactfulSettings.SELECTED_ARABIC_CALENDAR]);
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
	<Text fontSize="md" fontWeight="bold" color="#D4AF37"  textAlign="center">
	Info Hilal MABIMS 🌙
	</Text>
	<Text color="#D4AF37" mb="2" textAlign="center">
	(Saat Maghrib)
	</Text>	
	{/* Tampilkan pesan Debug */}
	{!hilalInfo ? (
		<Text textAlign="center" fontWeight="bold" color="red.500" mt="2">
		⏳ {hilalDebug}
		</Text>
		) : (
		<Box>
		<HStack justifyContent="space-between" mb="1">
		<Text _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Umur Bulan:</Text>
		<Text fontWeight="bold">{hilalInfo.moonAgeHours.toFixed(1)} Jam</Text>
		</HStack>
		
		<HStack justifyContent="space-between" mb="1">
		<Text _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Tinggi Hilal:</Text>
		<Text fontWeight="bold">{hilalInfo.moonAltitude.toFixed(2)}°</Text>
		</HStack>
		
		<HStack justifyContent="space-between" mb="3">
		<Text _light={{color: 'gray.700'}} _dark={{color: 'gray.300'}}>Elongasi:</Text>
		<Text fontWeight="bold">{hilalInfo.elongation.toFixed(2)}°</Text>
		</HStack>
		
		<Divider bg="gray.30" mb="1" />
		
		<Text
		color={hilalInfo.isMabimsEligible ? 'green.600' : 'red.500'}
		fontWeight="bold"
		textAlign="center"
		>
		{hilalInfo.isMabimsEligible 
			? '✅ Maghrib [nanti] memenuhi Syarat (Visibilitas)' 
		: '❌ Belum Terlihat (Istikmal)'}
		</Text>
		</Box>
	)}
	
	<Text
	key={impactfulSettings.SELECTED_ARABIC_CALENDAR}
	fontSize="md"
	textAlign="center">
	{day.arabicDate}
	</Text>
	
	{/* --- DEBUG PRINT--- */}
	<Text textAlign="center" fontSize="xs" color="gray.400" mt="1">
	{/*tmDebug*/}
	</Text>
	{/* ---------------------------------- */}
	</Box>
	
	{/* ---------------------------------- */}
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
		<Text
		borderBottomWidth={1}
		borderColor="muted.300"
		_dark={{
			borderColor: 'muted.500',
		}}>
		{locationText}
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
