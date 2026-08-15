const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');

// Create file with empty array if it doesn't exist
let places = [];
if (fs.existsSync(filePath)) {
  places = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const newPlaces = [
  // Khajuraho
  {
    id: "khajuraho-temples",
    name: "Khajuraho Group of Monuments",
    city: "Khajuraho",
    state: "Madhya Pradesh",
    latitude: 24.8500,
    longitude: 79.9300,
    category: "history",
    mustVisit: true,
    description: "A UNESCO World Heritage site comprising Hindu and Jain temples built by the Chandela dynasty between the 10th and 12th centuries. Famous for their exquisite Nagara-style architecture and intricate erotic carvings depicting human emotions and daily life.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Khajuraho_-_Kandariya_Mahadeo_Temple.jpg/600px-Khajuraho_-_Kandariya_Mahadeo_Temple.jpg",
    points: 180,
    isHiddenGem: false,
    country: "India",
    rating: 4.8
  },

  // Bhedaghat / Dhuandhar Falls
  {
    id: "bhedaghat-dhuandhar",
    name: "Bhedaghat and Dhuandhar Falls",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1263,
    longitude: 79.8076,
    category: "nature",
    mustVisit: true,
    description: "A breathtaking gorge of marble rocks on the Narmada River, rising up to 100 feet. The Dhuandhar Falls ('smoke cascade') plummets 30 meters through a narrow channel, creating a powerful mist. Boating among the marble cliffs and cable car rides offer stunning views.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Marble_Rocks_at_Bhedaghat.jpg/600px-Marble_Rocks_at_Bhedaghat.jpg",
    points: 130,
    isHiddenGem: false,
    country: "India",
    rating: 4.7
  },

  // Kanha National Park
  {
    id: "kanha-national-park",
    name: "Kanha National Park",
    city: "Mandla",
    state: "Madhya Pradesh",
    latitude: 22.3347,
    longitude: 80.6115,
    category: "wildlife",
    mustVisit: true,
    description: "One of India's finest tiger reserves and the inspiration for Rudyard Kipling's 'The Jungle Book'. Spanning over 940 sq km of sal and bamboo forests, rolling grasslands, and winding streams. Home to tigers, leopards, barasingha (swamp deer), and over 300 bird species.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Barasingha_Kanha_National_Park.jpg/600px-Barasingha_Kanha_National_Park.jpg",
    points: 170,
    isHiddenGem: false,
    country: "India",
    rating: 4.8
  },

  // Bandhavgarh National Park
  {
    id: "bandhavgarh-national-park",
    name: "Bandhavgarh National Park",
    city: "Umaria",
    state: "Madhya Pradesh",
    latitude: 23.6964,
    longitude: 81.0133,
    category: "wildlife",
    mustVisit: true,
    description: "Known for having the highest density of tigers in India, making it one of the best places to spot the Royal Bengal Tiger in the wild. The park also features the ancient Bandhavgarh Fort perched on a 800-meter high cliff, surrounded by dense forests.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Bandhavgarh_Tiger.jpg/600px-Bandhavgarh_Tiger.jpg",
    points: 170,
    isHiddenGem: false,
    country: "India",
    rating: 4.7
  },

  // Pachmarhi
  {
    id: "pachmarhi",
    name: "Pachmarhi",
    city: "Pachmarhi",
    state: "Madhya Pradesh",
    latitude: 22.4680,
    longitude: 78.4333,
    category: "nature",
    mustVisit: true,
    description: "The only hill station of Madhya Pradesh, known as the 'Queen of Satpura'. Situated at an elevation of 1,067 m in the Satpura Range, it offers ancient Buddhist caves, cascading waterfalls like Bee Falls and Duchess Falls, scenic viewpoints like Dhoopgarh, and dense forests.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Pachmarhi_view.jpg/600px-Pachmarhi_view.jpg",
    points: 150,
    isHiddenGem: false,
    country: "India",
    rating: 4.6
  },

  // Mahakaleshwar Temple, Ujjain
  {
    id: "mahakaleshwar-ujjain",
    name: "Mahakaleshwar Temple",
    city: "Ujjain",
    state: "Madhya Pradesh",
    latitude: 23.1828,
    longitude: 75.7683,
    category: "religious",
    mustVisit: true,
    description: "One of the twelve Jyotirlingas and the only south-facing (Dakshinamurti) Jyotirlinga in India. The daily Bhasma Aarti at dawn, where the lingam is adorned with sacred ash, is a unique ritual not performed at any other Jyotirlinga temple. A major pilgrimage site and host of the Kumbh Mela every 12 years.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mahakaleshwar_Temple_Ujjain.jpg/600px-Mahakaleshwar_Temple_Ujjain.jpg",
    points: 200,
    isHiddenGem: false,
    country: "India",
    rating: 4.9
  },

  // Omkareshwar Temple
  {
    id: "omkareshwar-temple",
    name: "Omkareshwar Temple",
    city: "Omkareshwar",
    state: "Madhya Pradesh",
    latitude: 22.2453,
    longitude: 76.1503,
    category: "religious",
    mustVisit: true,
    description: "One of the twelve Jyotirlingas, situated on an island shaped like the sacred symbol 'Om' in the Narmada River. The temple is a masterpiece of architecture with intricate carvings, and the serene riverfront setting adds to its spiritual ambiance. Accessible by boat from both banks.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Omkareshwar_Temple.jpg/600px-Omkareshwar_Temple.jpg",
    points: 170,
    isHiddenGem: false,
    country: "India",
    rating: 4.7
  },

  // Gwalior Fort
  {
    id: "gwalior-fort",
    name: "Gwalior Fort",
    city: "Gwalior",
    state: "Madhya Pradesh",
    latitude: 26.2302,
    longitude: 78.1686,
    category: "history",
    mustVisit: true,
    description: "One of the largest and most magnificent forts in India, perched on a steep sandstone hill. Its history spans over a thousand years, featuring the stunning Teli-ka-Mandir, Sas-Bahu temples, Gujari Mahal, and the iconic blue-tiled palaces. Illuminated beautifully at night with a spectacular sound and light show.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Gwalior_Fort.jpg/600px-Gwalior_Fort.jpg",
    points: 160,
    isHiddenGem: false,
    country: "India",
    rating: 4.7
  },

  // Orchha
  {
    id: "orchha-fort",
    name: "Orchha Fort Complex",
    city: "Orchha",
    state: "Madhya Pradesh",
    latitude: 25.3500,
    longitude: 78.6417,
    category: "history",
    mustVisit: true,
    description: "A magnificent 16th-century palace complex built by the Bundela Rajput rulers on an island in the Betwa River. Highlights include the Jahangir Mahal, Raja Mahal, and the soaring Chaturbhuj Temple. The towering cenotaphs (chhatris) on the riverbank offer one of the most photographed sunset views in India.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Orchha_Fort.jpg/600px-Orchha_Fort.jpg",
    points: 140,
    isHiddenGem: false,
    country: "India",
    rating: 4.6
  },

  // Mandu
  {
    id: "mandu-mandav",
    name: "Mandu (Mandav)",
    city: "Mandu",
    state: "Madhya Pradesh",
    latitude: 22.3386,
    longitude: 75.3972,
    category: "history",
    mustVisit: true,
    description: "A magnificent fortified city of the Afghan and Mughal era, known for its remarkable architecture blending Afghan and Hindu styles. Key attractions include the Jahaz Mahal (Ship Palace), Hindola Mahal (Swinging Palace), Rani Roopmati Pavilion, and the massive Jami Masjid. A UNESCO World Heritage tentative site.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Jahaz_Mahal_Mandu.jpg/600px-Jahaz_Mahal_Mandu.jpg",
    points: 130,
    isHiddenGem: false,
    country: "India",
    rating: 4.5
  },

  // Maheshwar
  {
    id: "maheshwar",
    name: "Maheshwar",
    city: "Maheshwar",
    state: "Madhya Pradesh",
    latitude: 22.1760,
    longitude: 75.5944,
    category: "history",
    mustVisit: true,
    description: "A historic town on the northern bank of the Narmada River, known for the magnificent Ahilya Fort built by Rani Ahilyabai Holkar in the 18th century. The ghats along the river, adorned with carved stone steps and temples, offer spectacular sunset views. Famous worldwide for its handwoven Maheshwari sarees.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Ahilya_Fort_Maheshwar.jpg/600px-Ahilya_Fort_Maheshwar.jpg",
    points: 120,
    isHiddenGem: false,
    country: "India",
    rating: 4.6
  },

  // Pench National Park
  {
    id: "pench-national-park",
    name: "Pench National Park",
    city: "Seoni",
    state: "Madhya Pradesh",
    latitude: 21.7583,
    longitude: 79.2833,
    category: "wildlife",
    mustVisit: true,
    description: "A premier tiger reserve and the landscape believed to have inspired Rudyard Kipling's 'The Jungle Book'. Named after the Pench River that flows through its heart, the park is home to a thriving population of tigers, leopards, wild dogs, and the Indian bison (gaur). Known for its dense teak forests and open meadows.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Pench_National_Park_Tiger.jpg/600px-Pench_National_Park_Tiger.jpg",
    points: 140,
    isHiddenGem: false,
    country: "India",
    rating: 4.6
  },

  // Amarkantak
  {
    id: "amarkantak",
    name: "Amarkantak",
    city: "Amarkantak",
    state: "Madhya Pradesh",
    latitude: 22.6833,
    longitude: 81.7500,
    category: "religious",
    mustVisit: false,
    description: "A sacred pilgrimage town and the origin point of the Narmada River, nestled in the Maikal Hills of the Satpura Range. The Narmada Udgam temple marks the river's source, surrounded by ancient temples and dense forests. Known for its tranquil atmosphere, scenic viewpoints, and the unique 'Narmada Parikrama' pilgrimage route.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Amarkantak_Narmada_Udgam.jpg/600px-Amarkantak_Narmada_Udgam.jpg",
    points: 110,
    isHiddenGem: true,
    country: "India",
    rating: 4.5
  },

  // Chitrakoot
  {
    id: "chitrakoot",
    name: "Chitrakoot",
    city: "Chitrakoot",
    state: "Madhya Pradesh",
    latitude: 25.1833,
    longitude: 80.8667,
    category: "religious",
    mustVisit: false,
    description: "A sacred town associated with the epic Ramayana, where Lord Rama, Sita, and Lakshmana spent 11 years of their exile. Key sites include Kamadgiri, a hill considered the heart of Chitrakoot, Bharat Milap Temple, and the serene Ramghat on the Mandakini River. A major pilgrimage destination of deep spiritual significance.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Kamadgiri_Chitrakoot.jpg/600px-Kamadgiri_Chitrakoot.jpg",
    points: 100,
    isHiddenGem: false,
    country: "India",
    rating: 4.4
  },

  // Panna National Park
  {
    id: "panna-national-park",
    name: "Panna National Park",
    city: "Panna",
    state: "Madhya Pradesh",
    latitude: 24.7167,
    longitude: 80.0167,
    category: "wildlife",
    mustVisit: false,
    description: "A famous tiger reserve along the Ken River, known for its remarkable tiger reintroduction success story. The park's dramatic terrain of steep rocky gorges, dense forests, and the glistening Ken River make it a scenic wildlife destination. Also famous for the historic Panna diamond mines nearby.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Panna_National_Park.jpg/600px-Panna_National_Park.jpg",
    points: 120,
    isHiddenGem: true,
    country: "India",
    rating: 4.5
  },

  // Satpura National Park
  {
    id: "satpura-national-park",
    name: "Satpura National Park",
    city: "Pachmarhi",
    state: "Madhya Pradesh",
    latitude: 22.4400,
    longitude: 78.3800,
    category: "wildlife",
    mustVisit: false,
    description: "A unique tiger reserve within the Satpura Range offering exclusive walking safaris, canoe rides, and night stays inside the forest — activities not permitted in most Indian parks. Its rugged terrain features sandstone peaks, deep valleys, rivers, and dense forests. Part of the Pachmarhi Biosphere Reserve, a UNESCO designated site.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Satpura_National_Park.jpg/600px-Satpura_National_Park.jpg",
    points: 130,
    isHiddenGem: true,
    country: "India",
    rating: 4.5
  }
];

// Deduplicate and add
let added = 0;
for (const np of newPlaces) {
  const exists = places.some(p =>
    p.id === np.id || p.name.toLowerCase() === np.name.toLowerCase()
  );
  if (!exists) {
    places.push(np);
    added++;
  }
}

fs.writeFileSync(filePath, JSON.stringify(places, null, 2), 'utf-8');
console.log(`Added ${added} new places across Madhya Pradesh. Total places: ${places.length}`);
