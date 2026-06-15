import {t} from '@lingui/macro';
import {HStack, FormControl, IStackProps, Select, Switch, VStack, Input} from 'native-base';
import {useState, useEffect} from 'react'; 
import {useSettings} from '@/store/settings';
import {updateWidgets} from '@/tasks/update_widgets';
import {useNoInitialEffect} from '@/utils/hooks/use_no_initial_effect';

export function CalendarSettings(props: IStackProps) {
	const [arabicCalendar, setArabicCalendar] = useSettings('SELECTED_ARABIC_CALENDAR');
	const [useCustomHilal, setUseCustomHilal] = useSettings('USE_CUSTOM_HILAL_CRITERIA');
	const [minAltitude, setMinAltitude] = useSettings('HILAL_MIN_ALTITUDE');
	const [minElongation, setMinElongation] = useSettings('HILAL_MIN_ELONGATION');
	
	const [useNationalDate, setNationalDate] = useSettings('USE_NATIONAL_DATE_CALC');
	const [useNationalLat, setNationalLat] = useSettings('NATIONAL_ZERO_KM_LAT');
	const [useNationalLon, setNationalLon] = useSettings('NATIONAL_ZERO_KM_LON');

	// 🔥 1. AMBIL VARIABEL KALIBRASI DARI GUDANG PENGATURAN
	const [useTopoGeo, setUseTopoGeo] = useSettings('USE_TOPO_GEO_COMPENSATION');
	const [compAltitude, setCompAltitude] = useSettings('COMPENSATION_ALTITUDE');
	const [compElongation, setCompElongation] = useSettings('COMPENSATION_ELONGATION');
	
	// SOLUSI KEYBOARD: Gunakan penampung sementara agar titik desimal tidak loncat
	const [altText, setAltText] = useState(minAltitude.toString());
	const [elongText, setElongText] = useState(minElongation.toString());
	
	const [NatLatText, setNatLatText] = useState(useNationalLat.toString());
	const [NatLonText, setNatLonText] = useState(useNationalLon.toString());

	// 🔥 2. PENAMPUNG KEYBOARD UNTUK KALIBRASI KOMPENSASI TOPOGEO
	// Kita set nilai default secara visual jika data di gudang masih kosong
	const [compAltText, setCompAltText] = useState((compAltitude ?? -0.05).toString());
	const [compElongText, setCompElongText] = useState((compElongation ?? 0.65).toString());
	
	// Pastikan penampung selalu sinkron jika data gudang berubah
	useEffect(() => { setAltText(minAltitude.toString()); }, [minAltitude]);
	useEffect(() => { setElongText(minElongation.toString()); }, [minElongation]);
	
	useEffect(() => { setNatLatText(useNationalLat.toString()); }, [useNationalLat]);
	useEffect(() => { setNatLonText(useNationalLon.toString()); }, [useNationalLon]);

	// Sinkronisasi penampung kalibrasi
	useEffect(() => { setCompAltText((compAltitude ?? -0.05).toString()); }, [compAltitude]);
	useEffect(() => { setCompElongText((compElongation ?? 0.65).toString()); }, [compElongation]);
	
	// Pastikan Widget di-refresh saat kalibrasi diubah
	useNoInitialEffect(() => {
		updateWidgets();
	}, [arabicCalendar, useCustomHilal, minAltitude, minElongation, useTopoGeo, compAltitude, compElongation]);
	
	return (
	<VStack space={4} {...props}>
	<FormControl>
	<FormControl.Label>{t`Calendar`}:</FormControl.Label>
	<Select
	accessibilityLabel={t`Choose calendar type`}
	onValueChange={setArabicCalendar}
	selectedValue={arabicCalendar || ''}
	flex="1">
	<Select.Item label={t`Default`} value="" />
	<Select.Item label={t`Islamic`} value="islamic" />
	<Select.Item label={t`Islamic (Umm al-Qura)`} value="islamic-umalqura" />
	<Select.Item label={t`Islamic (tabular)`} value="islamic-tbla" />
	<Select.Item label={t`Islamic (civil)`} value="islamic-civil" />
	<Select.Item label={t`Islamic (Saudi Arabia sighting)`} value="islamic-rgsa" />
	</Select>
	</FormControl>
	
	<FormControl mt="2">
	
	<HStack justifyContent="space-between" alignItems="center">
	<FormControl.Label>{t`Auto-Adjust Hijri (MABIMS / Custom)`}</FormControl.Label>
	<Switch isChecked={useCustomHilal} onToggle={setUseCustomHilal} colorScheme="emerald" />
	</HStack>
	
	<FormControl.HelperText marginBottom={3}>
	{t`Automatically adjusts the calendar based on real-time moon sighting calculations for your GPS location.`}
	</FormControl.HelperText>
	
	{useCustomHilal && (
		<VStack space={3} mt={1} pl={4} borderLeftWidth={2} borderColor="emerald.500">
		<FormControl>
		<FormControl.Label fontSize="sm" color="gray.500">Minimum Altitude (Degrees)</FormControl.Label>
		<Input
		keyboardType="decimal-pad" 
		value={altText}
		onChangeText={setAltText}
		onEndEditing={() => setMinAltitude(parseFloat(altText) || 0)} 
		placeholder="e.g. 3.0"
		size="md"
		/>
		</FormControl>
		<FormControl>
		<FormControl.Label fontSize="sm" color="gray.500">Minimum Elongation (Degrees)</FormControl.Label>
		<Input
		keyboardType="decimal-pad"
		value={elongText}
		onChangeText={setElongText}
		onEndEditing={() => setMinElongation(parseFloat(elongText) || 0)}
		placeholder="e.g. 6.4"
		size="md"
		/>
		</FormControl>

		{/* 🔥 3. UI KOMPENSASI TOPO-GEO  🔥 */}
		<FormControl mt="2">
			<HStack justifyContent="space-between" alignItems="center">
				<FormControl.Label fontSize="sm" color="gray.700" _dark={{color: 'gray.300'}}>Kompensasi Topo-Geo</FormControl.Label>
				{/* Default switch menyala (true) jika nilainya belum pernah diatur (null) */}
				<Switch isChecked={useTopoGeo ?? true} onToggle={setUseTopoGeo} size="sm" colorScheme="emerald" />
			</HStack>
			
			<FormControl.HelperText marginBottom={2} fontSize="2xs">
				Mengonversi elongasi Toposentris (lokal) ke Geosentris.
			</FormControl.HelperText>

			{(useTopoGeo ?? true) && (
				<VStack space={2} mt={1} pl={3} borderLeftWidth={2} borderColor="emerald.300" _dark={{borderColor: 'emerald.700'}}>
					<FormControl>
						<FormControl.Label fontSize="xs" color="gray.500">Kompensasi Ketinggian (Altitude)</FormControl.Label>
						<Input
							keyboardType="numbers-and-punctuation" // Memungkinkan tanda minus (-)
							value={compAltText}
							onChangeText={setCompAltText}
							onEndEditing={() => setCompAltitude(parseFloat(compAltText) || 0)}
							placeholder="e.g. -0.05"
							size="sm"
						/>
					</FormControl>
					<FormControl>
						<FormControl.Label fontSize="xs" color="gray.500">Kompensasi Elongasi</FormControl.Label>
						<Input
							keyboardType="numbers-and-punctuation"
							value={compElongText}
							onChangeText={setCompElongText}
							onEndEditing={() => setCompElongation(parseFloat(compElongText) || 0)}
							placeholder="e.g. 0.65"
							size="sm"
						/>
					</FormControl>
				</VStack>
			)}
		</FormControl>

		</VStack>
	)}
	</FormControl>
	
	<FormControl>
		<HStack justifyContent="space-between" alignItems="center">
			<FormControl.Label>{t`National Date`}</FormControl.Label>
			<Switch isChecked={useNationalDate} onToggle={setNationalDate} colorScheme="emerald" />
		</HStack>

		{useNationalDate && (
			<VStack space={3} mt={1} pl={4} borderLeftWidth={2} borderColor="emerald.500">
				<FormControl>
					<FormControl.Label fontSize="sm" color="gray.500">National Date (Latitude)</FormControl.Label>
					<Input
						keyboardType="numbers-and-punctuation"
						value={NatLatText}
						onChangeText={setNatLatText}
						onEndEditing={() => setNationalLat(parseFloat(NatLatText) || 0)} 
						placeholder="e.g. 5.906105850196853"
						size="md"
					/>
				</FormControl>
				<FormControl>
					<FormControl.Label fontSize="sm" color="gray.500">National Date (Longitude)</FormControl.Label>
					<Input
						keyboardType="numbers-and-punctuation"
						value={NatLonText}
						onChangeText={setNatLonText}
						onEndEditing={() => setNationalLon(parseFloat(NatLonText) || 0)} 
						placeholder="e.g. 95.21688295092682"
						size="md"
					/>
				</FormControl>
			</VStack>
		)}
	</FormControl>
	
	</VStack>
	);
}