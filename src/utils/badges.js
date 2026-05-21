export const BADGES = [
  { id:'first_night',  icon:'🌙', title:'First Night',   desc:'Logged your first sleep session' },
  { id:'week_logged',  icon:'7️⃣',  title:'7 Nights',     desc:'Logged 7 sleep sessions' },
  { id:'month_logged', icon:'📅', title:'30 Nights',     desc:'Logged 30 sleep sessions' },
  { id:'perfect_week', icon:'⭐', title:'Perfect Week',  desc:'7 consecutive nights of 7h+ sleep' },
  { id:'consistent',   icon:'🎯', title:'Consistent',    desc:'Same bedtime (±30 min) for 5 nights in a row' },
  { id:'nap_master',   icon:'💤', title:'Nap Master',    desc:'Logged 5 naps' },
  { id:'streak_7',     icon:'🔥', title:'7-Day Streak',  desc:'Completed coaching 7 days in a row' },
  { id:'early_bird',   icon:'🐦', title:'Early Bird',    desc:'Asleep before 11 PM for 5 nights in a row' },
];

export function earnedBadges(log = [], coachingStreak = 0, napLog = []) {
  const earned = new Set();
  const nights = log.filter(e => !e.isNap);

  if (nights.length >= 1)  earned.add('first_night');
  if (nights.length >= 7)  earned.add('week_logged');
  if (nights.length >= 30) earned.add('month_logged');
  if (coachingStreak >= 7) earned.add('streak_7');
  if (napLog.length >= 5)  earned.add('nap_master');

  // Perfect week: 7 consecutive nights with ≥7h
  let run7h = 0;
  for (const e of nights) {
    if (e.sleepEnd - e.sleepStart >= 420) { run7h++; if (run7h >= 7) earned.add('perfect_week'); }
    else run7h = 0;
  }

  // Consistent bedtime: ±30 min for 5 nights in a row
  let consRun = 1;
  for (let i = 1; i < nights.length; i++) {
    const prev = (nights[i-1].sleepStart % 1440 + 1440) % 1440;
    const curr = (nights[i].sleepStart   % 1440 + 1440) % 1440;
    const diff = Math.abs(curr - prev);
    if (Math.min(diff, 1440 - diff) <= 30) {
      consRun++;
      if (consRun >= 5) { earned.add('consistent'); break; }
    } else {
      consRun = 1;
    }
  }

  // Early bird: asleep 20:00–23:00 for 5 nights in a row
  let earlyRun = 0;
  for (const e of nights) {
    const h = ((e.sleepStart % 1440) + 1440) % 1440 / 60;
    if (h >= 20 && h < 23) {
      earlyRun++;
      if (earlyRun >= 5) { earned.add('early_bird'); break; }
    } else {
      earlyRun = 0;
    }
  }

  return BADGES.filter(b => earned.has(b.id));
}
