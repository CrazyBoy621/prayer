import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';

const DISPLAYED = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

export function timesFor(dateStr, settings) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // Noon keeps the calendar-day components stable regardless of server tz.
  const date = new Date(y, m - 1, d, 12);
  const params = CalculationMethod[settings.method]();
  params.madhab = Madhab[settings.madhab];
  const coordinates = new Coordinates(settings.latitude, settings.longitude);
  const prayerTimes = new PrayerTimes(coordinates, date, params);

  const format = new Intl.DateTimeFormat('en-GB', {
    timeZone: settings.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const times = {};
  const timestamps = {};
  for (const name of DISPLAYED) {
    times[name] = format.format(prayerTimes[name]);
    timestamps[name] = prayerTimes[name].getTime();
  }
  return { times, timestamps };
}
