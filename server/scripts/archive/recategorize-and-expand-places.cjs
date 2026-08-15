/**
 * Recategorize all curated places into canonical tourist categories
 * and add major missing India attractions.
 *
 * Categories: ghat, temple, waterfall, mosque, church, gurudwara,
 * monument, museum, park, lake, fort, beach, market, trek, palace, adventure
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../prisma/seed-data/places-curated.json');
const places = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const VALID = new Set([
  'ghat', 'temple', 'waterfall', 'mosque', 'church', 'gurudwara',
  'monument', 'museum', 'park', 'lake', 'fort', 'beach', 'market',
  'trek', 'palace', 'adventure',
]);

function textOf(p) {
  return `${p.name || ''} ${p.description || ''} ${p.category || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
}

function inferCategory(p) {
  const t = textOf(p);
  const name = (p.name || '').toLowerCase();

  // Name-first signals (most reliable)
  if (/\bghat\b|ghaat/.test(name)) return 'ghat';
  if (/waterfall|falls\b/.test(name)) return 'waterfall';
  if (/gurudwara|gurdwara|harmandir sahib|^golden temple$/.test(name)) return 'gurudwara';
  if (/mosque|masjid/.test(name)) return 'mosque';
  if (/\bchurch\b|cathedral|basilica/.test(name)) return 'church';
  if (/museum|sangrahalaya|gallery/.test(name)) return 'museum';
  if (/\bbeach\b/.test(name)) return 'beach';
  if (/\blake\b|talao|talab|\bsagar\b|reservoir|\bdam\b/.test(name)) return 'lake';
  if (/market|bazaar|bazar|chowk/.test(name)) return 'market';
  if (/\btrek\b|trekking/.test(name)) return 'trek';
  if (/\bfort\b|qila|\bgarh\b/.test(name)) return 'fort';
  if (/palace|mahal\b/.test(name) && !/temple|museum/.test(name)) return 'palace';
  if (/national park|wildlife sanctuary|bird sanctuary|nature reserve|botanical|garden|\bpark\b|\bzoo\b/.test(name)) return 'park';
  if (/temple|mandir|kovil|jyotirlinga/.test(name)) return 'temple';

  // Description / text signals
  if (/\bghat\b|ghaat/.test(t)) return 'ghat';
  if (/waterfall|falls\b|cascade/.test(t)) return 'waterfall';
  if (/gurudwara|gurdwara|harmandir sahib/.test(t)) return 'gurudwara';
  if (/mosque|masjid/.test(t) && !/fortified city|fort complex|palace complex/.test(t)) return 'mosque';
  if (/\bchurch\b|cathedral|basilica|chapel/.test(t)) return 'church';
  if (/museum|gallery|planetarium/.test(t)) return 'museum';
  if (/\bbeach\b|seashore|sea shore/.test(t)) return 'beach';
  if (/\blake\b|talao|talab|reservoir/.test(t) && !/\bfort\b|palace|temple/.test(name)) return 'lake';
  if (/market|bazaar|bazar|shopping street|spice market/.test(t)) return 'market';
  if (/\btrek\b|trekking|hiking trail/.test(t)) return 'trek';
  if (/paragliding|rafting|bungee|zip.?line|scuba|snorkeling|bike expedition|white water/.test(t)) return 'adventure';
  if (/national park|wildlife sanctuary|tiger reserve|bird sanctuary|botanical|nature reserve|\bpark\b|\bgarden\b|\bzoo\b/.test(t)) return 'park';
  if (/\bfort\b|qila|citadel|fortress|fortified/.test(t)) return 'fort';
  if (/palace|haveli|royal residence/.test(t) && !/temple|museum/.test(name)) return 'palace';
  if (/temple|mandir|kovil|devalaya|jyotirlinga|monastery|gompa|stupa|buddhist/.test(t)) return 'temple';
  if (/safari|adventure|camping|rock climb|caving/.test(t)) return 'adventure';
  if (/monument|memorial|minar|gate of india|india gate|charminar|qutub|qutb|statue of|rock shelters|caves\b|unesco|geological|balancing rock/.test(t)) return 'monument';

  // Fallbacks from old coarse categories
  const old = (p.category || '').toLowerCase();
  if (VALID.has(old)) return old;
  if (old === 'beach') return 'beach';
  if (old === 'waterfall') return 'waterfall';
  if (old === 'museum') return 'museum';
  if (old === 'park') return 'park';
  if (old === 'wildlife' || old === 'nature') return 'park';
  if (old === 'religious' || old === 'spiritual') return 'temple';
  if (old === 'monument') return 'monument';
  if (old === 'history' || old === 'heritage') return 'monument';
  if (old === 'food' || old === 'entertainment') return 'market';

  return 'monument';
}

let changed = 0;
for (const p of places) {
  const next = inferCategory(p);
  if (!VALID.has(next)) throw new Error(`Invalid category for ${p.name}: ${next}`);
  if (p.category !== next) {
    p.category = next;
    changed++;
  }
  // Ensure city/state/country and coords
  if (!p.city || !String(p.city).trim()) p.city = p.state || 'India';
  if (!p.state || !String(p.state).trim()) p.state = 'India';
  if (!p.country) p.country = 'India';
  p.latitude = Number(p.latitude);
  p.longitude = Number(p.longitude);
}

const NEW_PLACES = [
  // Mosques
  { id: 'taj-ul-masajid-bhopal', name: 'Taj-ul-Masajid', city: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2635, longitude: 77.3927, category: 'mosque', mustVisit: true, description: 'One of the largest mosques in Asia, known as the Crown of Mosques, with imposing pink facade and twin minarets overlooking Upper Lake.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Taj-ul-Masajid.jpg/600px-Taj-ul-Masajid.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'mecca-masjid-hyderabad', name: 'Mecca Masjid', city: 'Hyderabad', state: 'Telangana', latitude: 17.3605, longitude: 78.4737, category: 'mosque', mustVisit: true, description: 'One of the largest mosques in India, built with bricks from Mecca, beside Charminar in the old city of Hyderabad.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Mecca_Masjid.jpg/600px-Mecca_Masjid.jpg', points: 90, isHiddenGem: false, country: 'India', rating: 4.5 },
  { id: 'haji-ali-dargah-mumbai', name: 'Haji Ali Dargah', city: 'Mumbai', state: 'Maharashtra', latitude: 18.9827, longitude: 72.8089, category: 'mosque', mustVisit: true, description: 'Iconic mosque and dargah on an islet in the Arabian Sea, connected by a narrow causeway that submerges at high tide.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Haji_Ali_Dargah.jpg/600px-Haji_Ali_Dargah.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'sidi-saiyyed-mosque-ahmedabad', name: 'Sidi Saiyyed Mosque', city: 'Ahmedabad', state: 'Gujarat', latitude: 23.0267, longitude: 72.5810, category: 'mosque', mustVisit: true, description: 'Famous for its exquisite jali (stone lattice) windows depicting the Tree of Life, a symbol of Ahmedabad.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Sidi_Saiyyed_Mosque.jpg/600px-Sidi_Saiyyed_Mosque.jpg', points: 80, isHiddenGem: false, country: 'India', rating: 4.5 },
  { id: 'hazratbal-shrine-srinagar', name: 'Hazratbal Shrine', city: 'Srinagar', state: 'Jammu and Kashmir', latitude: 34.1296, longitude: 74.8424, category: 'mosque', mustVisit: true, description: 'White marble mosque on the banks of Dal Lake, housing a relic believed to be a hair of Prophet Muhammad.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Hazratbal_Mosque.jpg/600px-Hazratbal_Mosque.jpg', points: 110, isHiddenGem: false, country: 'India', rating: 4.7 },

  // Churches
  { id: 'basilica-bom-jesus-goa', name: 'Basilica of Bom Jesus', city: 'Old Goa', state: 'Goa', latitude: 15.5009, longitude: 73.9116, category: 'church', mustVisit: true, description: 'UNESCO World Heritage baroque church holding the mortal remains of St. Francis Xavier.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Basilica_of_Bom_Jesus.jpg/600px-Basilica_of_Bom_Jesus.jpg', points: 120, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'st-thomas-cathedral-mumbai', name: 'St. Thomas Cathedral', city: 'Mumbai', state: 'Maharashtra', latitude: 18.9320, longitude: 72.8347, category: 'church', mustVisit: false, description: 'Mumbai\'s oldest British-era Anglican church, dating to 1718, near Flora Fountain.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/St_Thomas_Cathedral_Mumbai.jpg/600px-St_Thomas_Cathedral_Mumbai.jpg', points: 60, isHiddenGem: true, country: 'India', rating: 4.3 },
  { id: 'san-thome-basilica-chennai', name: 'San Thome Basilica', city: 'Chennai', state: 'Tamil Nadu', latitude: 13.0336, longitude: 80.2775, category: 'church', mustVisit: true, description: 'Roman Catholic basilica built over the tomb of St. Thomas the Apostle on the Marina Beach shore.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/San_Thome_Basilica.jpg/600px-San_Thome_Basilica.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'christ-church-shimla', name: 'Christ Church Shimla', city: 'Shimla', state: 'Himachal Pradesh', latitude: 31.1046, longitude: 77.1734, category: 'church', mustVisit: true, description: 'Second-oldest church in North India, a neo-Gothic landmark on The Ridge of Shimla.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Christ_Church_Shimla.jpg/600px-Christ_Church_Shimla.jpg', points: 80, isHiddenGem: false, country: 'India', rating: 4.5 },
  { id: 'st-paul-cathedral-kolkata', name: 'St. Paul\'s Cathedral', city: 'Kolkata', state: 'West Bengal', latitude: 22.5448, longitude: 88.3468, category: 'church', mustVisit: true, description: 'Anglican cathedral in Indo-Gothic style, one of Kolkata\'s most photographed heritage churches.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/St_Pauls_Cathedral_Kolkata.jpg/600px-St_Pauls_Cathedral_Kolkata.jpg', points: 90, isHiddenGem: false, country: 'India', rating: 4.5 },

  // Gurudwaras
  { id: 'golden-temple-amritsar', name: 'Golden Temple (Harmandir Sahib)', city: 'Amritsar', state: 'Punjab', latitude: 31.6200, longitude: 74.8765, category: 'gurudwara', mustVisit: true, description: 'Holiest Sikh shrine, gold-plated sanctum in the middle of the Amrit Sarovar sacred pool.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Golden_Temple_Amritsar.jpg/600px-Golden_Temple_Amritsar.jpg', points: 200, isHiddenGem: false, country: 'India', rating: 4.9 },
  { id: 'bangla-sahib-delhi', name: 'Gurudwara Bangla Sahib', city: 'New Delhi', state: 'Delhi', latitude: 28.6264, longitude: 77.2090, category: 'gurudwara', mustVisit: true, description: 'Prominent Sikh house of worship known for its golden dome, sarovar, and free langar for all visitors.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Gurudwara_Bangla_Sahib.jpg/600px-Gurudwara_Bangla_Sahib.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'hemkund-sahib-uttarakhand', name: 'Hemkund Sahib', city: 'Chamoli', state: 'Uttarakhand', latitude: 30.6980, longitude: 79.6150, category: 'gurudwara', mustVisit: true, description: 'High-altitude Sikh shrine at 4,329 m near a glacial lake, reached by a steep Himalayan trek.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Hemkund_Sahib.jpg/600px-Hemkund_Sahib.jpg', points: 180, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'patna-sahib-bihar', name: 'Takht Sri Patna Sahib', city: 'Patna', state: 'Bihar', latitude: 25.5995, longitude: 85.2305, category: 'gurudwara', mustVisit: true, description: 'One of the five Takhts of Sikhism, marking the birthplace of Guru Gobind Singh.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Patna_Sahib.jpg/600px-Patna_Sahib.jpg', points: 120, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'anandpur-sahib-punjab', name: 'Takht Sri Kesgarh Sahib', city: 'Anandpur Sahib', state: 'Punjab', latitude: 31.2350, longitude: 76.5020, category: 'gurudwara', mustVisit: true, description: 'Birthplace of the Khalsa, a major Sikh pilgrimage centre in the Shivalik foothills.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Anandpur_Sahib.jpg/600px-Anandpur_Sahib.jpg', points: 130, isHiddenGem: false, country: 'India', rating: 4.7 },

  // Markets
  { id: 'chandni-chowk-delhi', name: 'Chandni Chowk', city: 'Old Delhi', state: 'Delhi', latitude: 28.6506, longitude: 77.2303, category: 'market', mustVisit: true, description: 'Historic Mughal-era bazaar packed with street food, spices, jewellery, and wholesale lanes beside Red Fort.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Chandni_Chowk.jpg/600px-Chandni_Chowk.jpg', points: 80, isHiddenGem: false, country: 'India', rating: 4.4 },
  { id: 'laad-bazaar-hyderabad', name: 'Laad Bazaar', city: 'Hyderabad', state: 'Telangana', latitude: 17.3614, longitude: 78.4746, category: 'market', mustVisit: true, description: 'Colourful market near Charminar famous for lac bangles, pearls, and Hyderabadi wedding jewellery.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Laad_Bazaar.jpg/600px-Laad_Bazaar.jpg', points: 70, isHiddenGem: false, country: 'India', rating: 4.4 },
  { id: 'crawford-market-mumbai', name: 'Crawford Market', city: 'Mumbai', state: 'Maharashtra', latitude: 18.9470, longitude: 72.8342, category: 'market', mustVisit: false, description: 'Colonial-era covered market for fresh fruit, spices, and household goods in South Mumbai.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Crawford_Market.jpg/600px-Crawford_Market.jpg', points: 50, isHiddenGem: true, country: 'India', rating: 4.2 },
  { id: 'devaraja-market-mysuru', name: 'Devaraja Market', city: 'Mysuru', state: 'Karnataka', latitude: 12.3090, longitude: 76.6530, category: 'market', mustVisit: true, description: 'Traditional open-air market selling flowers, spices, textiles, and local Mysore specialities.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Devaraja_Market_Mysore.jpg/600px-Devaraja_Market_Mysore.jpg', points: 60, isHiddenGem: false, country: 'India', rating: 4.3 },
  { id: 'tibetan-market-mcleodganj', name: 'Tibetan Market McLeod Ganj', city: 'McLeod Ganj', state: 'Himachal Pradesh', latitude: 32.2363, longitude: 76.3242, category: 'market', mustVisit: true, description: 'Bustling hillside market of Tibetan handicrafts, prayer flags, thangkas, and momos in Dharamshala.', imageUrl: 'https://images.unsplash.com/photo-1555529902-87314db6d5d1?w=600', points: 70, isHiddenGem: false, country: 'India', rating: 4.5 },
  { id: 'colva-night-market-goa', name: 'Colva Beach Market', city: 'Colva', state: 'Goa', latitude: 15.2796, longitude: 73.9152, category: 'market', mustVisit: false, description: 'Lively beachside stalls selling Goan souvenirs, beachwear, and fresh seafood near Colva Beach.', imageUrl: 'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?w=600', points: 40, isHiddenGem: true, country: 'India', rating: 4.1 },

  // Treks
  { id: 'triund-trek-hp', name: 'Triund Trek', city: 'McLeod Ganj', state: 'Himachal Pradesh', latitude: 32.2445, longitude: 76.3480, category: 'trek', mustVisit: true, description: 'Classic Himalayan day trek above McLeod Ganj with sweeping views of the Dhauladhar range and camping at Triund top.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Triund.jpg/600px-Triund.jpg', points: 120, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'valley-of-flowers-trek', name: 'Valley of Flowers Trek', city: 'Chamoli', state: 'Uttarakhand', latitude: 30.7283, longitude: 79.6044, category: 'trek', mustVisit: true, description: 'UNESCO World Heritage alpine meadow trek famed for monsoonal blooms between Govindghat and the valley.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Valley_of_flowers.jpg/600px-Valley_of_flowers.jpg', points: 160, isHiddenGem: false, country: 'India', rating: 4.9 },
  { id: 'hampta-pass-trek', name: 'Hampta Pass Trek', city: 'Manali', state: 'Himachal Pradesh', latitude: 32.2910, longitude: 77.3660, category: 'trek', mustVisit: true, description: 'Dramatic crossover trek from lush Kullu valley to the barren high desert of Spiti via Hampta Pass.', imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600', points: 150, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'chadar-trek-ladakh', name: 'Chadar Trek', city: 'Leh', state: 'Ladakh', latitude: 33.9456, longitude: 77.2622, category: 'trek', mustVisit: true, description: 'Winter trek on the frozen Zanskar River — one of India\'s most iconic adventure routes.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Chadar_Trek.jpg/600px-Chadar_Trek.jpg', points: 200, isHiddenGem: false, country: 'India', rating: 4.9 },
  { id: 'sandakphu-trek-wb', name: 'Sandakphu Trek', city: 'Darjeeling', state: 'West Bengal', latitude: 27.1060, longitude: 88.0020, category: 'trek', mustVisit: true, description: 'Highest peak of West Bengal on the Singalila Ridge, with panoramic views of Everest, Kanchenjunga, and Lhotse.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Sandakphu.jpg/600px-Sandakphu.jpg', points: 140, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'markha-valley-trek', name: 'Markha Valley Trek', city: 'Leh', state: 'Ladakh', latitude: 33.8500, longitude: 77.4500, category: 'trek', mustVisit: true, description: 'Signature Ladakh trek through remote villages, high passes, and stark Himalayan landscapes.', imageUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600', points: 160, isHiddenGem: false, country: 'India', rating: 4.8 },

  // Adventure
  { id: 'rishikesh-rafting', name: 'Rishikesh White Water Rafting', city: 'Rishikesh', state: 'Uttarakhand', latitude: 30.0869, longitude: 78.2676, category: 'adventure', mustVisit: true, description: 'India\'s rafting capital on the Ganges with grades from mellow stretches to thrilling Grade III–IV rapids.', imageUrl: 'https://images.unsplash.com/photo-1530866495561-507c9faab2ed?w=600', points: 110, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'bir-billing-paragliding', name: 'Bir Billing Paragliding', city: 'Bir', state: 'Himachal Pradesh', latitude: 32.0420, longitude: 76.7120, category: 'adventure', mustVisit: true, description: 'World-renowned paragliding site hosting international competitions, with take-offs from Billing and landings in Bir.', imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600', points: 130, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'rann-utsav-adventure', name: 'Rann Adventure Camp', city: 'Dhordo', state: 'Gujarat', latitude: 23.8360, longitude: 69.8200, category: 'adventure', mustVisit: true, description: 'Desert adventure base near the White Rann with camel safaris, ATV rides, and full-moon salt-flat walks.', imageUrl: 'https://images.unsplash.com/photo-1473580044384-7ba9967e159b?w=600', points: 100, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'andaman-scuba-havelock', name: 'Havelock Scuba Diving', city: 'Havelock Island', state: 'Andaman and Nicobar Islands', latitude: 11.9660, longitude: 93.0070, category: 'adventure', mustVisit: true, description: 'Crystal-clear Andaman waters with coral reefs, shipwrecks, and beginner to advanced dive sites around Havelock.', imageUrl: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600', points: 140, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'jim-corbett-jeep-safari', name: 'Jim Corbett Jeep Safari', city: 'Ramnagar', state: 'Uttarakhand', latitude: 29.5300, longitude: 78.7747, category: 'adventure', mustVisit: true, description: 'Wildlife jeep safari in India\'s oldest national park, famous for Bengal tigers and rich birdlife.', imageUrl: 'https://images.unsplash.com/photo-1549366021-9f761d450615?w=600', points: 120, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'spiti-bike-expedition', name: 'Spiti Valley Bike Expedition', city: 'Kaza', state: 'Himachal Pradesh', latitude: 32.2260, longitude: 78.0720, category: 'adventure', mustVisit: true, description: 'High-altitude motorcycle adventure across Kunzum Pass into the cold-desert villages of Spiti.', imageUrl: 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600', points: 150, isHiddenGem: false, country: 'India', rating: 4.8 },

  // Ghats
  { id: 'dashashwamedh-ghat-varanasi', name: 'Dashashwamedh Ghat', city: 'Varanasi', state: 'Uttar Pradesh', latitude: 25.3075, longitude: 83.0105, category: 'ghat', mustVisit: true, description: 'Most celebrated ghat on the Ganges, famous for the nightly Ganga Aarti ceremony.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Dashashwamedh_Ghat.jpg/600px-Dashashwamedh_Ghat.jpg', points: 150, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'assi-ghat-varanasi', name: 'Assi Ghat', city: 'Varanasi', state: 'Uttar Pradesh', latitude: 25.2885, longitude: 83.0065, category: 'ghat', mustVisit: true, description: 'Southernmost main ghat of Varanasi, popular for morning yoga, boat rides, and quieter aarti.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Assi_Ghat.jpg/600px-Assi_Ghat.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'har-ki-pauri-haridwar', name: 'Har Ki Pauri', city: 'Haridwar', state: 'Uttarakhand', latitude: 29.9567, longitude: 78.1710, category: 'ghat', mustVisit: true, description: 'Sacred bathing ghat on the Ganges where the evening Ganga Aarti draws throngs of pilgrims.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Har_Ki_Pauri.jpg/600px-Har_Ki_Pauri.jpg', points: 140, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'ahilya-ghat-maheshwar', name: 'Ahilya Ghat', city: 'Maheshwar', state: 'Madhya Pradesh', latitude: 22.1768, longitude: 75.5875, category: 'ghat', mustVisit: true, description: 'Stone ghats of the Narmada below Ahilya Fort, lined with temples and famous for sunset views.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Maheshwar_Ghats.jpg/600px-Maheshwar_Ghats.jpg', points: 90, isHiddenGem: false, country: 'India', rating: 4.6 },

  // Temples (gaps)
  { id: 'meenakshi-temple-madurai', name: 'Meenakshi Amman Temple', city: 'Madurai', state: 'Tamil Nadu', latitude: 9.9195, longitude: 78.1193, category: 'temple', mustVisit: true, description: 'Dravidian temple complex with towering gopurams dedicated to Goddess Meenakshi and Lord Sundareswarar.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Meenakshi_Amman_Temple.jpg/600px-Meenakshi_Amman_Temple.jpg', points: 150, isHiddenGem: false, country: 'India', rating: 4.9 },
  { id: 'akshardham-delhi', name: 'Akshardham Temple', city: 'New Delhi', state: 'Delhi', latitude: 28.6127, longitude: 77.2773, category: 'temple', mustVisit: true, description: 'Vast modern Hindu temple complex showcasing traditional craftsmanship, exhibitions, and the musical fountain show.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Akshardham_Temple_Delhi.jpg/600px-Akshardham_Temple_Delhi.jpg', points: 130, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'brihadeeswara-temple-thanjavur', name: 'Brihadeeswara Temple', city: 'Thanjavur', state: 'Tamil Nadu', latitude: 10.7828, longitude: 79.1318, category: 'temple', mustVisit: true, description: 'UNESCO Chola temple with a towering vimana, one of the greatest architectural marvels of South India.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Brihadeeswara_Temple.jpg/600px-Brihadeeswara_Temple.jpg', points: 140, isHiddenGem: false, country: 'India', rating: 4.9 },

  // Forts / Palaces / Monuments
  { id: 'amber-fort-jaipur', name: 'Amber Fort', city: 'Jaipur', state: 'Rajasthan', latitude: 26.9855, longitude: 75.8513, category: 'fort', mustVisit: true, description: 'Hilltop fort-palace complex overlooking Maota Lake, known for Sheesh Mahal and elephant rides.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Amber_Fort.jpg/600px-Amber_Fort.jpg', points: 140, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'mysore-palace-karnataka', name: 'Mysore Palace', city: 'Mysuru', state: 'Karnataka', latitude: 12.3051, longitude: 76.6551, category: 'palace', mustVisit: true, description: 'Indo-Saracenic royal palace of the Wodeyars, spectacularly illuminated on Sundays and during Dasara.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Mysore_Palace_Night.jpg/600px-Mysore_Palace_Night.jpg', points: 150, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'india-gate-delhi', name: 'India Gate', city: 'New Delhi', state: 'Delhi', latitude: 28.6129, longitude: 77.2295, category: 'monument', mustVisit: true, description: 'War memorial arch on Rajpath honouring Indian soldiers, a centrepiece of New Delhi\'s ceremonial axis.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/India_Gate.jpg/600px-India_Gate.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'gateway-of-india-mumbai', name: 'Gateway of India', city: 'Mumbai', state: 'Maharashtra', latitude: 18.9220, longitude: 72.8347, category: 'monument', mustVisit: true, description: 'Basalt arch monument on the Apollo Bunder waterfront, iconic welcome symbol of Mumbai.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Gateway_of_India.jpg/600px-Gateway_of_India.jpg', points: 110, isHiddenGem: false, country: 'India', rating: 4.6 },

  // Lakes / Parks / Beaches / Waterfalls / Museums
  { id: 'dal-lake-srinagar', name: 'Dal Lake', city: 'Srinagar', state: 'Jammu and Kashmir', latitude: 34.0880, longitude: 74.8550, category: 'lake', mustVisit: true, description: 'Jewel of Kashmir — houseboats, shikara rides, and floating gardens on Srinagar\'s iconic lake.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/Dal_Lake.jpg/600px-Dal_Lake.jpg', points: 140, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'naini-lake-nainital', name: 'Naini Lake', city: 'Nainital', state: 'Uttarakhand', latitude: 29.3803, longitude: 79.4636, category: 'lake', mustVisit: true, description: 'Kidney-shaped hill lake that gives Nainital its name, ringed by mall road and forested hills.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Naini_Lake.jpg/600px-Naini_Lake.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'cubbon-park-bengaluru', name: 'Cubbon Park', city: 'Bengaluru', state: 'Karnataka', latitude: 12.9763, longitude: 77.5929, category: 'park', mustVisit: true, description: 'Historic lung of Bengaluru with tree-lined avenues, museums, and open lawns in the city centre.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Cubbon_Park.jpg/600px-Cubbon_Park.jpg', points: 60, isHiddenGem: false, country: 'India', rating: 4.4 },
  { id: 'kaziranga-national-park', name: 'Kaziranga National Park', city: 'Golaghat', state: 'Assam', latitude: 26.5775, longitude: 93.1711, category: 'park', mustVisit: true, description: 'UNESCO park protecting the world\'s largest population of one-horned rhinoceroses on the Brahmaputra floodplains.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Kaziranga.jpg/600px-Kaziranga.jpg', points: 150, isHiddenGem: false, country: 'India', rating: 4.8 },
  { id: 'palolem-beach-goa', name: 'Palolem Beach', city: 'Canacona', state: 'Goa', latitude: 15.0100, longitude: 74.0230, category: 'beach', mustVisit: true, description: 'Crescent-shaped south Goa beach known for calm waters, palm-fringed sand, and sunset canoe rides.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Palolem_Beach.jpg/600px-Palolem_Beach.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'marina-beach-chennai', name: 'Marina Beach', city: 'Chennai', state: 'Tamil Nadu', latitude: 13.0500, longitude: 80.2824, category: 'beach', mustVisit: true, description: 'One of the longest urban beaches in the world along the Bay of Bengal in Chennai.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Marina_Beach.jpg/600px-Marina_Beach.jpg', points: 90, isHiddenGem: false, country: 'India', rating: 4.4 },
  { id: 'athirappilly-falls-kerala', name: 'Athirappilly Falls', city: 'Chalakudy', state: 'Kerala', latitude: 10.2850, longitude: 76.5697, category: 'waterfall', mustVisit: true, description: 'Often called the Niagara of India — a spectacular 80-ft cascade in the Western Ghats of Kerala.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Athirappilly_Falls.jpg/600px-Athirappilly_Falls.jpg', points: 120, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'jog-falls-karnataka', name: 'Jog Falls', city: 'Sagara', state: 'Karnataka', latitude: 14.2294, longitude: 74.8125, category: 'waterfall', mustVisit: true, description: 'Segmented waterfall on the Sharavathi River and one of the highest plunge falls in India.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Jog_Falls.jpg/600px-Jog_Falls.jpg', points: 130, isHiddenGem: false, country: 'India', rating: 4.7 },
  { id: 'csmvs-mumbai', name: 'Chhatrapati Shivaji Vastu Sangrahalaya', city: 'Mumbai', state: 'Maharashtra', latitude: 18.9269, longitude: 72.8327, category: 'museum', mustVisit: true, description: 'Premier museum of art and archaeology in a Grade-I heritage Indo-Saracenic building facing the Arabian Sea.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/CSMVS_Mumbai.jpg/600px-CSMVS_Mumbai.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.6 },
  { id: 'indian-museum-kolkata', name: 'Indian Museum Kolkata', city: 'Kolkata', state: 'West Bengal', latitude: 22.5579, longitude: 88.3511, category: 'museum', mustVisit: true, description: 'Oldest and largest multipurpose museum in India, founded in 1814 with vast archaeological collections.', imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Indian_Museum_Kolkata.jpg/600px-Indian_Museum_Kolkata.jpg', points: 100, isHiddenGem: false, country: 'India', rating: 4.5 },
];

let added = 0;
for (const np of NEW_PLACES) {
  const exists = places.some(
    (p) => p.id === np.id || (p.name || '').toLowerCase() === np.name.toLowerCase(),
  );
  if (!exists) {
    // Also skip near-duplicates (same city + very similar name)
    const softDup = places.some((p) => {
      const a = (p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const b = np.name.toLowerCase().replace(/[^a-z0-9]+/g, '');
      return p.city === np.city && (a.includes(b.slice(0, 12)) || b.includes(a.slice(0, 12)));
    });
    if (softDup) continue;
    places.push(np);
    added++;
  } else {
    // Upgrade category on existing match if we have a stronger canonical one
    const hit = places.find(
      (p) => p.id === np.id || (p.name || '').toLowerCase() === np.name.toLowerCase(),
    );
    if (hit && hit.category !== np.category && VALID.has(np.category)) {
      hit.category = np.category;
      if (!hit.city) hit.city = np.city;
      if (!hit.state) hit.state = np.state;
      if (!hit.latitude) hit.latitude = np.latitude;
      if (!hit.longitude) hit.longitude = np.longitude;
      changed++;
    }
  }
}

// Manual corrections for known edge cases
const FIXES = [
  { match: /sangram sagar/i, category: 'lake' },
  { match: /balancing rock/i, category: 'monument' },
  { match: /^mandu/i, category: 'fort' },
  { match: /satpura national park/i, category: 'park' },
  { match: /gwarighat/i, category: 'gurudwara' },
];
for (const p of places) {
  for (const f of FIXES) {
    if (f.match.test(p.name)) {
      if (p.category !== f.category) {
        p.category = f.category;
        changed++;
      }
    }
  }
}

// Deduplicate Golden Temple variants (keep Harmandir Sahib full name if present)
const golden = places.filter((p) => /golden temple/i.test(p.name) && /amritsar/i.test(p.city || ''));
if (golden.length > 1) {
  const keep = golden.find((p) => /harmandir/i.test(p.name)) || golden[0];
  const removeIds = new Set(golden.filter((p) => p !== keep).map((p) => p.id));
  for (let i = places.length - 1; i >= 0; i--) {
    if (removeIds.has(places[i].id)) places.splice(i, 1);
  }
}

// Final validation
const cats = {};
let badCoords = 0;
let missingCity = 0;
for (const p of places) {
  cats[p.category] = (cats[p.category] || 0) + 1;
  if (!VALID.has(p.category)) throw new Error(`Bad category left: ${p.name} -> ${p.category}`);
  if (!p.city) missingCity++;
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  if (!(lat >= 6 && lat <= 37 && lng >= 68 && lng <= 98)) badCoords++;
}

fs.writeFileSync(filePath, JSON.stringify(places, null, 2), 'utf-8');
console.log(JSON.stringify({
  total: places.length,
  recategorized: changed,
  added,
  missingCity,
  badCoords,
  categories: cats,
}, null, 2));
