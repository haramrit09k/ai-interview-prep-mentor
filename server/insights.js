// Turns a user's answer log into progress insights. It is a pure function (rows in,
// object out) so it is cheap to run, needs no model call, and is easy to test.

const SCORE = { correct: 1, partially_correct: 0.5, incorrect: 0, idk: 0 };
const DAY_MS = 24 * 60 * 60 * 1000;

const PACE_LOW = 120;
const PACE_HIGH = 160;

const parseList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Matches the same idea written slightly differently: case, punctuation, "(GC)" asides, "&" versus "and".
const normalizeConcept = (concept) =>
  typeof concept === 'string'
    ? concept
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ') // "Garbage Collection (GC)" -> "garbage collection"
        .replace(/&/g, ' and ')
        .replace(/[-_/]+/g, ' ')
        .replace(/[^\p{L}\p{N}+# ]+/gu, ' ') // keep c++ and c# intact
        .replace(/^(?:the|a|an)\s+/, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

const percent = (fraction) => Math.round(fraction * 100);
const average = (numbers) => (numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null);

/** Calendar day (YYYY-MM-DD) in the user's own time zone. */
const dayKey = (ms, tzOffsetMinutes) => new Date(ms - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);

const shiftDay = (key, days) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

function accuracyOf(rows) {
  if (!rows.length) return null;
  return percent(average(rows.map((r) => SCORE[r.outcome] ?? 0)));
}

function computeStreaks(dayKeys, today) {
  const days = [...new Set(dayKeys)].sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of days) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  // The streak is still alive if the last practice day was today or yesterday.
  let current = 0;
  const set = new Set(days);
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  return { current, longest, practicedToday: set.has(today) };
}

function computeSkills(rows, nowMs) {
  const bySkill = new Map();
  for (const row of rows) {
    if (!bySkill.has(row.skill_id)) bySkill.set(row.skill_id, { name: row.skill_name, rows: [] });
    bySkill.get(row.skill_id).rows.push(row);
  }
  const weekAgo = nowMs - 7 * DAY_MS;
  const twoWeeksAgo = nowMs - 14 * DAY_MS;

  return [...bySkill.entries()]
    .map(([skillId, { name, rows: skillRows }]) => {
      const recent = skillRows.filter((r) => Date.parse(r.answered_at) > weekAgo);
      const before = skillRows.filter((r) => {
        const t = Date.parse(r.answered_at);
        return t > twoWeeksAgo && t <= weekAgo;
      });
      const recentAccuracy = accuracyOf(recent);
      const beforeAccuracy = accuracyOf(before);
      let trend = 'new';
      if (recentAccuracy !== null && beforeAccuracy !== null) {
        const change = recentAccuracy - beforeAccuracy;
        trend = change >= 5 ? 'up' : change <= -5 ? 'down' : 'steady';
      } else if (skillRows.length > 1) {
        trend = 'steady';
      }
      return {
        skillId,
        name,
        attempts: skillRows.length,
        accuracy: accuracyOf(skillRows),
        trend,
        lastPracticed: skillRows[skillRows.length - 1].answered_at,
      };
    })
    .sort((a, b) => b.attempts - a.attempts);
}

function computeConcepts(rows) {
  const concepts = new Map();
  for (const row of rows) {
    const context = { skill: row.skill_name, at: row.answered_at };
    for (const raw of parseList(row.concepts_to_review)) {
      const key = normalizeConcept(raw);
      if (!key) continue;
      const entry = concepts.get(key) || { label: String(raw).trim(), missed: 0, state: null };
      entry.missed += 1;
      entry.state = 'review';
      entry.lastSeen = context;
      concepts.set(key, entry);
    }
    for (const raw of parseList(row.concepts_known)) {
      const key = normalizeConcept(raw);
      if (!key) continue;
      const entry = concepts.get(key) || { label: String(raw).trim(), missed: 0, state: null };
      if (entry.missed > 0) entry.masteredAt = row.answered_at;
      entry.state = 'known';
      entry.lastSeen = context;
      concepts.set(key, entry);
    }
  }
  const all = [...concepts.values()];
  const gaps = all
    .filter((c) => c.state === 'review')
    .sort((a, b) => b.missed - a.missed || Date.parse(b.lastSeen.at) - Date.parse(a.lastSeen.at))
    .slice(0, 5)
    .map((c) => ({ concept: c.label, timesMissed: c.missed, skill: c.lastSeen.skill, lastSeen: c.lastSeen.at }));
  const mastered = all
    .filter((c) => c.state === 'known' && c.missed > 0)
    .sort((a, b) => Date.parse(b.masteredAt) - Date.parse(a.masteredAt))
    .slice(0, 5)
    .map((c) => ({ concept: c.label, skill: c.lastSeen.skill, masteredAt: c.masteredAt, previouslyMissed: c.missed }));
  return { gaps, mastered };
}

function computeDelivery(rows) {
  const spoken = rows.filter((r) => r.wpm !== null && r.wpm !== undefined && r.word_count > 0);
  if (!spoken.length) return { spokenAnswers: 0 };
  const withPace = spoken.filter((r) => r.wpm > 0);
  const fillerPer100 = (r) => ((r.filler_count || 0) / r.word_count) * 100;
  const latest = spoken.slice(-5);
  const earlier = spoken.slice(-10, -5);

  const avgWpm = withPace.length ? Math.round(average(withPace.map((r) => r.wpm))) : null;
  const avgFillers = Math.round(average(spoken.map(fillerPer100)) * 10) / 10;
  const latestFillers = average(latest.map(fillerPer100));
  const earlierFillers = earlier.length ? average(earlier.map(fillerPer100)) : null;

  let fillerTrend = 'new';
  if (earlierFillers !== null) {
    const change = latestFillers - earlierFillers;
    fillerTrend = change <= -0.5 ? 'improving' : change >= 0.5 ? 'worsening' : 'steady';
  }
  return {
    spokenAnswers: spoken.length,
    avgWpm,
    inTypicalRange: avgWpm !== null ? avgWpm >= PACE_LOW && avgWpm <= PACE_HIGH : null,
    avgFillersPer100: avgFillers,
    fillerTrend,
    recent: latest.map((r) => ({
      at: r.answered_at,
      wpm: r.wpm,
      fillersPer100: Math.round(fillerPer100(r) * 10) / 10,
    })),
  };
}

function chooseNextStep({ total, streaks, skills, gaps, delivery }) {
  if (total === 0) {
    return { type: 'start', title: 'Answer your first question', detail: 'Pick a skill and try a short session. Your progress starts building from the first answer.' };
  }
  const recurring = gaps.find((g) => g.timesMissed >= 2);
  if (recurring) {
    return {
      type: 'gap',
      title: `Revisit ${recurring.concept}`,
      detail: `This has come up in your review list ${recurring.timesMissed} times, most recently in ${recurring.skill}. A focused session on it should help.`,
    };
  }
  const weak = skills.filter((s) => s.attempts >= 3 && s.accuracy !== null && s.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy)[0];
  if (weak) {
    return {
      type: 'skill',
      title: `Practise ${weak.name}`,
      detail: `Your accuracy there is ${weak.accuracy}% over ${weak.attempts} answers. A few more rounds will show whether it is improving.`,
    };
  }
  if (delivery.spokenAnswers >= 3 && delivery.avgFillersPer100 > 4) {
    return {
      type: 'delivery',
      title: 'Replace filler words with pauses',
      detail: `You average ${delivery.avgFillersPer100} filler words per 100 words. Try a short silent pause instead of "um" on your next spoken answer.`,
    };
  }
  if (delivery.spokenAnswers >= 3 && delivery.inTypicalRange === false) {
    return {
      type: 'delivery',
      title: delivery.avgWpm > PACE_HIGH ? 'Slow down a little' : 'Pick up the pace slightly',
      detail: `You average ${delivery.avgWpm} words per minute. A steady interview pace is roughly ${PACE_LOW} to ${PACE_HIGH}.`,
    };
  }
  if (!streaks.practicedToday && streaks.current > 0) {
    return {
      type: 'streak',
      title: `Keep your ${streaks.current}-day streak going`,
      detail: 'One question today is enough to extend it.',
    };
  }
  return { type: 'level-up', title: 'Try a harder level', detail: 'You are doing well. Moving up a level on your strongest skill is a good stretch.' };
}

/**
 * @param {Array} rows Answer log rows, oldest first.
 * @param {{ now?: number, tzOffsetMinutes?: number }} options tzOffsetMinutes matches Date#getTimezoneOffset().
 */
function computeInsights(rows, { now = Date.now(), tzOffsetMinutes = 0 } = {}) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.answered_at) - Date.parse(b.answered_at));
  const today = dayKey(now, tzOffsetMinutes);
  const streaks = computeStreaks(sorted.map((r) => dayKey(Date.parse(r.answered_at), tzOffsetMinutes)), today);

  const weekAgo = now - 7 * DAY_MS;
  const twoWeeksAgo = now - 14 * DAY_MS;
  const last7 = sorted.filter((r) => Date.parse(r.answered_at) > weekAgo);
  const prev7 = sorted.filter((r) => {
    const t = Date.parse(r.answered_at);
    return t > twoWeeksAgo && t <= weekAgo;
  });
  const accuracy7 = accuracyOf(last7);
  const accuracyPrev7 = accuracyOf(prev7);

  const skills = computeSkills(sorted, now);
  const { gaps, mastered } = computeConcepts(sorted);
  const delivery = computeDelivery(sorted);

  return {
    totals: {
      answers: sorted.length,
      activeDays: new Set(sorted.map((r) => dayKey(Date.parse(r.answered_at), tzOffsetMinutes))).size,
      currentStreak: streaks.current,
      longestStreak: streaks.longest,
      practicedToday: streaks.practicedToday,
      last7Days: { answers: last7.length, accuracy: accuracy7 },
      previous7Days: { answers: prev7.length, accuracy: accuracyPrev7 },
      accuracyChange: accuracy7 !== null && accuracyPrev7 !== null ? accuracy7 - accuracyPrev7 : null,
    },
    skills,
    gaps,
    mastered,
    delivery,
    nextStep: chooseNextStep({ total: sorted.length, streaks, skills, gaps, delivery }),
  };
}

module.exports = { computeInsights };
