const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');

let places = [];
if (fs.existsSync(filePath)) {
  places = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const newPlaces = [
  {
    id: "rani-durgavati-museum",
    name: "Rani Durgavati Museum",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1630,
    longitude: 79.9340,
    category: "museum",
    mustVisit: true,
    description: "A museum established in 1976 in memory of the valiant Gond queen Rani Durgavati. It houses a rich collection of ancient sculptures from the Kalachuri period, prehistoric relics, coins, inscriptions, and tribal artifacts spread across galleries dedicated to Shaiva, Vaishnava, Jaina, and tribal art traditions.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Rani_Durgavati_Museum.jpg/600px-Rani_Durgavati_Museum.jpg",
    points: 90,
    isHiddenGem: false,
    country: "India",
    rating: 4.3
  },
  {
    id: "pisanhari-ki-madiya",
    name: "Pisanhari Ki Madiya",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1520,
    longitude: 79.8855,
    category: "religious",
    mustVisit: true,
    description: "A revered 15th-century Digambara Jain temple complex situated on a hilltop, built by a poor woman who saved money from milling flour. Features 13 interconnected temples with intricate marble carvings, a 55-foot Bahubali statue, and panoramic views of Jabalpur city from the summit.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Pisanhari_ki_Madiya.jpg/600px-Pisanhari_ki_Madiya.jpg",
    points: 100,
    isHiddenGem: false,
    country: "India",
    rating: 4.6
  },
  {
    id: "tilwara-ghat",
    name: "Tilwara Ghat",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1042,
    longitude: 79.8778,
    category: "religious",
    mustVisit: true,
    description: "A historic and sacred ghat on the banks of the Narmada River, known as the site where Mahatma Gandhi's ashes were immersed. It also hosted the opening session of the 1939 Tripuri Congress. Features the Gandhi Smarak memorial and offers serene boat rides with views of the Tilwara bridge.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Tilwara_Ghat_Jabalpur.jpg/600px-Tilwara_Ghat_Jabalpur.jpg",
    points: 80,
    isHiddenGem: false,
    country: "India",
    rating: 4.3
  },
  {
    id: "gwarighat",
    name: "Gwarighat and Gurudwara Sahib",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1466,
    longitude: 79.9008,
    category: "religious",
    mustVisit: false,
    description: "A prominent riverfront ghat on the Narmada featuring the historic Gurudwara Gwarighat Sahib atop a small hill. The gurudwara offers splendid views of the river and is an important Sikh pilgrimage site in Madhya Pradesh. The evening aarti at the ghat draws large numbers of devotees.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Gwarighat_Jabalpur.jpg/600px-Gwarighat_Jabalpur.jpg",
    points: 75,
    isHiddenGem: false,
    country: "India",
    rating: 4.4
  },
  {
    id: "bhadbhada-falls",
    name: "Bhadbhada Falls",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.0869,
    longitude: 79.9765,
    category: "nature",
    mustVisit: false,
    description: "A scenic waterfall located on the outskirts of Jabalpur, cascading down rocky terrain surrounded by dense forest. Particularly spectacular during the monsoon season when the water flow is at its peak. A popular spot for nature lovers and picnickers seeking a peaceful retreat.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Bhadbhada_Falls_Jabalpur.jpg/600px-Bhadbhada_Falls_Jabalpur.jpg",
    points: 70,
    isHiddenGem: true,
    country: "India",
    rating: 4.4
  },
  {
    id: "sangram-sagar-lake",
    name: "Sangram Sagar Lake",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1286,
    longitude: 79.9017,
    category: "nature",
    mustVisit: false,
    description: "A historic lake built by the Gond queen Rani Durgavati, featuring a small fort-like structure on its banks. Surrounded by lush gardens and ancient trees, it is a peaceful spot for evening walks, boating, and bird watching. The adjacent Sangram Sagar Park is a popular family destination.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Sangram_Sagar_Lake.jpg/600px-Sangram_Sagar_Lake.jpg",
    points: 60,
    isHiddenGem: true,
    country: "India",
    rating: 4.2
  },
  {
    id: "ghughra-falls",
    name: "Ghughra Falls",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1038,
    longitude: 79.8330,
    category: "nature",
    mustVisit: false,
    description: "A lesser-known but spectacular waterfall located near Bhedaghat, cascading over layered rock formations amidst dense greenery. The name 'Ghughra' is derived from the local dialect. Best visited during the monsoon season when the waterfall is in full flow and the surrounding landscape is lush.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Ghughra_Falls_Jabalpur.jpg/600px-Ghughra_Falls_Jabalpur.jpg",
    points: 75,
    isHiddenGem: true,
    country: "India",
    rating: 4.3
  },
  {
    id: "lamheta-ghat",
    name: "Lamheta Ghat",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1167,
    longitude: 79.8833,
    category: "religious",
    mustVisit: false,
    description: "A serene and less-crowded ghat on the Narmada River, perfect for those seeking peace and solitude. The ghat features ancient stone steps leading to the river, surrounded by scenic natural beauty. An ideal spot for quiet contemplation, evening walks, and watching the sunset over the Narmada.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Lamheta_Ghat_Jabalpur.jpg/600px-Lamheta_Ghat_Jabalpur.jpg",
    points: 50,
    isHiddenGem: true,
    country: "India",
    rating: 4.1
  },
  {
    id: "roopnath-temple",
    name: "Roopnath Temple",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1000,
    longitude: 79.8500,
    category: "religious",
    mustVisit: false,
    description: "An ancient temple dedicated to Lord Shiva, featuring distinctive architectural elements from the Kalachuri period. The temple is surrounded by scenic countryside and offers a tranquil atmosphere for meditation and worship. Its historical significance and peaceful location make it a hidden gem.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Roopnath_Temple_Jabalpur.jpg/600px-Roopnath_Temple_Jabalpur.jpg",
    points: 55,
    isHiddenGem: true,
    country: "India",
    rating: 4.0
  },
  {
    id: "shaheed-smarak-jabalpur",
    name: "Shaheed Smarak",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.1633,
    longitude: 79.9278,
    category: "history",
    mustVisit: false,
    description: "A memorial park dedicated to the martyrs who sacrificed their lives for India's freedom. Located in the heart of the city near the Rani Durgavati Museum, the well-maintained park features a towering memorial structure, lush green lawns, and is a popular spot for morning walks and patriotic gatherings.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Shaheed_Smarak_Jabalpur.jpg/600px-Shaheed_Smarak_Jabalpur.jpg",
    points: 40,
    isHiddenGem: false,
    country: "India",
    rating: 4.2
  },
  {
    id: "khandari-dam-jabalpur",
    name: "Khandari Dam",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    latitude: 23.0833,
    longitude: 79.9333,
    category: "nature",
    mustVisit: false,
    description: "A peaceful reservoir and dam surrounded by scenic natural beauty, popular for picnics and weekend getaways. The calm waters and surrounding greenery make it an ideal spot for relaxation, bird watching, and photography. Best visited during the post-monsoon season when the reservoir is full.",
    imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Khandari_Dam_Jabalpur.jpg/600px-Khandari_Dam_Jabalpur.jpg",
    points: 50,
    isHiddenGem: true,
    country: "India",
    rating: 4.0
  }
];

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
console.log(`Added ${added} new places in Jabalpur. Total places: ${places.length}`);
