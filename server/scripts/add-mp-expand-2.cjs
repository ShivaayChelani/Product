/**
 * Second MP pass: quality gaps still missing from curated list.
 * Usage: node server/scripts/add-mp-expand-2.cjs
 * Then:  cd server && npm run db:seed:curated
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');
const places = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
const STATE = 'Madhya Pradesh';
const COUNTRY = 'India';

const newPlaces = [
  // Waterfalls / nature gaps
  {
    id: 'rahatgarh-waterfalls',
    name: 'Rahatgarh Waterfalls',
    city: 'Rahatgarh',
    state: STATE,
    latitude: 23.7631,
    longitude: 78.3979,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Multi-tier waterfall near Sagar–Rahatgarh, strongest in monsoon. A popular local picnic and photography spot still under the radar for interstate tourists.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'mohadi-waterfall',
    name: 'Mohadi Waterfall',
    city: 'Dewas',
    state: STATE,
    latitude: 22.5699,
    longitude: 76.0054,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Seasonal cascade in the Dewas–Indore belt, lively after rains. A quieter alternative to Tincha and Patalpani for weekend nature trips.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tincha_Falls.jpg/600px-Tincha_Falls.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'purwa-falls-rewa',
    name: 'Purwa Falls',
    city: 'Rewa',
    state: STATE,
    latitude: 24.55,
    longitude: 81.35,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Powerful Rewa-region waterfall on the Tamsa/Bihad plateau circuit with Chachai and Keoti. Raw monsoon force and village landscapes.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'apsara-vihar-pachmarhi',
    name: 'Apsara Vihar',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.455,
    longitude: 78.4415,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Small natural pool and cascade near Rajat Prapat in Pachmarhi. Legend links it to apsaras bathing — a short, scenic forest stop.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 75,
    rating: 4.3,
  },
  {
    id: 'kakda-kho-mandu',
    name: 'Kakda Kho Mandu',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3827,
    longitude: 75.3899,
    category: 'trek',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Deep ravine viewpoint on Mandu’s plateau edge. Dramatic cliffs and valley drop — a lesser-visited nature corner beyond the palace circuit.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 80,
    rating: 4.3,
  },

  // Museums / interpretation
  {
    id: 'manav-sangrahalaya-bhopal',
    name: 'Indira Gandhi Rashtriya Manav Sangrahalaya',
    city: 'Bhopal',
    state: STATE,
    latitude: 23.2329,
    longitude: 77.3788,
    category: 'museum',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'National Museum of Mankind on Shamla Hills — open-air tribal habitats, ethnographic galleries, and lakeside trails. One of India’s finest anthropology museums.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 120,
    rating: 4.6,
  },
  {
    id: 'tribal-museum-bhopal',
    name: 'Madhya Pradesh Tribal Museum',
    city: 'Bhopal',
    state: STATE,
    latitude: 23.2343,
    longitude: 77.3849,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Award-winning museum celebrating MP’s tribal cultures with immersive installations, crafts, and living traditions. A modern cultural highlight of Bhopal.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 110,
    rating: 4.7,
  },
  {
    id: 'central-museum-indore',
    name: 'Central Museum Indore',
    city: 'Indore',
    state: STATE,
    latitude: 22.7052,
    longitude: 75.8793,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Indore’s main archaeological and art museum with sculptures, coins, and Holkar-era artefacts. Compact heritage stop near the city centre.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Ralamandal_Wildlife_Sanctuary.jpg/600px-Ralamandal_Wildlife_Sanctuary.jpg',
    points: 80,
    rating: 4.2,
  },
  {
    id: 'khajuraho-archaeological-museum',
    name: 'Khajuraho Archaeological Museum',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.859,
    longitude: 79.9206,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'ASI museum near the Western Group displaying sculptures and architectural fragments from Khajuraho temples. Essential context for the UNESCO site.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'bison-lodge-pachmarhi',
    name: 'Bison Lodge Interpretation Centre',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4622,
    longitude: 78.4244,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Colonial-era lodge turned Satpura interpretation centre covering wildlife, geology, and Pachmarhi’s forest heritage.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 75,
    rating: 4.3,
  },
  {
    id: 'bandhavgarh-museum',
    name: 'Bandhavgarh Museum',
    city: 'Umaria',
    state: STATE,
    latitude: 23.7205,
    longitude: 81.0176,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Small park interpretation museum near Bandhavgarh with exhibits on tigers, flora, and the reserve’s history — good pre-safari stop.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Bandhavgarh_Tiger.jpg/600px-Bandhavgarh_Tiger.jpg',
    points: 70,
    rating: 4.2,
  },

  // Heritage forts / monuments
  {
    id: 'ashrafi-mahal-mandu',
    name: 'Ashrafi Mahal Mandu',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3484,
    longitude: 75.3989,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Ruined madrasa and victory tower complex opposite Jami Masjid. Once among Mandu’s grandest ensembles; atmospheric Afghan-era remains.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 85,
    rating: 4.3,
  },
  {
    id: 'ahukhana-burhanpur',
    name: 'Ahukhana Burhanpur',
    city: 'Burhanpur',
    state: STATE,
    latitude: 21.3089,
    longitude: 76.2467,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Mughal garden-tomb complex where Mumtaz Mahal was temporarily buried before the Taj Mahal. Quiet riverside heritage of Burhanpur.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'rewa-fort',
    name: 'Rewa Fort',
    city: 'Rewa',
    state: STATE,
    latitude: 24.532,
    longitude: 81.296,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Historic seat of the Rewa royals with museum galleries and the White Tiger connection. Anchor heritage site for the Rewa waterfall circuit.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 95,
    rating: 4.3,
  },
  {
    id: 'deur-kothar',
    name: 'Deur Kothar Stupas',
    city: 'Rewa',
    state: STATE,
    latitude: 24.9167,
    longitude: 81.6667,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Mauryan-era Buddhist stupa complex near Rewa, among India’s earliest Buddhist remains. An archaeological gem far from usual MP tourist trails.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 110,
    rating: 4.5,
  },
  {
    id: 'koshak-mahal-chanderi',
    name: 'Koshak Mahal Chanderi',
    city: 'Chanderi',
    state: STATE,
    latitude: 24.72,
    longitude: 78.14,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Unfinished multi-storey palace of Chanderi’s medieval rulers. Massive stone floors and arches overlooking the weaving town.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'budhi-chanderi',
    name: 'Budhi Chanderi',
    city: 'Chanderi',
    state: STATE,
    latitude: 24.8042,
    longitude: 78.0771,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Older ruined settlement near modern Chanderi with fort remains and temples. Atmospheric “old Chanderi” for heritage walkers.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 85,
    rating: 4.3,
  },
  {
    id: 'bijawar-fort',
    name: 'Bijawar Fort',
    city: 'Bijawar',
    state: STATE,
    latitude: 24.6248,
    longitude: 79.4926,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hill fort in Chhatarpur district on the Bundelkhand circuit near Khajuraho–Panna. Quiet ramparts and small-town heritage.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 80,
    rating: 4.2,
  },
  {
    id: 'assi-khamba-bawdi-gwalior',
    name: 'Assi Khamba Ki Bawdi',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2292,
    longitude: 78.1685,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Historic stepwell with eighty pillars inside Gwalior Fort precincts. Cool stone architecture often missed between the main temples.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 85,
    rating: 4.4,
  },
  {
    id: 'man-singh-palace-gwalior',
    name: 'Man Singh Palace (Gwalior Fort)',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2309,
    longitude: 78.1692,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Iconic blue-tiled palace of Raja Man Singh Tomar on Gwalior Fort. Geometric glaze work and underground chambers are fort highlights.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 120,
    rating: 4.7,
  },
  {
    id: 'pravin-raj-mahal-orchha',
    name: 'Pravin Raj Mahal Orchha',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3517,
    longitude: 78.6447,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Palace linked to the poetess-courtesan Rai Praveen within Orchha’s fort complex. Intimate courtyards and Bundela detailing.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 85,
    rating: 4.3,
  },

  // Temples / spiritual
  {
    id: 'adinath-temple-khajuraho',
    name: 'Adinath Temple Khajuraho',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.8451,
    longitude: 79.9366,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Eastern Group Jain temple with refined sculpture, quieter than the Western Group. Part of Khajuraho’s important Jain cluster.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'parsvanath-temple-khajuraho',
    name: 'Parsvanath Temple Khajuraho',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.8447,
    longitude: 79.9358,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Largest Jain temple of Khajuraho’s Eastern Group with exquisite exterior carving. A must for travellers going beyond the erotic Western temples.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 95,
    rating: 4.5,
  },
  {
    id: 'bhairav-baba-khamdeeh',
    name: 'Bhairav Baba Temple Khamdeeh',
    city: 'Rewa',
    state: STATE,
    latitude: 24.55,
    longitude: 81.4,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Unusual shrine with a massive reclining Bhairav idol near Rewa. Striking spiritual stop on the eastern MP waterfall route.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'achleshwar-mandir-gwalior',
    name: 'Achleshwar Mandir',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.1986,
    longitude: 78.1648,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Historic Shiva temple in Gwalior associated with local legends of the fort’s founding. Active neighbourhood pilgrimage site.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 70,
    rating: 4.2,
  },

  // Adventure / viewpoints
  {
    id: 'canopy-walk-mukki',
    name: 'Kanha Canopy Walk Mukki',
    city: 'Balaghat',
    state: STATE,
    latitude: 22.1447,
    longitude: 80.6659,
    category: 'adventure',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Tree-top canopy walk near Mukki gate of Kanha — elevated forest views and a family-friendly adventure add-on to safari trips.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 85,
    rating: 4.4,
  },
  {
    id: 'jamuni-sangam-orchha',
    name: 'Jamuni Sangam Orchha',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3481,
    longitude: 78.6559,
    category: 'ghat',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Confluence point near Orchha’s Betwa riverfront — peaceful viewpoint for chhatri silhouettes and evening light.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 75,
    rating: 4.3,
  },
  {
    id: 'alamgiri-gate-mandu',
    name: 'Alamgiri Gate Mandu',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3629,
    longitude: 75.3931,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Monumental gateway on Mandu’s fortifications, associated with later Islamic rulers. Strong photo stop on the plateau approach.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 75,
    rating: 4.2,
  },
  {
    id: 'chaman-mahal-islamnagar',
    name: 'Chaman Mahal Islamnagar',
    city: 'Bhopal',
    state: STATE,
    latitude: 23.3576,
    longitude: 77.4175,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Garden palace of the early Bhopal Nawabs at Islamnagar, with charbagh-style layout. Pair with nearby Rani Mahal and fort walls.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 85,
    rating: 4.3,
  },
  {
    id: 'sardarpur-wildlife-sanctuary',
    name: 'Sardarpur Wildlife Sanctuary',
    city: 'Dhar',
    state: STATE,
    latitude: 22.65,
    longitude: 74.95,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Lesser-known sanctuary in Dhar district protecting grassland and woodland species, including the rare kharmor (lesser florican) habitat story of western MP.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 85,
    rating: 4.2,
  },
  {
    id: 'ratapani-wildlife-sanctuary',
    name: 'Ratapani Wildlife Sanctuary',
    city: 'Raisen',
    state: STATE,
    latitude: 22.9,
    longitude: 77.7,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Large forest tract near Bhopal–Raisen, upgraded tiger habitat ambitions. Quiet wilderness day-trip alternative to crowded city parks.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 95,
    rating: 4.3,
  },
  {
    id: 'nauradehi-wildlife-sanctuary',
    name: 'Nauradehi Wildlife Sanctuary',
    city: 'Sagar',
    state: STATE,
    latitude: 23.5,
    longitude: 79.2,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'One of MP’s largest sanctuaries, spanning Sagar–Damoh–Narsinghpur. Expansive forests chosen for cheetah/landscape conservation experiments.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 100,
    rating: 4.3,
  },
  {
    id: 'fossil-park-mandla',
    name: 'Dinosaur Fossil National Park (Dhar/Bagh belt)',
    city: 'Dhar',
    state: STATE,
    latitude: 22.35,
    longitude: 75.05,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Fossil-rich landscape of western MP associated with dinosaur eggs and Cretaceous finds near the Bagh–Dhar region. Niche geo-tourism destination.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 95,
    rating: 4.3,
  },
  {
    id: 'shipra-aarti-ghat-overview',
    name: 'Shipra River Ghats Ujjain',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.192,
    longitude: 75.772,
    category: 'ghat',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'Stretch of sacred Shipra ghats beyond Ram Ghat — evening lamps, pilgrims, and Simhastha heritage along Ujjain’s holy riverfront.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 90,
    rating: 4.5,
  },
  {
    id: 'rani-talab-rewa',
    name: 'Rani Talab Rewa',
    city: 'Rewa',
    state: STATE,
    latitude: 24.53,
    longitude: 81.3,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Historic tank in Rewa surrounded by temples and chhatris. Calm city heritage stop before heading to Chachai or Keoti Falls.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Kerwa_Dam_Bhopal.jpg/600px-Kerwa_Dam_Bhopal.jpg',
    points: 70,
    rating: 4.2,
  },
  {
    id: 'maihar-hill-trek',
    name: 'Maihar Hill (Sharda Devi Climb)',
    city: 'Maihar',
    state: STATE,
    latitude: 24.2614,
    longitude: 80.7225,
    category: 'trek',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Stepped hill climb to Sharda Devi temple — ropeway optional. Spiritual trek with wide views over Maihar and the Satna countryside.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 95,
    rating: 4.5,
  },
];

for (const p of newPlaces) {
  p.country = COUNTRY;
}

let added = 0;
const skipped = [];
for (const np of newPlaces) {
  const exists = places.some(
    (x) => x.id === np.id || x.name.toLowerCase() === np.name.toLowerCase()
  );
  if (!exists) {
    places.push(np);
    added++;
  } else {
    skipped.push(np.id);
  }
}

fs.writeFileSync(filePath, JSON.stringify(places, null, 2), 'utf-8');
const mp = places.filter((x) => x.state === STATE);
console.log('Added ' + added + ' (skipped ' + skipped.length + ').');
console.log(
  'MP curated: ' +
    mp.length +
    ' | gems: ' +
    mp.filter((x) => x.isHiddenGem).length +
    ' | total curated file: ' +
    places.length
);
if (skipped.length) console.log('Skipped:', skipped.join(', '));
