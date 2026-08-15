// Quick validation: are the 58 OSM backfill city values actually usable?
const changes = [
  "Chethipuzha Kadavu, Changanassery, Kerala 686104, India",
  "podalakur mandal",
  "Near Gate No.1, Pragati Maidan, New Delhi, Delhi",
  "Neyyattinkara Kattakada Rd, Thozhukkal, Neyyattinkara, Kerala",
  "gujarat",
  "Eadarapalle,Nandalur mandal YSR Kadapa district,Amalapuram,Andhra Pradesh",
  "haryana",
  "Kottayam District",
  "Vanumvaripalem,Attli mandal",
  "R R District",
];
const STATE = new Set(['gujarat','haryana','jharkhand','bihar','sikkim','assam','manipur','nagaland','meghalaya','mizoram','arunachal pradesh','odisha','chhattisgarh','uttarakhand','himachal pradesh','karnataka','kerala','tamil nadu','andhra pradesh','telangana','maharashtra','madhya pradesh','rajasthan','uttar pradesh','west bengal','punjab','jammu and kashmir','ladakh','goa']);
const ADMIN = /(mandal|taluk|taluka|tehsil|district|zilla|jila|subdistrict|block|panchayat)/i;
for (const city of changes) {
  const lower = city.trim().toLowerCase();
  const issues = [];
  if (city.includes(',')) issues.push('address(comma)');
  if (STATE.has(lower)) issues.push('state_name');
  if (ADMIN.test(city)) issues.push('admin_unit');
  if (city.length > 40) issues.push('too_long');
  console.log((issues.length ? 'REJECT' : 'OK     ') + ' | ' + city + (issues.length ? '  [' + issues.join(', ') + ']' : ''));
}
