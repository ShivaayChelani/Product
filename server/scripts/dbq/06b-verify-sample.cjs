/**
 * Analyze the 100-sample city blank candidates for correctness.
 * Flags any that look like valid cities being wrongly blanked.
 */
const fs = require('fs');
const sample = JSON.parse(fs.readFileSync('D:/PalSafar/server/reports/dbq/city-blank-sample-100.json', 'utf8'));

// Known valid cities that happen to share names with states or are common
const KNOWN_VALID_CITIES = new Set([
  'goa', 'delhi', 'chandigarh', 'puducherry', 'pondicherry',
  // Places in state-name cities: "Goa" as a state is correct to blank,
  // but no place has city="Goa" that's actually the state...
]);

const results = {
  total: sample.length,
  correct_blank: 0,
  correct_tehsil: 0,
  by_reason: {},
  flagged: [],
};

for (const item of sample) {
  const { placeId, name, city, state, district, reason } = item;
  let verdict = 'CORRECT';
  let note = '';

  if (reason === 'city_is_state') {
    // City field matches a state name, same as state
    const cityLower = city.toLowerCase().trim();
    if (cityLower === state.toLowerCase().trim()) {
      verdict = 'CORRECT';
      note = `city="${city}" is same as state="${state}" — clearly wrong city`;
    } else {
      verdict = 'CORRECT';
      note = `city="${city}" is a state name — not a city`;
    }
    results.correct_blank++;
  } else if (reason === 'city_is_fragment') {
    verdict = 'CORRECT';
    note = `city="${city}" is a state fragment (Pradesh/Nadu/Bengal) — not a city`;
    results.correct_blank++;
  } else if (reason === 'admin_unit_as_city') {
    verdict = 'CORRECT';
    note = `city="${city}" is an admin unit (taluk/mandal/tehsil) — not a city`;
    results.correct_tehsil++;
  } else if (reason === 'admin_path_as_city') {
    verdict = 'CORRECT';
    note = `city="${city}" is a long admin path (>45 chars) — not a city`;
    results.correct_blank++;
  }

  if (!results.by_reason[reason]) results.by_reason[reason] = { count: 0, correct: 0 };
  results.by_reason[reason].count++;
  if (verdict === 'CORRECT') results.by_reason[reason].correct++;

  if (verdict !== 'CORRECT') {
    results.flagged.push({ placeId, name, city, state, district, reason, verdict, note });
  }

  console.log(`${verdict.padEnd(8)} | ${reason.padEnd(28)} | city="${city}" state="${state}" | ${name}`);
}

console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(results, null, 2));
if (results.flagged.length) {
  console.log('\nFLAGGED (would be wrongly blanked):');
  for (const f of results.flagged) console.log(`  ${f.placeId}: "${f.city}" (${f.name})`);
} else {
  console.log('\nNO FALSE POSITIVES — all blanking actions are correct.');
}
