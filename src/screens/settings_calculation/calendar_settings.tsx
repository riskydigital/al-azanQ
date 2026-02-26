import {t} from '@lingui/macro';
import {HStack, FormControl, IStackProps, Select, Switch, VStack, Input} from 'native-base';
import {useState, useEffect} from 'react'; // Tambahkan ini
import {useSettings} from '@/store/settings';
import {updateWidgets} from '@/tasks/update_widgets';
import {useNoInitialEffect} from '@/utils/hooks/use_no_initial_effect';

export function CalendarSettings(props: IStackProps) {
  const [arabicCalendar, setArabicCalendar] = useSettings('SELECTED_ARABIC_CALENDAR');
  const [useCustomHilal, setUseCustomHilal] = useSettings('USE_CUSTOM_HILAL_CRITERIA');
  const [minAltitude, setMinAltitude] = useSettings('HILAL_MIN_ALTITUDE');
  const [minElongation, setMinElongation] = useSettings('HILAL_MIN_ELONGATION');

  // SOLUSI KEYBOARD: Gunakan penampung sementara agar titik desimal tidak loncat
  const [altText, setAltText] = useState(minAltitude.toString());
  const [elongText, setElongText] = useState(minElongation.toString());

  // Pastikan penampung selalu sinkron jika data gudang berubah
  useEffect(() => { setAltText(minAltitude.toString()); }, [minAltitude]);
  useEffect(() => { setElongText(minElongation.toString()); }, [minElongation]);

  useNoInitialEffect(() => {
    updateWidgets();
  }, [arabicCalendar, useCustomHilal, minAltitude, minElongation]);

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
                keyboardType="decimal-pad" // Paksa munculkan keyboard angka dengan titik desimal
                value={altText}
                onChangeText={setAltText} // Biarkan user ngetik titik dengan bebas
                onEndEditing={() => setMinAltitude(parseFloat(altText) || 0)} // Simpan ke gudang hanya saat selesai ngetik/pindah kotak
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
          </VStack>
        )}
      </FormControl>
    </VStack>
  );
}