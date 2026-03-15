import {t} from '@lingui/macro';
import difference from 'lodash/difference';
import { getNextPrayer, getPrayerTimes, Prayer, PrayersInOrder, translatePrayer } from '@/adhan';
import {getActivePrayer} from '@/adhan/utils';
import {isRTL} from '@/i18n';
import {updateScreenWidget} from '@/modules/screen_widget';
import { cancelPermanentNotifWidget, updatePermanentNotifWidget } from '@/notifee';
import {calcSettings} from '@/store/calculation';
import {settings} from '@/store/settings';
import {getArabicDate, getFormattedDate, getTime} from '@/utils/date';
import {getLocationLabel} from '@/utils/location';
import {getHilalData} from '@/utils/hilalCalculator'; // ?? IMPORT MESIN ASTRONOMI

function getCountdownLabel(prayer: Prayer) {
  return t`Remaining till` + ' ' + translatePrayer(prayer) + ': ';
}

export async function updateWidgets() {
  const now = new Date();
  const prayerTimes = getPrayerTimes(now);

  if (!prayerTimes) return;

  const {
    HIDDEN_WIDGET_PRAYERS: hiddenPrayers,
    ADAPTIVE_WIDGETS: adaptiveTheme,
    SHOW_WIDGET_COUNTDOWN: showCountdown,
    HIGHLIGHT_CURRENT_PRAYER,
    WIDGET_CITY_NAME_POS,

    USE_CUSTOM_HILAL_CRITERIA,
    HILAL_MIN_ALTITUDE,
    HILAL_MIN_ELONGATION
  } = settings.getState();

  const location = calcSettings.getState().LOCATION;
  const visiblePrayerTimes = difference(PrayersInOrder, hiddenPrayers);
  let activePrayer: Prayer | undefined = undefined;

  if (prayerTimes && visiblePrayerTimes.length) {
    activePrayer = getActivePrayer(now, visiblePrayerTimes, HIGHLIGHT_CURRENT_PRAYER);
  }

  let countdownLabel: string | null = null;
  let countdownBase: string | null = null;
  if (prayerTimes && showCountdown) {
    if (activePrayer && !HIGHLIGHT_CURRENT_PRAYER) {
      countdownLabel = getCountdownLabel(activePrayer);
      countdownBase = prayerTimes[activePrayer].valueOf().toString();
    } else {
      const next = getNextPrayer({ checkNextDay: true, date: now, prayers: visiblePrayerTimes, useSettings: false });
      if (next) {
        countdownLabel = getCountdownLabel(next.prayer);
        countdownBase = next.date.valueOf().toString();
      }
    }
  }

  const prayers = visiblePrayerTimes.map(
    p => [translatePrayer(p), prayerTimes ? getTime(prayerTimes[p]) : '--:--', p === activePrayer] as [string, string, Boolean],
  );

  if (!isRTL) prayers.reverse();

// 🔥 OPERASI TRANSPLANTASI MESIN WAKTU MABIMS (FORWARD GENERATOR) 🔥
  let autoAdjustment = 0;
  let isPastMaghrib = false;

  if (prayerTimes.maghrib) {
      isPastMaghrib = now.getTime() >= prayerTimes.maghrib.getTime();
  }

  if (USE_CUSTOM_HILAL_CRITERIA && location?.lat && location?.long) {
      try {
          const calendarType = settings.getState().SELECTED_ARABIC_CALENDAR || 'islamic';
          const formatter = new Intl.DateTimeFormat(`en-US-u-ca-${calendarType}`, { day: 'numeric' });

          let anchorDate = new Date(now);
          anchorDate.setHours(12, 0, 0, 0);
          anchorDate.setMonth(anchorDate.getMonth() - 4);
          anchorDate.setDate(1);

          let guard = 0;
          while (guard < 60) {
              if (parseInt(formatter.format(anchorDate), 10) === 1) break;
              anchorDate.setDate(anchorDate.getDate() + 1);
              guard++;
          }

          let mabimsStart = new Date(anchorDate);
          let currentTarget = new Date(now);
          currentTarget.setHours(12, 0, 0, 0);

          let safety = 0;
          while (safety < 6) {
              let day29 = new Date(mabimsStart);
              day29.setDate(day29.getDate() + 28);

              const pt = getPrayerTimes(day29);
              let maghrib = pt?.maghrib || new Date(day29.setHours(18, 0, 0, 0));

              const hilal = getHilalData(maghrib, location.lat, location.long);
              const alt = Number(hilal?.altitude ?? hilal?.alt ?? hilal?.moonAltitude ?? 0);
              const elong = Number(hilal?.elongation ?? hilal?.elong ?? hilal?.moonElongation ?? 0);
              const tgtAlt = Number(HILAL_MIN_ALTITUDE) || 0;
              const tgtElong = Number(HILAL_MIN_ELONGATION) || 0;

              const isVisible = (alt >= tgtAlt) && (elong >= tgtElong);
              const monthLength = isVisible ? 29 : 30;

              let nextMonthStart = new Date(mabimsStart);
              nextMonthStart.setDate(nextMonthStart.getDate() + monthLength);

              if (currentTarget.getTime() < nextMonthStart.getTime()) break;

              mabimsStart = nextMonthStart;
              safety++;
          }

          const diffTime = currentTarget.getTime() - mabimsStart.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          const mabimsDay = diffDays + 1;

          let bestAdj = 0;
          let found = false;
          for (let adj = -5; adj <= 5; adj++) {
              let testD = new Date(currentTarget);
              testD.setDate(testD.getDate() + adj);
              if (parseInt(formatter.format(testD), 10) === mabimsDay) {
                  bestAdj = adj;
                  found = true;
                  break;
              }
          }
          if (!found && mabimsDay === 30) {
              for (let adj = -5; adj <= 5; adj++) {
                  let testD = new Date(currentTarget);
                  testD.setDate(testD.getDate() + adj);
                  if (parseInt(formatter.format(testD), 10) === 29) {
                      bestAdj = adj;
                      break;
                  }
              }
          }
          autoAdjustment = bestAdj;
      } catch (error) {
          console.error("Widget TM Error", error);
      }
  }

  // Terapkan Adjustment ke Tanggal Hijriah Widget
  const hijriTargetDate = new Date(now);
  if (autoAdjustment !== 0) {
      hijriTargetDate.setDate(hijriTargetDate.getDate() + autoAdjustment);
  }

  let topStartText = getArabicDate(hijriTargetDate, isPastMaghrib);
  // ---------------------------------------------------------

  let topEndText = getFormattedDate(now, true);
  let locationName = getLocationLabel(location);

  if (locationName) {
    if (WIDGET_CITY_NAME_POS === 'top_start') {
      topStartText = locationName;
    } else if (WIDGET_CITY_NAME_POS === 'top_end') {
      topEndText = locationName;
    }
  }

  if (settings.getState().SHOW_WIDGET) {
    await updatePermanentNotifWidget({
      topStartText, topEndText, prayers, adaptiveTheme, showCountdown, countdownLabel, countdownBase,
    }).catch(console.error);
  } else {
    await cancelPermanentNotifWidget();
  }

  await updateScreenWidget({
    topStartText, topEndText, prayers, adaptiveTheme, showCountdown, countdownLabel, countdownBase,
  });
}