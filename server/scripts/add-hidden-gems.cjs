const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');
const rawData = fs.readFileSync(filePath, 'utf-8');
const places = JSON.parse(rawData);

const hiddenGems = [
  // Delhi
  { id: "agrasen-ki-baoli-delhi", name: "Agrasen ki Baoli", city: "New Delhi", state: "Delhi", latitude: 28.6260, longitude: 77.2250, category: "history", mustVisit: false, description: "A beautifully preserved 14th-century stepwell hidden right in the middle of Delhi's bustling Connaught Place.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Agrasen_Ki_Baoli%2C_Delhi.jpg/600px-Agrasen_Ki_Baoli%2C_Delhi.jpg", points: 80, isHiddenGem: true, country: "India", rating: 4.5 },
  { id: "sanjay-van-delhi", name: "Sanjay Van", city: "New Delhi", state: "Delhi", latitude: 28.5358, longitude: 77.1819, category: "nature", mustVisit: false, description: "A vast and dense city forest area near Vasant Kunj, offering peace, numerous bird species, and ancient ruins.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Sanjay_Van_Delhi.jpg/600px-Sanjay_Van_Delhi.jpg", points: 70, isHiddenGem: true, country: "India", rating: 4.4 },
  { id: "mehrauli-park-delhi", name: "Mehrauli Archaeological Park", city: "New Delhi", state: "Delhi", latitude: 28.5190, longitude: 77.1852, category: "history", mustVisit: false, description: "An archaeological area spread over 200 acres consisting of over 100 historically significant monuments.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Jamali_Kamali_Mosque_and_Tomb.jpg/600px-Jamali_Kamali_Mosque_and_Tomb.jpg", points: 90, isHiddenGem: true, country: "India", rating: 4.6 },

  // Bhopal
  { id: "manuabhan-tekri-bhopal", name: "Manuabhan Tekri", city: "Bhopal", state: "Madhya Pradesh", latitude: 23.2847, longitude: 77.3683, category: "religious", mustVisit: false, description: "A Jain temple situated on a hilltop accessible via a ropeway, offering panoramic views of Bhopal city.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Bhopal_Ropeway.jpg/600px-Bhopal_Ropeway.jpg", points: 75, isHiddenGem: true, country: "India", rating: 4.5 },
  { id: "kerwa-dam-bhopal", name: "Kerwa Dam", city: "Bhopal", state: "Madhya Pradesh", latitude: 23.1678, longitude: 77.3789, category: "nature", mustVisit: false, description: "A serene eco-tourism spot with dense forests, water activities, and a peaceful environment away from the city.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Kerwa_Dam_Bhopal.jpg/600px-Kerwa_Dam_Bhopal.jpg", points: 85, isHiddenGem: true, country: "India", rating: 4.6 },
  { id: "sair-sapata-bhopal", name: "Sair Sapata", city: "Bhopal", state: "Madhya Pradesh", latitude: 23.2104, longitude: 77.3820, category: "entertainment", mustVisit: false, description: "A beautiful tourism and entertainment complex along the Upper Lake with a suspension bridge and toy train.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Sair_Sapata_Bhopal.jpg/600px-Sair_Sapata_Bhopal.jpg", points: 65, isHiddenGem: true, country: "India", rating: 4.4 },

  // Indore
  { id: "ralamandal-sanctuary-indore", name: "Ralamandal Wildlife Sanctuary", city: "Indore", state: "Madhya Pradesh", latitude: 22.6517, longitude: 75.8820, category: "wildlife", mustVisit: false, description: "The oldest wildlife sanctuary in Madhya Pradesh, featuring a historic hunting lodge and diverse flora and fauna.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Ralamandal_Wildlife_Sanctuary.jpg/600px-Ralamandal_Wildlife_Sanctuary.jpg", points: 80, isHiddenGem: true, country: "India", rating: 4.5 },
  { id: "tincha-falls-indore", name: "Tincha Falls", city: "Indore", state: "Madhya Pradesh", latitude: 22.5694, longitude: 75.9525, category: "waterfall", mustVisit: false, description: "A spectacular waterfall located in a deep gorge near Indore, a perfect weekend nature retreat during monsoons.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tincha_Falls.jpg/600px-Tincha_Falls.jpg", points: 90, isHiddenGem: true, country: "India", rating: 4.6 },

  // Mumbai
  { id: "banganga-tank-mumbai", name: "Banganga Tank", city: "Mumbai", state: "Maharashtra", latitude: 18.9446, longitude: 72.7937, category: "history", mustVisit: false, description: "An ancient water tank in the Malabar Hill area, surrounded by historic temples. A peaceful oasis in busy Mumbai.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Banganga_Tank_Mumbai.jpg/600px-Banganga_Tank_Mumbai.jpg", points: 85, isHiddenGem: true, country: "India", rating: 4.7 },
  { id: "global-vipassana-pagoda", name: "Global Vipassana Pagoda", city: "Mumbai", state: "Maharashtra", latitude: 19.2284, longitude: 72.8058, category: "religious", mustVisit: false, description: "A massive meditation hall and monument of peace featuring the world's largest stone dome built without supporting pillars.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Global_Vipassana_Pagoda.jpg/600px-Global_Vipassana_Pagoda.jpg", points: 100, isHiddenGem: true, country: "India", rating: 4.8 },
  { id: "vasai-fort-mumbai", name: "Vasai Fort (Bassein)", city: "Vasai", state: "Maharashtra", latitude: 19.3297, longitude: 72.8144, category: "history", mustVisit: false, description: "Expansive ruins of an ancient Portuguese fort providing a hauntingly beautiful glimpse into the region's colonial past.", imageUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Vasai_Fort.jpg/600px-Vasai_Fort.jpg", points: 95, isHiddenGem: true, country: "India", rating: 4.6 }
];

let added = 0;
for (const hg of hiddenGems) {
  const exists = places.some(p => p.id === hg.id || p.name.toLowerCase() === hg.name.toLowerCase());
  if (!exists) {
    places.push(hg);
    added++;
  }
}

fs.writeFileSync(filePath, JSON.stringify(places, null, 2), 'utf-8');
console.log(`Added ${added} new hidden gems. Total places: ${places.length}`);
