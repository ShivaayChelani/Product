/**
 * Append curated Madhya Pradesh tourist attractions + hidden gems
 * into places-curated.json (idempotent by id / name).
 *
 * Usage: node server/scripts/add-mp-expand.cjs
 * Then:  cd server && npm run db:seed:curated
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');
const places = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const STATE = 'Madhya Pradesh';
const COUNTRY = 'India';

/** @type {Array<Record<string, any>>} */
const newPlaces = [
  // ─── Pachmarhi (break out key spots) ───
  {
    id: 'bee-falls-pachmarhi',
    name: 'Bee Falls (Pachmarhi)',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4568,
    longitude: 78.4215,
    category: 'waterfall',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'The tallest waterfall in Pachmarhi (~30 m), named for the bees that nest in nearby cliffs. A short forest walk leads to a misty plunge pool — a monsoon favourite of the Satpura hills.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 120,
    rating: 4.6,
  },
  {
    id: 'duchess-falls-pachmarhi',
    name: 'Duchess Falls',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4375,
    longitude: 78.4089,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'A three-tiered cascade deep in the Pachmarhi forest, reached by a longer trek than Bee Falls. Quieter pools and dense greenery make it one of the Satpuras’ true hidden waterfalls.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 95,
    rating: 4.5,
  },
  {
    id: 'dhoopgarh-pachmarhi',
    name: 'Dhoopgarh Peak',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4522,
    longitude: 78.3731,
    category: 'trek',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Highest point of the Satpura Range (1,352 m). Famous for golden sunsets over endless forest ridges — the classic Pachmarhi viewpoint.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 110,
    rating: 4.7,
  },
  {
    id: 'jata-shankar-cave-pachmarhi',
    name: 'Jata Shankar Cave Temple',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4756,
    longitude: 78.4339,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'A natural cave shrine dedicated to Lord Shiva, believed to be where Shiva hid from the demon Bhasmasur. Cool subterranean chambers and a natural spring add to the pilgrimage feel.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 90,
    rating: 4.5,
  },
  {
    id: 'pandav-caves-pachmarhi',
    name: 'Pandav Caves (Pachmarhi)',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4678,
    longitude: 78.4345,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Five rock-cut Buddhist caves from the Gupta period, locally linked to the Pandavas’ exile. Compact heritage site with forest views above the town.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 85,
    rating: 4.3,
  },
  {
    id: 'handi-khoh-pachmarhi',
    name: 'Handi Khoh',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4612,
    longitude: 78.4298,
    category: 'trek',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'A dramatic 300-foot deep gorge near Pachmarhi, shrouded in mist and legend. Viewpoints overlook sheer cliffs and dense jungle — best after rains.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 80,
    rating: 4.4,
  },
  {
    id: 'rajat-prapat-pachmarhi',
    name: 'Rajat Prapat (Silver Falls)',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4489,
    longitude: 78.4156,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Also called Big Fall, this silver stream of water drops from a high cliff near Apsara Vihar. A quieter alternative to Bee Falls with a short forest approach.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 85,
    rating: 4.4,
  },
  {
    id: 'chauragarh-temple-pachmarhi',
    name: 'Chauragarh Temple',
    city: 'Pachmarhi',
    state: STATE,
    latitude: 22.4167,
    longitude: 78.4167,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hilltop Shiva shrine reached by climbing over a thousand stone steps lined with tridents offered by devotees. Panoramic Satpura views reward the trek, especially during Mahashivratri.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 100,
    rating: 4.6,
  },

  // ─── Mandu (break out monuments) ───
  {
    id: 'jahaz-mahal-mandu',
    name: 'Jahaz Mahal (Ship Palace)',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3486,
    longitude: 75.3964,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Iconic Mandu palace that appears to float between two lakes like a ship. Built by Ghiyas-ud-din Khilji in the 15th century; a masterpiece of Afghan-era architecture.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 130,
    rating: 4.7,
  },
  {
    id: 'rani-roopmati-pavilion-mandu',
    name: 'Rani Roopmati Pavilion',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3358,
    longitude: 75.3933,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Hilltop pavilion linked to the legend of Baz Bahadur and Rani Roopmati, overlooking the Narmada valley. Sunset light on the sandstone arches is unforgettable.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 125,
    rating: 4.7,
  },
  {
    id: 'hindola-mahal-mandu',
    name: 'Hindola Mahal',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3497,
    longitude: 75.3975,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'The “Swinging Palace” of Mandu — a massive audience hall with sloping walls that create an illusion of rocking. Stark, powerful Afghan architecture.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 95,
    rating: 4.5,
  },
  {
    id: 'jami-masjid-mandu',
    name: 'Jami Masjid Mandu',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3472,
    longitude: 75.3997,
    category: 'mosque',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'One of India’s finest Afghan mosques, modelled on the Great Mosque of Damascus. Vast courtyard, rows of arches, and serene proportions on Mandu’s plateau.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'baz-bahadur-palace-mandu',
    name: 'Baz Bahadur Palace',
    city: 'Mandu',
    state: STATE,
    latitude: 22.3375,
    longitude: 75.3942,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Palace of the last independent ruler of Mandu, set below Roopmati Pavilion. Courtyards, reservoirs, and valley views recall the famous love story of Baz Bahadur and Roopmati.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 90,
    rating: 4.4,
  },

  // ─── Orchha ───
  {
    id: 'orchha-chhatris',
    name: 'Orchha Chhatris (Cenotaphs)',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3489,
    longitude: 78.6403,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Fourteen riverside cenotaphs of Bundela kings along the Betwa. One of India’s most photogenic sunset spots — spires reflected in the river at golden hour.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 120,
    rating: 4.7,
  },
  {
    id: 'chaturbhuj-temple-orchha',
    name: 'Chaturbhuj Temple Orchha',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3517,
    longitude: 78.6408,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Towering multi-storeyed temple built for an idol of Rama that never arrived (the idol stayed at Ram Raja Temple). Climb for rooftop views over Orchha’s palaces and river.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 110,
    rating: 4.6,
  },
  {
    id: 'lakshmi-temple-orchha',
    name: 'Lakshmi Narayan Temple Orchha',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3556,
    longitude: 78.6361,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Fort-like temple on a ridge with rare Bundela murals — battle scenes, myths, and everyday life painted on walls and ceilings. Often quieter than the fort complex.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 95,
    rating: 4.5,
  },
  {
    id: 'jahangir-mahal-orchha',
    name: 'Jahangir Mahal Orchha',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3508,
    longitude: 78.6425,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Grand Bundela palace built to welcome Emperor Jahangir. Domed chhatris, courtyards, and blue-tiled accents make it the centrepiece of Orchha Fort.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 115,
    rating: 4.6,
  },

  // ─── Gwalior ───
  {
    id: 'sas-bahu-temples-gwalior',
    name: 'Sas Bahu Temples',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2317,
    longitude: 78.1697,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Pair of elaborately carved 11th-century Vishnu temples inside Gwalior Fort. “Sas-Bahu” means mother-in-law and daughter-in-law — dense sculpture and soaring shikharas.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 110,
    rating: 4.6,
  },
  {
    id: 'teli-ka-mandir-gwalior',
    name: 'Teli ka Mandir',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2294,
    longitude: 78.1681,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'Unusual Dravidian-meets-North-Indian temple inside Gwalior Fort, standing ~30 m tall. One of the oldest surviving structures on the fort hill.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'gujari-mahal-gwalior',
    name: 'Gujari Mahal (Archaeological Museum)',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2325,
    longitude: 78.1708,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      '15th-century palace built by Raja Man Singh Tomar for Queen Mrignayani, now an archaeological museum. Famous for the rare Salabhanjika (Woman with Tree) sculpture.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 95,
    rating: 4.5,
  },
  {
    id: 'tansen-tomb-gwalior',
    name: 'Tansen Tomb',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2308,
    longitude: 78.1486,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Tomb of the legendary musician Tansen near the tomb of his Sufi guru Mohammad Ghaus. A quiet heritage corner; site of the annual Tansen Music Festival.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 85,
    rating: 4.4,
  },
  {
    id: 'jai-vilas-palace-gwalior',
    name: 'Jai Vilas Palace',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2047,
    longitude: 78.1686,
    category: 'palace',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Opulent Scindia palace (1874) housing the Jiwaji Rao Scindia Museum. European ballrooms, crystal furniture, and the famous double-storey Durbar Hall chandelier.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 120,
    rating: 4.6,
  },
  {
    id: 'sun-temple-gwalior',
    name: 'Sun Temple Gwalior',
    city: 'Gwalior',
    state: STATE,
    latitude: 26.2189,
    longitude: 78.2089,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Modern temple inspired by Konark’s Sun Temple, set in landscaped gardens. Popular local pilgrimage and photo spot away from the fort crowds.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 75,
    rating: 4.3,
  },

  // ─── Ujjain ───
  {
    id: 'kal-bhairav-temple-ujjain',
    name: 'Kal Bhairav Temple',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.2156,
    longitude: 75.7697,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Ancient temple to Kal Bhairav on the Shipra’s bank. Unique ritual of offering liquor to the deity; one of Ujjain’s most powerful Shakti–Shaiva sites.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 110,
    rating: 4.6,
  },
  {
    id: 'harsiddhi-temple-ujjain',
    name: 'Harsiddhi Temple',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.1817,
    longitude: 75.7689,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'One of the 51 Shakti Peethas, famous for its towering lamp pillars lit during Navratri. Centrally located near Mahakaleshwar.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'ram-ghat-ujjain',
    name: 'Ram Ghat Ujjain',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.1889,
    longitude: 75.7717,
    category: 'ghat',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Principal ghat on the Shipra River, centre of the Simhastha Kumbh Mela. Evening aarti and lamp offerings create a deeply spiritual riverside atmosphere.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 105,
    rating: 4.6,
  },
  {
    id: 'kaliadeh-palace-ujjain',
    name: 'Kaliadeh Palace',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.2256,
    longitude: 75.7833,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Island palace on the Shipra built by the Sultans of Mandu and later restored by the Scindias. Persian inscriptions and river islets feel far from city bustle.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'vedh-shala-ujjain',
    name: 'Vedh Shala (Jantar Mantar Ujjain)',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.1822,
    longitude: 75.7661,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Observatory built by Maharaja Jai Singh II, similar in spirit to Jaipur’s Jantar Mantar. Ancient instruments for measuring time and planetary positions.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 85,
    rating: 4.3,
  },
  {
    id: 'sandipani-ashram-ujjain',
    name: 'Sandipani Ashram',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.2089,
    longitude: 75.7847,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Legendary ashram where Lord Krishna and Sudama studied under Guru Sandipani. Quiet temple complex with the Gomti Kund water tank.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 80,
    rating: 4.4,
  },

  // ─── Khajuraho / Panna belt ───
  {
    id: 'raneh-falls',
    name: 'Raneh Falls',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.8833,
    longitude: 80.0500,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Canyon waterfall on the Ken River carved through ancient volcanic rock in shades of pink, grey, and yellow. A spectacular monsoon outing near Khajuraho and Panna.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 110,
    rating: 4.6,
  },
  {
    id: 'pandav-falls-panna',
    name: 'Pandav Falls',
    city: 'Panna',
    state: STATE,
    latitude: 24.7167,
    longitude: 80.0333,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Scenic waterfall and picnic spot inside Panna Tiger Reserve area, with caves linked to Pandava legends. Combine with a Ken River drive.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Panna_National_Park.jpg/600px-Panna_National_Park.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'kandariya-mahadeva-khajuraho',
    name: 'Kandariya Mahadeva Temple',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.8531,
    longitude: 79.9197,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Largest and most ornate temple of Khajuraho’s Western Group — peak of Chandela Nagara architecture with thousands of sculptures and a towering shikhara.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 150,
    rating: 4.8,
  },
  {
    id: 'eastern-group-khajuraho',
    name: 'Eastern Group Temples Khajuraho',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.8494,
    longitude: 79.9361,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Cluster of Jain and Hindu temples east of the main Western Group, including Parsvanath and Adinath. Quieter, richly carved, and often overlooked by day-trippers.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'ajaigarh-fort',
    name: 'Ajaigarh Fort',
    city: 'Ajaigarh',
    state: STATE,
    latitude: 24.8986,
    longitude: 80.2611,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hill fort of the Chandela era near Panna, with temples, gates, and sweeping views over the Ken valley. A rugged, less-visited Bundelkhand stronghold.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Panna_National_Park.jpg/600px-Panna_National_Park.jpg',
    points: 95,
    rating: 4.4,
  },
  {
    id: 'kalinjar-fort',
    name: 'Kalinjar Fort',
    city: 'Kalinjar',
    state: STATE,
    latitude: 24.9967,
    longitude: 80.4850,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Legendary hill fort on the Vindhyas, fought over by Chandelas, Mughals, and British. Rock-cut shrines, Neelkanth temple, and massive ramparts reward a full day.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 110,
    rating: 4.5,
  },

  // ─── Chambal / Morena / Datia heritage belt ───
  {
    id: 'bateshwar-temples-morena',
    name: 'Bateshwar Temple Complex',
    city: 'Morena',
    state: STATE,
    latitude: 26.4333,
    longitude: 78.1833,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Vast complex of nearly 200 ruined and restored temples near Padavali, rediscovered and conserved in recent decades. One of India’s great “lost temple city” experiences.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 120,
    rating: 4.7,
  },
  {
    id: 'mitawali-chausath-yogini',
    name: 'Mitawali Chausath Yogini Temple',
    city: 'Morena',
    state: STATE,
    latitude: 26.4250,
    longitude: 78.2167,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Circular 64-Yogini temple on a hill near Padavali, often compared to India’s Parliament building in plan. Atmospheric ruins with panoramic countryside views.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 115,
    rating: 4.6,
  },
  {
    id: 'padavali-garhi-morena',
    name: 'Padavali Garhi Temple',
    city: 'Morena',
    state: STATE,
    latitude: 26.4289,
    longitude: 78.2011,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Exquisitely carved temple inside a fort-like enclosure near Bateshwar. Dense sculpture and a fortress setting make it a hidden Bundelkhand gem.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'datia-palace',
    name: 'Datia Palace (Bir Singh Deo Palace)',
    city: 'Datia',
    state: STATE,
    latitude: 25.6667,
    longitude: 78.4667,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Seven-storeyed Bundela palace built by Raja Bir Singh Deo, never fully occupied by royalty. Labyrinthine corridors and rooftop views over Datia town.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 105,
    rating: 4.5,
  },
  {
    id: 'sonagiri-jain-temples',
    name: 'Sonagiri Jain Temples',
    city: 'Sonagiri',
    state: STATE,
    latitude: 25.7167,
    longitude: 78.3667,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hill of white-spired Digambar Jain temples — over 70 shrines on a sacred ridge between Datia and Gwalior. A luminous pilgrimage landscape at sunrise.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 110,
    rating: 4.6,
  },

  // ─── Chanderi / Shivpuri ───
  {
    id: 'chanderi-fort',
    name: 'Chanderi Fort',
    city: 'Chanderi',
    state: STATE,
    latitude: 24.7131,
    longitude: 78.1375,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Historic hill fort overlooking the weaving town famous for Chanderi sarees. Gates, palaces, and valley views from a quieter heritage destination.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'kati-ghati-chanderi',
    name: 'Kati Ghati Chanderi',
    city: 'Chanderi',
    state: STATE,
    latitude: 24.7089,
    longitude: 78.1417,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Dramatic gateway cut through solid rock — legend says it was carved in a single night. A signature photo stop on the approach to Chanderi.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 85,
    rating: 4.4,
  },
  {
    id: 'badal-mahal-chanderi',
    name: 'Badal Mahal Gate Chanderi',
    city: 'Chanderi',
    state: STATE,
    latitude: 24.7117,
    longitude: 78.1394,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Ornate ceremonial gate of Chanderi with Indo-Islamic arches. Remnant of the town’s medieval court culture and silk-trading prosperity.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'madhav-national-park',
    name: 'Madhav National Park',
    city: 'Shivpuri',
    state: STATE,
    latitude: 25.4333,
    longitude: 77.7000,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Former hunting grounds of the Scindias around Sakhya and Madhav Sagar lakes. Safaris for deer, birds, and occasional leopards; George Castle viewpoint nearby.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 105,
    rating: 4.4,
  },
  {
    id: 'scindia-chhatris-shivpuri',
    name: 'Scindia Chhatris Shivpuri',
    city: 'Shivpuri',
    state: STATE,
    latitude: 25.4289,
    longitude: 77.6583,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Marble cenotaphs of Scindia rulers set in formal Mughal-style gardens. Intricate inlay work and peaceful lawns in the heart of Shivpuri.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 90,
    rating: 4.5,
  },
  {
    id: 'narwar-fort',
    name: 'Narwar Fort',
    city: 'Narwar',
    state: STATE,
    latitude: 25.6500,
    longitude: 77.9000,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Massive hill fort associated with the legendary Raja Nal, sprawling across ridges near Shivpuri. Ruined palaces and long fortification walls for serious explorers.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 95,
    rating: 4.3,
  },

  // ─── Rewa / Sidhi waterfalls & wildlife ───
  {
    id: 'chachai-falls',
    name: 'Chachai Falls',
    city: 'Rewa',
    state: STATE,
    latitude: 24.5833,
    longitude: 81.3167,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'One of India’s tallest waterfalls (~130 m) on the Bihad River near Rewa. A roaring monsoon spectacle still relatively unknown outside the region.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 120,
    rating: 4.6,
  },
  {
    id: 'keoti-falls',
    name: 'Keoti Falls',
    city: 'Rewa',
    state: STATE,
    latitude: 24.7000,
    longitude: 81.4500,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Powerful waterfall on the Mahana River near Rewa, plunging into a rocky gorge. Best visited in monsoon and early winter when flow is strong.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'bahuti-falls',
    name: 'Bahuti Falls',
    city: 'Maugsanj',
    state: STATE,
    latitude: 24.6500,
    longitude: 81.5500,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Tall cascade on the Odda River in Rewa district — among Madhya Pradesh’s highest falls. A remote nature destination for waterfall hunters.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg',
    points: 105,
    rating: 4.5,
  },
  {
    id: 'white-tiger-safari-mukundpur',
    name: 'White Tiger Safari Mukundpur',
    city: 'Mukundpur',
    state: STATE,
    latitude: 24.5333,
    longitude: 81.3000,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Safari park near Rewa dedicated to white tigers — Rewa is the historic home of the white tiger lineage. Combine with nearby Govindgarh and Chachai Falls.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Bandhavgarh_Tiger.jpg/600px-Bandhavgarh_Tiger.jpg',
    points: 110,
    rating: 4.5,
  },
  {
    id: 'govindgarh-palace-rewa',
    name: 'Govindgarh Palace Rewa',
    city: 'Govindgarh',
    state: STATE,
    latitude: 24.3833,
    longitude: 81.3000,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Lakeside palace of the Rewa royals, linked to the story of the first white tiger kept in captivity. Serene reservoir setting in eastern Madhya Pradesh.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg',
    points: 90,
    rating: 4.3,
  },

  // ─── Kuno / wildlife lesser-known ───
  {
    id: 'kuno-national-park',
    name: 'Kuno National Park',
    city: 'Sheopur',
    state: STATE,
    latitude: 25.5167,
    longitude: 77.1500,
    category: 'park',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Habitat of India’s Project Cheetah reintroduction. Dry deciduous forests and grasslands of the Kuno River valley — a landmark wildlife destination of modern India.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 140,
    rating: 4.6,
  },
  {
    id: 'sanjay-dubri-national-park',
    name: 'Sanjay Dubri National Park',
    city: 'Sidhi',
    state: STATE,
    latitude: 24.0000,
    longitude: 82.0000,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Tiger reserve on the MP–Chhattisgarh border with sal forests and the Banas River. Quiet alternative to famous parks like Kanha and Bandhavgarh.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Bandhavgarh_Tiger.jpg/600px-Bandhavgarh_Tiger.jpg',
    points: 100,
    rating: 4.3,
  },
  {
    id: 'ghughua-fossil-park',
    name: 'Ghughua Fossil National Park',
    city: 'Dindori',
    state: STATE,
    latitude: 23.1167,
    longitude: 80.6167,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Unique park protecting fossilised plants from ~60 million years ago — petrified trees and leaves in situ. A rare palaeobotany destination in Mandla–Dindori belt.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 95,
    rating: 4.4,
  },

  // ─── Bhopal / Vidisha / Raisen ───
  {
    id: 'udayagiri-caves-vidisha',
    name: 'Udayagiri Caves',
    city: 'Vidisha',
    state: STATE,
    latitude: 23.5361,
    longitude: 77.7722,
    category: 'monument',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Gupta-era rock-cut caves famous for the monumental Varaha (boar avatar of Vishnu) relief. Essential ancient-Indian art stop near Sanchi.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 120,
    rating: 4.6,
  },
  {
    id: 'heliodorus-pillar-vidisha',
    name: 'Heliodorus Pillar (Khamba Baba)',
    city: 'Vidisha',
    state: STATE,
    latitude: 23.5333,
    longitude: 77.8000,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      '2nd-century BCE Garuda pillar erected by Indo-Greek ambassador Heliodorus — early evidence of Vaishnava devotion. A quiet, historically crucial site near Vidisha.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'raisen-fort',
    name: 'Raisen Fort',
    city: 'Raisen',
    state: STATE,
    latitude: 23.3333,
    longitude: 77.8000,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hilltop fort east of Bhopal with palaces, temples, and a large water tank. Wide views over the Malwa plateau; lightly touristed weekend escape.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 90,
    rating: 4.3,
  },
  {
    id: 'islamnagar-fort-bhopal',
    name: 'Islamnagar Fort',
    city: 'Bhopal',
    state: STATE,
    latitude: 23.3500,
    longitude: 77.4167,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Former capital of the Bhopal Nawabs before the move to Bhopal city. Chaman Mahal and Rani Mahal gardens survive in a quiet village setting.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 85,
    rating: 4.3,
  },
  {
    id: 'lower-lake-bhopal',
    name: 'Lower Lake (Chhota Talaab)',
    city: 'Bhopal',
    state: STATE,
    latitude: 23.2500,
    longitude: 77.4167,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'Companion lake to Upper Lake (Bhojtal), linked by a bridge and promenades. Evening walks, boating, and city reflections in the heart of Bhopal.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Sair_Sapata_Bhopal.jpg/600px-Sair_Sapata_Bhopal.jpg',
    points: 70,
    rating: 4.2,
  },
  {
    id: 'birla-mandir-bhopal',
    name: 'Birla Mandir Bhopal (Lakshmi Narayan)',
    city: 'Bhopal',
    state: STATE,
    latitude: 23.2333,
    longitude: 77.4000,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'White marble Lakshmi Narayan temple on Arera Hills with city panoramas. Peaceful complex popular with families and evening visitors.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 75,
    rating: 4.4,
  },
  {
    id: 'shaukat-mahal-bhopal',
    name: 'Shaukat Mahal',
    city: 'Bhopal',
    state: STATE,
    latitude: 23.2597,
    longitude: 77.3986,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Indo-European palace near Bhopal’s Chowk, blending Gothic and Islamic motifs. Part of the old Qila area with Sadar Manzil nearby.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'bhimkund-bajna',
    name: 'Bhimkund Bajna',
    city: 'Bajna',
    state: STATE,
    latitude: 23.9167,
    longitude: 79.1833,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Natural deep kund associated with Mahabharata legends, with crystal-clear water in a rocky cleft near Chhatarpur–Bajna. A serene offbeat swim-and-picnic spot (local rules apply).',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Kerwa_Dam_Bhopal.jpg/600px-Kerwa_Dam_Bhopal.jpg',
    points: 95,
    rating: 4.5,
  },

  // ─── Indore / Malwa ───
  {
    id: 'bijasen-tekri-indore',
    name: 'Bijasen Tekri',
    city: 'Indore',
    state: STATE,
    latitude: 22.6833,
    longitude: 75.8333,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hilltop Bijasen Mata temple with panoramic views over Indore. Popular sunset point and quiet alternative to city temples.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Ralamandal_Wildlife_Sanctuary.jpg/600px-Ralamandal_Wildlife_Sanctuary.jpg',
    points: 75,
    rating: 4.3,
  },
  {
    id: 'pipliyapala-regional-park',
    name: 'Pipliyapala Regional Park',
    city: 'Indore',
    state: STATE,
    latitude: 22.6839,
    longitude: 75.8667,
    category: 'park',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'Large urban lake park with walking trails, musical fountain, and boating. Favourite evening leisure spot for Indore locals.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Ralamandal_Wildlife_Sanctuary.jpg/600px-Ralamandal_Wildlife_Sanctuary.jpg',
    points: 65,
    rating: 4.2,
  },
  {
    id: 'choral-dam',
    name: 'Choral Dam',
    city: 'Indore',
    state: STATE,
    latitude: 22.4500,
    longitude: 75.8667,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Scenic reservoir in the hills south of Indore, popular for monsoon drives, photography, and quiet lakeside picnics near Tincha Falls belt.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tincha_Falls.jpg/600px-Tincha_Falls.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'bagh-caves',
    name: 'Bagh Caves',
    city: 'Bagh',
    state: STATE,
    latitude: 22.3667,
    longitude: 74.8000,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Rock-cut Buddhist caves (5th–6th century) once famous for murals comparable to Ajanta. Remote Dhar district gem for art and archaeology lovers.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 110,
    rating: 4.5,
  },
  {
    id: 'asirgarh-fort',
    name: 'Asirgarh Fort',
    city: 'Burhanpur',
    state: STATE,
    latitude: 21.4667,
    longitude: 76.2833,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Strategic “key to the Deccan” fort controlling the Burhanpur pass. Massive walls, mosques, and cliff views — a powerful, under-visited fortress.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 105,
    rating: 4.5,
  },
  {
    id: 'shahi-qila-burhanpur',
    name: 'Shahi Qila Burhanpur',
    city: 'Burhanpur',
    state: STATE,
    latitude: 21.3089,
    longitude: 76.2297,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Riverside Mughal fort on the Tapti where Mumtaz Mahal once lived; local lore links Burhanpur to early plans for the Taj Mahal. Quiet riverside heritage.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 95,
    rating: 4.4,
  },
  {
    id: 'dhar-fort',
    name: 'Dhar Fort (Fort of Dhar)',
    city: 'Dhar',
    state: STATE,
    latitude: 22.5975,
    longitude: 75.3042,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Historic fort of the Paramaras and later Muslim rulers of Malwa, near Mandu. Red sandstone walls and city views from a less-crowded heritage town.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg',
    points: 85,
    rating: 4.2,
  },

  // ─── Narmada belt / Maheshwar / Omkareshwar ───
  {
    id: 'ahilya-fort-maheshwar',
    name: 'Ahilya Fort Maheshwar',
    city: 'Maheshwar',
    state: STATE,
    latitude: 22.1775,
    longitude: 75.5872,
    category: 'fort',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Fort-palace of Rani Ahilyabai Holkar above the Narmada ghats. Courtyards, temples, and river panoramas — the heart of Maheshwar’s heritage identity.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Ahilya_Fort_Maheshwar.jpg/600px-Ahilya_Fort_Maheshwar.jpg',
    points: 120,
    rating: 4.7,
  },
  {
    id: 'mamleshwar-temple',
    name: 'Mamleshwar Temple',
    city: 'Omkareshwar',
    state: STATE,
    latitude: 22.2417,
    longitude: 76.1528,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'Jyotirlinga shrine on the south bank of the Narmada, traditionally paired with Omkareshwar on the island. Completes the Omkareshwar pilgrimage circuit.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Omkareshwar_Temple.jpg/600px-Omkareshwar_Temple.jpg',
    points: 110,
    rating: 4.6,
  },
  {
    id: 'narmada-udgam-amarkantak',
    name: 'Narmada Udgam Temple',
    city: 'Amarkantak',
    state: STATE,
    latitude: 22.6775,
    longitude: 81.7528,
    category: 'temple',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Sacred source temple of the Narmada River in the Maikal Hills. Pilgrims begin the Narmada Parikrama here amid forests and ancient shrines.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Amarkantak_Narmada_Udgam.jpg/600px-Amarkantak_Narmada_Udgam.jpg',
    points: 115,
    rating: 4.6,
  },
  {
    id: 'kapildhara-falls-amarkantak',
    name: 'Kapildhara Falls',
    city: 'Amarkantak',
    state: STATE,
    latitude: 22.6833,
    longitude: 81.7333,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Waterfall on the infant Narmada a short trek from Amarkantak town. Forest trail and plunge pool named after sage Kapil — peaceful pilgrimage nature spot.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Amarkantak_Narmada_Udgam.jpg/600px-Amarkantak_Narmada_Udgam.jpg',
    points: 95,
    rating: 4.5,
  },
  {
    id: 'sonmuda-amarkantak',
    name: 'Sonmuda Viewpoint',
    city: 'Amarkantak',
    state: STATE,
    latitude: 22.7000,
    longitude: 81.7500,
    category: 'trek',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Origin viewpoint of the Son River near Amarkantak. Plateau forests and monsoon mist — a quieter companion to Narmada Udgam.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Amarkantak_Narmada_Udgam.jpg/600px-Amarkantak_Narmada_Udgam.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'hanuwantiya-island',
    name: 'Hanuwantiya (Indira Sagar)',
    city: 'Khandwa',
    state: STATE,
    latitude: 22.1333,
    longitude: 76.3667,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Island tourism hub on Indira Sagar reservoir with Jal Mahotsav events, water sports, and hill camping. A modern hidden holiday pocket of Nimar.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Ahilya_Fort_Maheshwar.jpg/600px-Ahilya_Fort_Maheshwar.jpg',
    points: 100,
    rating: 4.5,
  },

  // ─── Chitrakoot details ───
  {
    id: 'ramghat-chitrakoot',
    name: 'Ramghat Chitrakoot',
    city: 'Chitrakoot',
    state: STATE,
    latitude: 25.1667,
    longitude: 80.8667,
    category: 'ghat',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Sacred ghat on the Mandakini River where evening aarti draws throngs of pilgrims. Spiritual heart of Chitrakoot’s Ramayana landscape.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Kamadgiri_Chitrakoot.jpg/600px-Kamadgiri_Chitrakoot.jpg',
    points: 105,
    rating: 4.6,
  },
  {
    id: 'kamadgiri-parikrama',
    name: 'Kamadgiri Hill',
    city: 'Chitrakoot',
    state: STATE,
    latitude: 25.1750,
    longitude: 80.8583,
    category: 'trek',
    mustVisit: true,
    isHiddenGem: false,
    description:
      'Forest hill considered the spiritual core of Chitrakoot; devotees complete a 5 km parikrama past temples and caves linked to Rama’s exile.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Kamadgiri_Chitrakoot.jpg/600px-Kamadgiri_Chitrakoot.jpg',
    points: 110,
    rating: 4.6,
  },
  {
    id: 'gupta-godavari-chitrakoot',
    name: 'Gupta Godavari Caves',
    city: 'Chitrakoot',
    state: STATE,
    latitude: 25.1500,
    longitude: 80.8500,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Pair of caves with a perennial stream said to be a hidden Godavari. Cool, mystical stop on the Chitrakoot pilgrimage circuit.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Kamadgiri_Chitrakoot.jpg/600px-Kamadgiri_Chitrakoot.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'sphatik-shila-chitrakoot',
    name: 'Sphatik Shila',
    city: 'Chitrakoot',
    state: STATE,
    latitude: 25.1583,
    longitude: 80.8700,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Two rocks on the Mandakini where Rama and Sita are believed to have rested. Footprints and forest river setting — intimate Ramayana lore site.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Kamadgiri_Chitrakoot.jpg/600px-Kamadgiri_Chitrakoot.jpg',
    points: 85,
    rating: 4.4,
  },

  // ─── Mandla / Kanha periphery / Jabalpur extras ───
  {
    id: 'sahastradhara-mandla',
    name: 'Sahastradhara Mandla',
    city: 'Mandla',
    state: STATE,
    latitude: 22.6000,
    longitude: 80.3667,
    category: 'ghat',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Where the Narmada splits into countless streams over rocky beds near Mandla. Sacred bathing spot and photogenic shallow cascades.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'rani-durgavati-memorial-mandla',
    name: 'Rani Durgavati Samadhi Mandla',
    city: 'Mandla',
    state: STATE,
    latitude: 22.6000,
    longitude: 80.3833,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Memorial to the Gond queen Rani Durgavati near Mandla. Quiet historic site honouring her resistance against Mughal forces.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 75,
    rating: 4.2,
  },
  {
    id: 'marble-rocks-viewpoint',
    name: 'Marble Rocks Viewpoint Bhedaghat',
    city: 'Jabalpur',
    state: STATE,
    latitude: 23.1300,
    longitude: 79.8000,
    category: 'trek',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Cliff viewpoints above the Narmada’s white marble gorge — complementary to the boat ride through Marble Rocks. Best light in late afternoon.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 85,
    rating: 4.5,
  },
  {
    id: 'cable-car-bhedaghat',
    name: 'Bhedaghat Cable Car',
    city: 'Jabalpur',
    state: STATE,
    latitude: 23.1289,
    longitude: 79.8017,
    category: 'adventure',
    mustVisit: false,
    isHiddenGem: false,
    description:
      'Ropeway soaring over the Narmada marble gorge and Dhuandhar mist. Short, spectacular ride linking viewpoints above the falls.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 90,
    rating: 4.5,
  },
  {
    id: 'tripuri-tewar',
    name: 'Tripuri (Tewar) Heritage Site',
    city: 'Jabalpur',
    state: STATE,
    latitude: 23.1500,
    longitude: 79.8667,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Ancient capital of the Kalachuri dynasty near Jabalpur, with temple ruins and archaeological remains. Offbeat history stop for heritage travellers.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 80,
    rating: 4.2,
  },

  // ─── Other statewide gems ───
  {
    id: 'narsinghgarh-fort-lake',
    name: 'Narsinghgarh Fort and Lake',
    city: 'Narsinghgarh',
    state: STATE,
    latitude: 23.7000,
    longitude: 77.1000,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Picturesque fort above a lake in Rajgarh district — often called a mini-Switzerland of MP for its green hills and water views. Quiet Malwa getaway.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Kerwa_Dam_Bhopal.jpg/600px-Kerwa_Dam_Bhopal.jpg',
    points: 95,
    rating: 4.4,
  },
  {
    id: 'tawa-reservoir',
    name: 'Tawa Reservoir',
    city: 'Itarsi',
    state: STATE,
    latitude: 22.5000,
    longitude: 78.0000,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Vast reservoir on the Tawa River adjoining Satpura Tiger Reserve. Boating, islands, and monsoon landscapes on the approach to Pachmarhi.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Satpura_National_Park.jpg/600px-Satpura_National_Park.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'orchha-wildlife-sanctuary',
    name: 'Orchha Wildlife Sanctuary',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3667,
    longitude: 78.6500,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Compact sanctuary along the Betwa with walking trails, deer, and birdlife — pair heritage Orchha with a short nature walk.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'ken-gharial-sanctuary',
    name: 'Ken Gharial Sanctuary',
    city: 'Panna',
    state: STATE,
    latitude: 24.8000,
    longitude: 80.1000,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Sanctuary protecting gharials and other wildlife along the Ken River near Panna. Dramatic gorges and riverine habitat for nature lovers.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Panna_National_Park.jpg/600px-Panna_National_Park.jpg',
    points: 95,
    rating: 4.4,
  },
  {
    id: 'gandhi-sagar-sanctuary',
    name: 'Gandhi Sagar Sanctuary',
    city: 'Mandsaur',
    state: STATE,
    latitude: 24.1000,
    longitude: 75.6000,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Wildlife sanctuary around Gandhi Sagar reservoir on the Chambal. Cliffs, waterbirds, and quiet landscapes near Mandsaur’s Pashupatinath circuit.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 85,
    rating: 4.2,
  },
  {
    id: 'chaturbhuj-temple-orchha-ram-raja-view',
    name: 'Raja Mahal Orchha',
    city: 'Orchha',
    state: STATE,
    latitude: 25.3503,
    longitude: 78.6419,
    category: 'palace',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Older Bundela palace within Orchha Fort with murals and courtyard architecture. Less ornate than Jahangir Mahal but rich in early Bundela history.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'sanchi-museum',
    name: 'Sanchi Archaeological Museum',
    city: 'Sanchi',
    state: STATE,
    latitude: 23.4794,
    longitude: 77.7397,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'ASI museum beside the Great Stupa displaying gateways, relics, and sculptures from Sanchi’s Buddhist complex. Essential context for the UNESCO site.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 85,
    rating: 4.4,
  },
  {
    id: 'stupa-2-sanchi',
    name: 'Sanchi Stupa No. 2',
    city: 'Sanchi',
    state: STATE,
    latitude: 23.4817,
    longitude: 77.7367,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Older hilltop stupa west of the Great Stupa, with finely carved railings. Quieter corner of the Sanchi complex often skipped by hurried visitors.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 90,
    rating: 4.5,
  },
  {
    id: 'bhojpur-quarry',
    name: 'Bhojpur Rock Quarry',
    city: 'Bhojpur',
    state: STATE,
    latitude: 23.1000,
    longitude: 77.5833,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Ancient unfinished quarry near Bhojeshwar Temple showing how massive stone blocks were cut for the Shiva lingam temple. Fascinating engineering archaeology.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'halali-dam',
    name: 'Halali Dam (Samrat Ashok Sagar)',
    city: 'Raisen',
    state: STATE,
    latitude: 23.4167,
    longitude: 77.5500,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Large reservoir north of Bhopal popular for weekend nature drives, birding, and monsoon landscapes. Peaceful escape from city noise.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Kerwa_Dam_Bhopal.jpg/600px-Kerwa_Dam_Bhopal.jpg',
    points: 75,
    rating: 4.2,
  },
  {
    id: 'phen-wildlife-sanctuary',
    name: 'Phen Wildlife Sanctuary',
    city: 'Mandla',
    state: STATE,
    latitude: 22.4500,
    longitude: 80.7000,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Buffer wilderness near Kanha Tiger Reserve with similar sal–bamboo habitat. Quieter forest experience for those exploring Mandla’s wild belt.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 85,
    rating: 4.2,
  },
  {
    id: 'singhori-wildlife-sanctuary',
    name: 'Singhori Wildlife Sanctuary',
    city: 'Raisen',
    state: STATE,
    latitude: 23.0000,
    longitude: 78.2000,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Forest sanctuary in Raisen district protecting dry deciduous wildlife corridors. Offbeat nature stop between Bhopal and central MP.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 75,
    rating: 4.1,
  },
  {
    id: 'jamnera-eco-park',
    name: 'Jamnera Hills / Eco Tourism',
    city: 'Jabalpur',
    state: STATE,
    latitude: 23.0500,
    longitude: 79.8500,
    category: 'trek',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hilly eco-tourism pocket near Jabalpur with viewpoints and forest walks — a local weekend nature escape beyond Dumna and Bargi.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg',
    points: 70,
    rating: 4.1,
  },
  {
    id: 'bandhavgarh-fort',
    name: 'Bandhavgarh Fort',
    city: 'Umaria',
    state: STATE,
    latitude: 23.7167,
    longitude: 81.0333,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Ancient fort on a cliff inside Bandhavgarh Tiger Reserve, linked to legends of Rama and Lakshmana. Restricted access via park rules — iconic skyline of the reserve.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Bandhavgarh_Tiger.jpg/600px-Bandhavgarh_Tiger.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'maihar-fort',
    name: 'Maihar Fort',
    city: 'Maihar',
    state: STATE,
    latitude: 24.2667,
    longitude: 80.7667,
    category: 'fort',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Hill fort above Maihar town, often combined with the Sharda Devi temple climb. Views over the Satna–Maihar countryside.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'muktagiri-jain-temples',
    name: 'Muktagiri Jain Temples',
    city: 'Muktagiri',
    state: STATE,
    latitude: 21.4167,
    longitude: 77.5833,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Cluster of Digambar Jain temples in the Satpura foothills near Betul–Amravati border. Waterfalls, forest steps, and white shrines — a serene pilgrimage trek.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Amarkantak_Narmada_Udgam.jpg/600px-Amarkantak_Narmada_Udgam.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'jogi-bhadak-waterfall',
    name: 'Jogi Bhadak Waterfall',
    city: 'Indore',
    state: STATE,
    latitude: 22.52,
    longitude: 75.94,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Lesser-known cascade near the Tincha–Patalpani belt outside Indore. A monsoon trek destination for locals seeking quieter falls.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tincha_Falls.jpg/600px-Tincha_Falls.jpg',
    points: 85,
    rating: 4.3,
  },
  {
    id: 'triveni-museum-ujjain',
    name: 'Triveni Museum Ujjain',
    city: 'Ujjain',
    state: STATE,
    latitude: 23.19,
    longitude: 75.78,
    category: 'museum',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Museum showcasing the culture and history of the Malwa–Ujjain region, complementary to Mahakaleshwar and Shipra ghats.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 70,
    rating: 4.2,
  },
  {
    id: 'chaturbhuj-temple-khajuraho',
    name: 'Chaturbhuj Temple Khajuraho',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.84,
    longitude: 79.93,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Southern Group temple with a large ornate Vishnu image and refined Chandela carving. Quieter than the Western Group yet richly sculpted.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 95,
    rating: 4.5,
  },
  {
    id: 'duladeo-temple-khajuraho',
    name: 'Duladeo Temple Khajuraho',
    city: 'Khajuraho',
    state: STATE,
    latitude: 24.8389,
    longitude: 79.9311,
    category: 'temple',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Late Chandela Shiva temple of the Southern Group with graceful apsara sculptures. Often missed by visitors focused only on Kandariya Mahadeva.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg',
    points: 90,
    rating: 4.4,
  },
  {
    id: 'totladoh-dam-pench',
    name: 'Totladoh Dam Pench',
    city: 'Seoni',
    state: STATE,
    latitude: 21.65,
    longitude: 79.25,
    category: 'lake',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Large reservoir on the Pench River forming the park aquatic edge. Scenic drives and birdlife on the Madhya Pradesh side of Pench.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Pench_National_Park_Tiger.jpg/600px-Pench_National_Park_Tiger.jpg',
    points: 80,
    rating: 4.3,
  },
  {
    id: 'kanha-mukki-zone',
    name: 'Kanha Mukki Gate Zone',
    city: 'Balaghat',
    state: STATE,
    latitude: 22.2,
    longitude: 80.6167,
    category: 'park',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Quieter safari zone of Kanha Tiger Reserve accessed via Mukki gate. Meadows and sal forest with fewer vehicles than Kisli on busy days.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg',
    points: 100,
    rating: 4.5,
  },
  {
    id: 'pashupatinath-ghats-mandsaur',
    name: 'Pashupatinath Ghats Mandsaur',
    city: 'Mandsaur',
    state: STATE,
    latitude: 24.0717,
    longitude: 75.0697,
    category: 'ghat',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Riverfront ghats beside the unique eight-faced Pashupatinath lingam temple on the Shivna River. Spiritual twin experience to the main shrine.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg',
    points: 85,
    rating: 4.4,
  },
  {
    id: 'sukhanandji-neemuch',
    name: 'Sukhanandji Ashram Waterfall',
    city: 'Neemuch',
    state: STATE,
    latitude: 24.45,
    longitude: 74.8667,
    category: 'waterfall',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Ashram and waterfall retreat in Neemuch district — a peaceful Malwa nature-spiritual stop away from major tourist circuits.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tincha_Falls.jpg/600px-Tincha_Falls.jpg',
    points: 80,
    rating: 4.2,
  },
  {
    id: 'chaturbhujnath-nala-rock-art',
    name: 'Chaturbhujnath Nala Rock Art',
    city: 'Bhanpura',
    state: STATE,
    latitude: 24.5167,
    longitude: 75.7333,
    category: 'monument',
    mustVisit: false,
    isHiddenGem: true,
    description:
      'Open-air rock-art galleries in Mandsaur–Bhanpura region with prehistoric paintings along Chaturbhujnath Nala. A true archaeological hidden gem of Malwa.',
    imageUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg',
    points: 110,
    rating: 4.5,
  },
];

for (const p of newPlaces) {
  p.country = COUNTRY;
  if (p.points == null) p.points = p.isHiddenGem ? 85 : 100;
  if (p.rating == null) p.rating = 4.4;
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
console.log('Added ' + added + ' Madhya Pradesh places (skipped ' + skipped.length + ' duplicates).');
console.log('Total curated places: ' + places.length);
const mp = places.filter((x) => x.state === STATE);
console.log(
  'MP total: ' +
    mp.length +
    ' | hidden gems: ' +
    mp.filter((x) => x.isHiddenGem).length +
    ' | must-visit: ' +
    mp.filter((x) => x.mustVisit).length
);
