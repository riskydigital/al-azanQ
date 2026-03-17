import {t} from '@lingui/macro';
import {ScrollView, IScrollViewProps, Text, HStack, Switch, FormControl} from 'native-base'; // Tambahkan HStack, Switch, FormControl
import {LocationStack} from './location_stack';
import {SafeArea} from '@/components/safe_area';
import {useCalcSettings} from '@/store/calculation';
import {useSettings} from '@/store/settings'; // 🔥 IMPORT GUDANG SETTINGS

export function LocationSettings(props: IScrollViewProps) {
	const [location, setLocation] = useCalcSettings('LOCATION');
	const [useLiveGps, setUseLiveGps] = useSettings('USE_LIVE_GPS'); // 🔥 AMBIL SAKLAR MUDIK
	
	return (
    <SafeArea>
	<ScrollView
	p="4"
	_contentContainerStyle={{paddingBottom: 40}}
	{...props}
	keyboardShouldPersistTaps="handled">
	
	{/* 🔥 SAKLAR LIVE GPS (MUDIK MODE) 🔥 */}
	<FormControl mb="4" p="3" borderWidth="1" borderColor="emerald.500" borderRadius="md" bg="emerald.50" _dark={{bg: 'gray.800', borderColor: 'emerald.500'}}>
	<HStack justifyContent="space-between" alignItems="center">
	
	<FormControl.Label _text={{fontWeight: 'bold', color: 'emerald.600', _dark: {color: 'emerald.400'}}}>
	{t`Live GPS (Mudik Mode) 🚗`}
	
	</FormControl.Label>
	<Switch isChecked={useLiveGps} onToggle={setUseLiveGps} colorScheme="emerald" />
	</HStack>
	
	<Text fontSize="xs" mt="1">
	{t`Secara otomatis memperbarui koordinat GPS setiap kali Anda membuka aplikasi. Sangat cocok saat sedang bepergian jauh.
		
		***`}
	</Text>
	
	<Text fontSize="xxs" mt="1" fontWeight="bold">
	{t`Perhatian:`}
	</Text>
	<Text fontSize="xxs" mt="1">
	{t`Untuk menghemat daya Jadwal Sholat di Panel Widget (Jika Anda menggunakan/memasangnya) hanya terupdate setelah halaman utama/beranda tampil.`}
	</Text>
	
	
	</FormControl>
	
	<Text textAlign="justify">{t`To calculate Adhan, We need your location. You can use the "Find My Location" button, or use the country and city/area search, or enter your coordinates manually.`}</Text>
	
	<LocationStack
	onLocationSelected={setLocation}
	selectedLocation={location}
	/>
	</ScrollView>
</SafeArea>
);
}