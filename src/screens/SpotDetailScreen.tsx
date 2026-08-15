import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  
  Modal,
  ActivityIndicator,
  Share,
  RefreshControl,
  Animated,
  Image } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { spacing, borderRadius } from '../config/theme';
import { useTheme } from '../context/ThemeContext';
import { TouristSpot, UserProfile } from '../types';
import { useLocationContext } from '../context/LocationContext';
import { useDataContext } from '../context/DataContext';
import { useUserContext } from '../context/UserContext';
import { DEV_FLAGS } from '../config/devFlags';
import { haversineDistance } from '../utils/location';
import { isReliableUserPosition, parseLatLng } from '../services/location/distance';
import { useTravelTime } from '../services/location/useTravelTime';
import { formatDriveDistanceLabel } from '../services/location/travelTime';
import Icon from 'react-native-vector-icons/Ionicons';
import { placesApi } from '../services/api/places';

import { getPlaces } from '../services/placesService';
import { cacheItineraryPlace } from '../utils/itineraryPlacesCache';
import { quickAddPlaceToTrip } from '../utils/quickAddPlace';
import ImageComingSoon from '../components/ui/ImageComingSoon';
import { hasValidImageUrl } from '../utils/imageUrl';
import RideOptionsSheet from '../components/RideOptionsSheet';
import { useNavigation } from '@react-navigation/native';
import { useToast } from '../context/ToastContext';
import { useResponsive } from '../design/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNavigation, BOTTOM_NAV_CLEARANCE } from '../components/navigation/BottomNavigation';

interface SpotDetailProps {
  spot: TouristSpot;
  user: UserProfile;
  onBack: () => void;
}

export default function SpotDetailScreen({
  spot,
  user,
  onBack,
}: SpotDetailProps) {
  const _navigation = useNavigation<any>();
  const { theme } = useTheme();
  const colors = theme;
  const insets = useSafeAreaInsets();
  const responsive = useResponsive();
  const puzzleSize = responsive.fitWidth(270, 48);

  const renderTimings = () => {
    if (!displaySpot.openingHours) return 'Check local listing';
    if (typeof displaySpot.openingHours === 'string') return displaySpot.openingHours;
    try {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const todayShifts = displaySpot.openingHours[today];
      if (todayShifts === undefined) return 'Check local listing';
      if (todayShifts.length === 0) return 'Closed Today';
      return todayShifts.map((s: any) => `${s.open} - ${s.close}`).join(', ');
    } catch {
      return 'Check local listing';
    }
  };

  const renderTicketPrice = () => {
    if (displaySpot.ticketPrice && typeof displaySpot.ticketPrice === 'object') {
      const tp = displaySpot.ticketPrice;
      if (!tp.adult && !tp.child && !tp.foreigner) return 'Free';
      const parts = [];
      if (tp.adult) parts.push(`Adult ₹${tp.adult}`);
      if (tp.child) parts.push(`Child ₹${tp.child}`);
      if (tp.foreigner) parts.push(`Foreigner ₹${tp.foreigner}`);
      return parts.join(' • ') || 'Free';
    }
    return displaySpot.entryFee ? `₹${displaySpot.entryFee}` : (displaySpot.fee ?? 'Free');
  };
  const tileSize = puzzleSize / 3;
  const styles = useMemo(() => createStyles(theme, puzzleSize, tileSize), [theme, puzzleSize, tileSize]);
  const isVisited = user?.visitedSpots?.includes(spot.id);

  const { effectivePosition } = useLocationContext();
  const { handleCompleteStop, handleCompleteActivity } = useDataContext();
  const { user: ctxUser, setUser, isGuest } = useUserContext();
  const { showSuccess } = useToast();
  const isInItinerary = ctxUser.currentItinerary?.includes(spot.id);
  const [addingToItinerary, setAddingToItinerary] = useState(false);

  const [isSaved, setIsSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Full Spot data & advanced info
  const [fullSpot, setFullSpot] = useState<any>(null);
  const [nearbyVendors, setNearbyVendors] = useState<any[]>([]);
  const [spotReels, setSpotReels] = useState<any[]>([]);
  const [_loadingExtras, setLoadingExtras] = useState(true);

  const carouselImages = useMemo(() => {
    const list: string[] = [];
    if (hasValidImageUrl(spot.imageUrl)) list.push(spot.imageUrl!);
    if (hasValidImageUrl(spot.imageUri)) list.push(spot.imageUri!);
    if (hasValidImageUrl(fullSpot?.thumbnail)) list.push(fullSpot.thumbnail);
    if (Array.isArray(fullSpot?.images)) {
      for (const img of fullSpot.images) {
        if (hasValidImageUrl(img) && !list.includes(img)) list.push(img);
      }
    }
    return list;
  }, [spot, fullSpot]);

  useEffect(() => {
    setLoadingExtras(true);
    Promise.all([
      placesApi.getById(spot.id).catch(() => null),
      placesApi.getNearbyVendors(spot.id, 5000).catch(() => []),
      placesApi.getReels(spot.id).catch(() => []),
    ]).then(([fullData, vendors, reels]) => {
      if (fullData) setFullSpot(fullData);
      if (vendors) setNearbyVendors(vendors);
      if (Array.isArray(reels)) setSpotReels(reels);
    }).finally(() => setLoadingExtras(false));
  }, [spot.id]);

  useFocusEffect(
    useCallback(() => {
      placesApi.getReels(spot.id)
        .then((reels) => { if (Array.isArray(reels)) setSpotReels(reels); })
        .catch(() => {});
    }, [spot.id])
  );

  const displaySpot = { ...spot, ...fullSpot };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      placesApi.getById(spot.id).then((fullData) => { if (fullData) setFullSpot(fullData); }).catch(() => {}),
      placesApi.getNearbyVendors(spot.id, 5000).then((vendors) => { if (vendors) setNearbyVendors(vendors); }).catch(() => {}),
      placesApi.getReels(spot.id).then((reels) => { if (Array.isArray(reels)) setSpotReels(reels); }).catch(() => setSpotReels([])),
    ]).finally(() => setRefreshing(false));
  }, [spot.id]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        message: `Check out ${spot.name} in ${spot.city}, ${spot.state} — discovered on PalSafar! 🗺️`,
      });
    } catch { }
  }, [spot]);

  const handleSave = useCallback(async () => {
    const nowSaved = !isSaved;
    setIsSaved(nowSaved);
    Alert.alert(nowSaved ? 'Saved!' : 'Removed', nowSaved
      ? `${spot.name} added to your saved places`
      : `${spot.name} removed from your saved places`);
    try {
      if (nowSaved) {
        await placesApi.save(spot.id);
      } else {
        await placesApi.unsave(spot.id);
      }
    } catch (err) {
      setIsSaved(!nowSaved);
    }
  }, [spot, isSaved]);

  const handleToggleItinerary = useCallback(async () => {
    const alreadyInItinerary = ctxUser?.currentItinerary?.includes(spot.id);
    if (alreadyInItinerary) {
      Alert.alert(
        'Already in Itinerary',
        `${spot.name} is already in your itinerary. Manage or remove it from "My Itinerary".`
      );
      return;
    }

    if (isGuest) {
      Alert.alert('Sign In Required', 'Create an account or sign in to save places to your itinerary.');
      return;
    }

    if (addingToItinerary) return;
    setAddingToItinerary(true);
    setUser(prev => {
      const exists = prev.currentItinerary?.includes(spot.id);
      return {
        ...prev,
        currentItinerary: exists ? prev.currentItinerary : [...(prev.currentItinerary || []), spot.id],
      };
    });
    cacheItineraryPlace(spot);
    showSuccess('Added to your itinerary');
    try {
      await quickAddPlaceToTrip(spot.id, { name: spot.name, city: spot.city });
    } catch (err: any) {
      setUser(prev => ({
        ...prev,
        currentItinerary: (prev.currentItinerary || []).filter(id => id !== spot.id),
      }));
      if (err?.status === 401) {
        Alert.alert('Sign In Required', 'Create an account or sign in to save places to your itinerary.');
      } else {
        Alert.alert('Could Not Add', err?.message || 'Could not add this place to your itinerary right now.');
      }
    } finally {
      setAddingToItinerary(false);
    }
  }, [spot, ctxUser?.currentItinerary, setUser, isGuest, addingToItinerary, showSuccess]);

  // Trivia Quiz state
  const [quizVisible, setQuizVisible] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [quizCurrentIdx, setQuizCurrentIdx] = useState(0);
  const [quizSelectedOption, setQuizSelectedOption] = useState<number | null>(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);

  // Sliding Puzzle state
  const [puzzleVisible, setPuzzleVisible] = useState(false);
  const [puzzleBoard, setPuzzleBoard] = useState<number[]>([]);
  const [puzzleMoves, setPuzzleMoves] = useState(0);
  const [puzzleSolved, setPuzzleSolved] = useState(false);

  // Ride options state
  const [rideSheetVisible, setRideSheetVisible] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  const [cityPlaces, setCityPlaces] = useState<TouristSpot[]>([]);

  useEffect(() => {
    getPlaces().then(data => {
      const filtered = data.filter(s => s.city?.toLowerCase() === spot.city?.toLowerCase());
      setCityPlaces(filtered);
    });
  }, [spot.city]);

  const _cityCompletionStats = useMemo(() => {
    if (!cityPlaces.length) return null;
    const total = cityPlaces.length;
    const visited = cityPlaces.filter(s => user?.visitedSpots?.includes(s.id)).length;
    const percent = Math.round((visited / total) * 100);
    return { name: spot.city, visited, total, percent };
  }, [cityPlaces, user?.visitedSpots, spot.city]);

  const distance = useMemo(() => {
    if (!effectivePosition) return null;
    return haversineDistance(
      effectivePosition.latitude,
      effectivePosition.longitude,
      spot.latitude,
      spot.longitude
    );
  }, [effectivePosition, spot]);

  const travelOrigin = isReliableUserPosition(effectivePosition)
    ? parseLatLng(effectivePosition.latitude, effectivePosition.longitude)
    : null;
  const travelDest = parseLatLng(spot.latitude, spot.longitude);
  const { result: travelTime } = useTravelTime(travelOrigin, travelDest, spot.id);
  const driveLabel =
    travelTime?.source === 'routing'
      ? formatDriveDistanceLabel(travelTime.distanceMeters, travelTime.durationSeconds)
      : '';

  const canCheckIn = useMemo(() => {
    if (__DEV__ || DEV_FLAGS.SHOW_DEV_GPS_PANEL) return true;
    if (distance === null) return false;
    return distance <= 100;
  }, [distance]);

  const handleCheckInPress = async () => {
    try {
      handleCompleteStop(spot.id, spot.points || 50);
      // Call checkIn API (awards PalPoints server-side via walletService.earn)
      placesApi.checkIn(spot.id).catch((err) => {
      });
      // Also record the stat for analytics
      placesApi.recordStat(spot.id, 'checkin').catch(() => {});
    } catch {
      Alert.alert('Check-In Error', 'Could not complete check-in. Please try again.');
    }
  };

  // ── Quiz Logic ──
  const _startQuiz = () => {
    // Generate trivia questions dynamically
    const questions = [
      {
        question: `Where is the attraction "${spot.name}" located?`,
        options: [
          `${spot.city}, ${spot.state}`,
          `New Delhi, Delhi`,
          `Mumbai, Maharashtra`,
          `Jaipur, Rajasthan`
        ].filter((v, i, a) => a.indexOf(v) === i),
        correctIndex: 0,
        explanation: `"${spot.name}" is situated in ${spot.city}, ${spot.state}.`
      },
      {
        question: `What category of attraction is "${spot.name}"?`,
        options: [
          spot.category.charAt(0).toUpperCase() + spot.category.slice(1),
          'Adventure Hub',
          'Urban Shopping Mall',
          'Theme Park Resort'
        ].filter((v, i, a) => a.indexOf(v) === i),
        correctIndex: 0,
        explanation: `"${spot.name}" is officially classified under the ${spot.category} category.`
      },
      {
        question: `What is the visitor difficulty level designated for "${spot.name}"?`,
        options: [
          spot.difficulty.toUpperCase(),
          spot.difficulty === 'easy' ? 'HARD' : 'EASY',
          'EXTREME'
        ],
        correctIndex: 0,
        explanation: `Exploring "${spot.name}" is rated as ${spot.difficulty} difficulty for visitors.`
      }
    ];

    setQuizQuestions(questions);
    setQuizCurrentIdx(0);
    setQuizSelectedOption(null);
    setQuizAnswered(false);
    setQuizCorrectCount(0);
    setQuizVisible(true);
  };

  const handleSelectQuizOption = (optIdx: number) => {
    if (quizAnswered) return;
    setQuizSelectedOption(optIdx);
    setQuizAnswered(true);
    const correct = optIdx === quizQuestions[quizCurrentIdx].correctIndex;
    if (correct) {
      setQuizCorrectCount(c => c + 1);
    }
  };

  const handleNextQuiz = () => {
    if (quizCurrentIdx < quizQuestions.length - 1) {
      setQuizCurrentIdx(c => c + 1);
      setQuizSelectedOption(null);
      setQuizAnswered(false);
    } else {
      // Completed!
      setQuizVisible(false);
      const pointsEarned = quizCorrectCount === quizQuestions.length ? 25 : 5;
      handleCompleteActivity(`quiz_${spot.id}`, pointsEarned);
      placesApi.recordStat(spot.id, 'checkin').catch(console.warn);
      Alert.alert(
        'Quiz Finished!',
        `You answered ${quizCorrectCount}/${quizQuestions.length} correct. Earned +${pointsEarned} Points!`
      );
    }
  };

  // ── Sliding Puzzle Logic ──
  const _startPuzzle = () => {
    // Generate a solvable puzzle board by making random valid moves from solved state
    const board = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let emptyIdx = 8;
    const getValidMoves = (idx: number) => {
      const moves = [];
      const row = Math.floor(idx / 3);
      const col = idx % 3;
      if (row > 0) moves.push(idx - 3);
      if (row < 2) moves.push(idx + 3);
      if (col > 0) moves.push(idx - 1);
      if (col < 2) moves.push(idx + 1);
      return moves;
    };
    for (let i = 0; i < 40; i++) {
      const moves = getValidMoves(emptyIdx);
      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      board[emptyIdx] = board[randomMove];
      board[randomMove] = 8;
      emptyIdx = randomMove;
    }

    setPuzzleBoard(board);
    setPuzzleMoves(0);
    setPuzzleSolved(false);
    setPuzzleVisible(true);
  };

  const handleTilePress = (tileIndex: number) => {
    if (puzzleSolved) return;
    const emptyIndex = puzzleBoard.indexOf(8);
    const row = Math.floor(tileIndex / 3);
    const col = tileIndex % 3;
    const emptyRow = Math.floor(emptyIndex / 3);
    const emptyCol = emptyIndex % 3;

    const isAdjacent = (Math.abs(row - emptyRow) + Math.abs(col - emptyCol)) === 1;
    if (isAdjacent) {
      const newBoard = [...puzzleBoard];
      newBoard[emptyIndex] = puzzleBoard[tileIndex];
      newBoard[tileIndex] = 8;
      setPuzzleBoard(newBoard);
      setPuzzleMoves(m => m + 1);

      // Check solved
      const isSolved = newBoard.every((val, idx) => val === idx);
      if (isSolved) {
        setPuzzleSolved(true);
        handleCompleteActivity(`puzzle_${spot.id}`, 50);
        placesApi.recordStat(spot.id, 'checkin').catch(console.warn);
      }
    }
  };

  const categoryIcons: Record<string, string> = {
    monument: '🏛️',
    temple: '🛕',
    mosque: '🕌',
    church: '⛪',
    fort: '🏰',
    palace: '👑',
    nature: '🌿',
    museum: '🏛️',
    beach: '🏖️',
    lake: '🏞️',
    ghat: '🪜',
    heritage: '🏛️',
    park: '🏞️',
    garden: '🏡',
    hill_station: '⛰️',
    wildlife: '🦁',
    waterfall: '🌊',
    camping: '⛺',
    cafe: '☕',
    cafes: '☕',
  };

  return (
    <View style={styles.container}>
      {/* Custom Glassmorphism Header */}
      <Animated.View style={[styles.header, {
        paddingTop: insets.top + 8,
        backgroundColor: scrollY.interpolate({
          inputRange: [0, 200],
          outputRange: ['rgba(0,0,0,0)', 'rgba(21, 25, 37, 0.9)']
        })
      }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <View style={styles.glassButton}>
            <Icon name="arrow-back" size={24} color={'#FFF'} />
          </View>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleSave} style={styles.headerActionBtn}>
            <View style={styles.glassButton}>
              <Icon name={isSaved ? 'bookmark' : 'bookmark-outline'} size={22} color={isSaved ? '#D4C4A8' : '#FFF'} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={styles.headerActionBtn}>
            <View style={styles.glassButton}>
              <Icon name="share-outline" size={22} color={'#FFF'} />
            </View>
          </TouchableOpacity>
          <Text style={styles.categoryIcon}>
            {categoryIcons[spot.category?.toLowerCase()] ?? '📍'}
          </Text>
        </View>
      </Animated.View>

      <Animated.ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: BOTTOM_NAV_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Horizontal Carousel Section (Parallax) */}
        <Animated.View style={[styles.carouselContainer, {
          transform: [
            { translateY: scrollY.interpolate({ inputRange: [-100, 0, 200], outputRange: [-50, 0, 100], extrapolate: 'clamp' }) },
            { scale: scrollY.interpolate({ inputRange: [-100, 0], outputRange: [1.2, 1], extrapolate: 'clamp' }) }
          ]
        }]}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.carousel}
          >
            {carouselImages.length > 0 ? (
              carouselImages.map((uri, index) => (
                <Image
                  key={index}
                  source={{ uri }}
                  style={styles.carouselImage}
                  resizeMode="cover"
                />
              ))
            ) : (
              <ImageComingSoon style={styles.carouselImage} />
            )}
          </ScrollView>
          <View style={styles.carouselOverlay}>
            <Text style={styles.badgeIcon}>{spot.badgeIcon || '📍'}</Text>
          </View>
        </Animated.View>

        {/* Spot Details Header */}
        <View style={styles.spotMeta}>
          <Text style={styles.name}>{spot.name}</Text>
          <Text style={styles.location}>
            📍 {spot.city}, {spot.state}
          </Text>


        </View>

        {/* Unified Quick Action Strip */}
        <View style={styles.actionStripContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionStrip}>
            <TouchableOpacity style={styles.actionStripBtn} onPress={() => setRideSheetVisible(true)}>
              <View style={[styles.actionIconBg, { backgroundColor: colors.primary + '20' }]}>
                <Icon name="car" size={22} color={colors.primary} />
              </View>
              <Text style={styles.actionStripText}>Ride</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionStripBtn} 
              onPress={() => _navigation.navigate('PlaceReels', {
                placeId: spot.id,
                placeName: spot.name,
                placeCity: spot.city,
                placeState: spot.state,
                placeImage: spot.imageUrl || spot.imageUri
              })}
            >
              <View style={[styles.actionIconBg, { backgroundColor: '#A86C2020' }]}>
                <Icon name="play-circle" size={22} color="#A86C20" />
              </View>
              <Text style={styles.actionStripText}>
                {spotReels?.filter((r: any) => r.status === 'APPROVED').length > 0 ? `Reels · ${spotReels.filter((r: any) => r.status === 'APPROVED').length}` : 'Reels'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionStripBtn} onPress={handleToggleItinerary} disabled={addingToItinerary}>
              <View style={[styles.actionIconBg, { backgroundColor: isInItinerary ? colors.primary : colors.surface }]}>
                {addingToItinerary ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Icon name={isInItinerary ? "checkmark-done" : "map"} size={22} color={isInItinerary ? '#fff' : colors.primary} />
                )}
              </View>
              <Text style={styles.actionStripText}>{isInItinerary ? 'Added' : 'Itinerary'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionStripBtn} onPress={handleSave}>
              <View style={[styles.actionIconBg, { backgroundColor: isSaved ? '#FFC10720' : colors.surface }]}>
                <Icon name={isSaved ? "bookmark" : "bookmark-outline"} size={22} color={isSaved ? '#FFC107' : colors.text} />
              </View>
              <Text style={styles.actionStripText}>{isSaved ? 'Saved' : 'Save'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionStripBtn} onPress={handleShare}>
              <View style={[styles.actionIconBg, { backgroundColor: colors.surface }]}>
                <Icon name="share-social-outline" size={22} color={colors.text} />
              </View>
              <Text style={styles.actionStripText}>Share</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Info & Amenities Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Essential Info</Text>
          <View style={styles.infoGrid}>
            <View style={styles.infoGridItem}>
              <Icon name="time-outline" size={20} color={colors.primary} />
              <View style={styles.infoGridTextCol}>
                <Text style={styles.infoGridLabel}>Timings</Text>
                <Text style={styles.infoGridValue}>{renderTimings()}</Text>
              </View>
            </View>

            <View style={styles.infoGridItem}>
              <Icon name="wallet-outline" size={20} color="#FFC107" />
              <View style={styles.infoGridTextCol}>
                <Text style={styles.infoGridLabel}>Entry Fee</Text>
                <Text style={styles.infoGridValue}>{renderTicketPrice()}</Text>
              </View>
            </View>

            <View style={styles.infoGridItem}>
              <Icon name="hourglass-outline" size={20} color={colors.secondary} />
              <View style={styles.infoGridTextCol}>
                <Text style={styles.infoGridLabel}>Duration</Text>
                <Text style={styles.infoGridValue}>{displaySpot.recommendedDuration || `${displaySpot.estimatedDuration || 60} mins`}</Text>
              </View>
            </View>

            <View style={styles.infoGridItem}>
              <Icon name="fitness-outline" size={20} color={displaySpot.difficulty === 'easy' ? '#4CAF50' : displaySpot.difficulty === 'medium' ? '#FF9800' : '#F44336'} />
              <View style={styles.infoGridTextCol}>
                <Text style={styles.infoGridLabel}>Difficulty</Text>
                <Text style={styles.infoGridValue}>{displaySpot.difficulty?.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          {/* Amenities Row */}
          <View style={styles.amenitiesRow}>
            <View style={[styles.amenityBadge, { opacity: displaySpot.hasParking ? 1 : 0.4 }]}>
              <Icon name="car-sport-outline" size={16} color={colors.text} />
              <Text style={styles.amenityText}>Parking</Text>
            </View>
            <View style={[styles.amenityBadge, { opacity: displaySpot.isAccessible ? 1 : 0.4 }]}>
              <Icon name="body-outline" size={16} color={colors.text} />
              <Text style={styles.amenityText}>Accessible</Text>
            </View>
            <View style={[styles.amenityBadge, { opacity: displaySpot.hasWashroom ? 1 : 0.4 }]}>
              <Icon name="water-outline" size={16} color={colors.text} />
              <Text style={styles.amenityText}>Washroom</Text>
            </View>
            <View style={[styles.amenityBadge, { opacity: displaySpot.isPetFriendly ? 1 : 0.4 }]}>
              <Icon name="paw-outline" size={16} color={colors.text} />
              <Text style={styles.amenityText}>Pets</Text>
            </View>
          </View>
        </View>

        {/* Check-In / Visited Action Button */}
        {isVisited ? (
          <View style={styles.actionSection}>
            <View style={styles.visitedBadge}>
              <Text style={styles.visitedText}>✅ Destination Checked-In</Text>
            </View>
          </View>
        ) : (
          <View style={styles.actionSection}>
            <Text style={styles.actionTitle}>Visit this spot!</Text>
            <Text style={styles.actionSubtitle}>
              {driveLabel
                ? `${driveLabel} by road. Go within 100m to check in.`
                : `Go within 100m of this spot to check in`}
            </Text>
            {canCheckIn ? (
              <TouchableOpacity style={styles.checkInButton} onPress={handleCheckInPress}>
                <Icon name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.checkInButtonText}>📍 Check In & Claim points</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.checkInButton, styles.checkInButtonDisabled]} disabled>
                <Icon name="lock-closed-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
                <Text style={styles.checkInButtonTextDisabled}>Too Far (Get Closer to Check In)</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Creators at this place (Reels) */}
        {spotReels.filter((r: any) => r.status === 'APPROVED').length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Creators at this place</Text>
              <TouchableOpacity onPress={() => _navigation.navigate('PlaceReels', {
                  placeId: spot.id, placeName: spot.name, placeCity: spot.city, placeState: spot.state, placeImage: spot.imageUrl || spot.imageUri
                })}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>View all ➔</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vendorsList}>
              {spotReels.filter((r: any) => r.status === 'APPROVED').map((reel: any, idx: number) => (
                <TouchableOpacity 
                  key={idx} 
                  style={[styles.vendorCard, { width: 130, backgroundColor: colors.surface }]}
                  onPress={() => _navigation.navigate('ReelDetail', { reelId: reel.id, reels: spotReels.filter((r: any) => r.status === 'APPROVED') })}
                >
                  <Image source={{ uri: reel.thumbnail || reel.videoUrl }} style={[styles.vendorImg, { height: 160 }]} />
                  <View style={styles.vendorInfo}>
                    <Text style={styles.vendorName} numberOfLines={1}>@{reel.creator?.username || 'Creator'}</Text>
                    <Text style={styles.vendorType} numberOfLines={1}>
                      {reel.views >= 1000 ? (reel.views / 1000).toFixed(1) + 'K' : (reel.views || 0)} views
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Nearby Vendors Section */}
        {nearbyVendors.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Nearby Vendors & Food</Text>
              <TouchableOpacity><Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vendorsList}>
              {nearbyVendors.map((vendor, idx) => (
                <TouchableOpacity key={idx} style={[styles.vendorCard, { backgroundColor: colors.surface }]}>
                  {hasValidImageUrl(vendor.imageUrl) ? (
                    <Image source={{ uri: vendor.imageUrl }} style={styles.vendorImg} />
                  ) : (
                    <ImageComingSoon style={styles.vendorImg} compact />
                  )}
                  <View style={styles.vendorInfo}>
                    <Text style={styles.vendorName} numberOfLines={1}>{vendor.businessName}</Text>
                    <Text style={styles.vendorType}>{vendor.businessType}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reels Section */}
        {spotReels.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Discover Reels</Text>
              <TouchableOpacity><Text style={[styles.seeAllText, { color: colors.primary }]}>See All</Text></TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reelsList}>
              {spotReels.map((reel, idx) => (
                <TouchableOpacity key={idx} style={styles.reelThumbCard}>
                  <Image source={{ uri: reel.thumbnailUrl }} style={styles.reelThumbImg} />
                  <View style={styles.reelOverlay}>
                    <Icon name="play-circle" size={32} color="#fff" />
                    <Text style={styles.reelViews}>{reel.views} views</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </Animated.ScrollView>

      {/* ── Quiz Modal ── */}
      <Modal
        visible={quizVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQuizVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {quizQuestions.length > 0 && (
            <View style={[styles.modalCard, { backgroundColor: colors.background }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Question {quizCurrentIdx + 1} of {quizQuestions.length}
                </Text>
                <TouchableOpacity onPress={() => setQuizVisible(false)}>
                  <Icon name="close" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.quizQuestionText, { color: colors.text }]}>
                {quizQuestions[quizCurrentIdx].question}
              </Text>

              <View style={styles.quizOptions}>
                {quizQuestions[quizCurrentIdx].options.map((opt: string, idx: number) => {
                  let btnBg = colors.surface;
                  let border = colors.border;
                  let txtColor = colors.text;

                  if (quizAnswered) {
                    if (idx === quizQuestions[quizCurrentIdx].correctIndex) {
                      btnBg = 'rgba(76, 175, 80, 0.15)';
                      border = '#4CAF50';
                      txtColor = '#4CAF50';
                    } else if (idx === quizSelectedOption) {
                      btnBg = 'rgba(244, 67, 54, 0.15)';
                      border = '#F44336';
                      txtColor = '#F44336';
                    }
                  }

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.quizOptionBtn, { backgroundColor: btnBg, borderColor: border }]}
                      onPress={() => handleSelectQuizOption(idx)}
                      disabled={quizAnswered}
                    >
                      <Text style={[styles.quizOptionText, { color: txtColor }]}>{opt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {quizAnswered && (
                <View style={styles.quizExplanation}>
                  <Text style={[styles.explanationText, { color: colors.textSecondary }]}>
                    💡 {quizQuestions[quizCurrentIdx].explanation}
                  </Text>
                  <TouchableOpacity
                    style={[styles.nextQuizBtn, { backgroundColor: colors.primary }]}
                    onPress={handleNextQuiz}
                  >
                    <Text style={styles.nextQuizBtnText}>
                      {quizCurrentIdx === quizQuestions.length - 1 ? 'Finish Quiz' : 'Next Question'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* ── Sliding Puzzle Modal ── */}
      <Modal
        visible={puzzleVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPuzzleVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, alignItems: 'center' }]}>
            <View style={[styles.modalHeader, { width: '100%' }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Image Sliding Puzzle</Text>
              <TouchableOpacity onPress={() => setPuzzleVisible(false)}>
                <Icon name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              Moves: {puzzleMoves}
            </Text>

            {/* Puzzle grid */}
            <View style={styles.puzzleBoard}>
              {puzzleBoard.map((val, idx) => {
                if (val === 8) {
                  return <View key={idx} style={[styles.puzzleTile, styles.puzzleTileEmpty]} />;
                }
                const origRow = Math.floor(val / 3);
                const origCol = val % 3;
                const imageSource = hasValidImageUrl(spot.imageUrl)
                  ? { uri: spot.imageUrl as string }
                  : hasValidImageUrl(spot.imageUri)
                    ? { uri: spot.imageUri as string }
                    : null;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.puzzleTile}
                    onPress={() => imageSource && handleTilePress(idx)}
                    activeOpacity={imageSource ? 0.8 : 1}
                    disabled={!imageSource}
                  >
                    {imageSource ? (
                      <Image
                        source={imageSource}
                        style={{
                          position: 'absolute',
                          width: puzzleSize,
                          height: puzzleSize,
                          top: -origRow * tileSize,
                          left: -origCol * tileSize,
                        }}
                        resizeMode="cover"
                      />
                    ) : (
                      <ImageComingSoon style={{ flex: 1 }} compact />
                    )}
                    <View style={styles.tileNumberBadge}>
                      <Text style={styles.tileNumberText}>{val + 1}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {puzzleSolved && (
              <View style={{ alignItems: 'center', marginTop: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#4CAF50', marginBottom: 8 }}>
                  🎉 Solved! +50 Points
                </Text>
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: '#4CAF50', marginTop: 0 }]}
                  onPress={() => setPuzzleVisible(false)}
                >
                  <Text style={styles.submitButtonText}>Claim reward</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <RideOptionsSheet
        visible={rideSheetVisible}
        onClose={() => setRideSheetVisible(false)}
        destLat={spot.latitude}
        destLng={spot.longitude}
        destName={spot.name}
      />
      <BottomNavigation activeTab="map" />
    </View>
  );
}

function createStyles(
  theme: ReturnType<typeof useTheme>['theme'],
  puzzleSize = 270,
  tileSize = 90,
) {
  const c = theme;
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.xs,
    },
    glassButton: {
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    backText: {
      color: c.primary,
      fontSize: 16,
      fontWeight: 'bold',
      marginLeft: 4,
    },
    categoryIcon: {
      fontSize: 24,
      marginLeft: 8,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    headerActionBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    infoRow: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    infoCard: {
      flex: 1,
      padding: 14,
      borderRadius: 14,
      gap: 6,
    },
    content: {
      flex: 1,
    },
    carouselContainer: {
      height: 240,
      width: '100%',
      position: 'relative',
    },
    carousel: {
      flex: 1,
    },
    carouselImage: {
      width: '100%',
      height: 240,
    },
    carouselOverlay: {
      position: 'absolute',
      bottom: -30,
      right: 24,
      backgroundColor: c.surface,
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 5,
    },
    badgeIcon: {
      fontSize: 32,
    },
    spotMeta: {
      paddingHorizontal: spacing.md,
      marginTop: spacing.md,
      marginBottom: spacing.md,
    },
    name: {
      fontSize: 24,
      fontWeight: 'bold',
      color: c.text,
      marginBottom: 4,
    },
    location: {
      fontSize: 14,
      color: c.textSecondary,
      fontWeight: '600',
      marginBottom: 8,
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    stars: {
      flexDirection: 'row',
      gap: 2,
    },
    ratingText: {
      fontSize: 13,
      marginLeft: 6,
      fontWeight: '600',
    },
    statsRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
      gap: 8,
    },
    statCard: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    statValue: {
      fontSize: 20,
      fontWeight: 'bold',
      color: c.text,
      marginBottom: 2,
    },
    statLabel: {
      fontSize: 11,
      color: c.textMuted,
      fontWeight: 'bold',
    },
    section: {
      paddingHorizontal: spacing.md,
      marginVertical: spacing.sm,
    },
    sectionTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: c.text,
      marginBottom: spacing.xs,
    },
    gameSubText: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    gamesRow: {
      flexDirection: 'row',
      gap: 10,
    },
    gameButton: {
      flex: 1,
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      elevation: 2,
    },
    gameButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: 'bold',
      marginTop: 4,
    },
    gamePtsText: {
      color: '#FFB300',
      fontSize: 11,
      fontWeight: '800',
      marginTop: 2,
    },
    description: {
      fontSize: 14,
      color: c.textSecondary,
      lineHeight: 22,
    },
    factCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: c.primary,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    factTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
      marginBottom: 3,
    },
    factDesc: {
      fontSize: 13,
      color: c.textSecondary,
      lineHeight: 18,
    },
    actionSection: {
      padding: spacing.md,
      alignItems: 'center',
      backgroundColor: c.surface,
      marginHorizontal: spacing.md,
      borderRadius: borderRadius.md,
      marginVertical: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    actionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: c.text,
      marginBottom: 2,
    },
    actionSubtitle: {
      fontSize: 13,
      color: c.textSecondary,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    visitedBadge: {
      backgroundColor: c.success,
      borderRadius: borderRadius.round,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    visitedText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: 'bold',
    },
    itineraryBtn: {
      backgroundColor: 'transparent',
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: c.primary,
      width: '100%',
    },
    itineraryBtnActive: {
      backgroundColor: c.success,
      borderColor: c.success,
    },
    itineraryBtnText: {
      color: c.primary,
      fontSize: 14,
      fontWeight: 'bold',
    },
    checkInButton: {
      backgroundColor: c.primary,
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkInButtonDisabled: {
      backgroundColor: c.surfaceLight,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    checkInButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: 'bold',
    },
    checkInButtonTextDisabled: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: 'bold',
    },
    rideBtn: {
      borderRadius: borderRadius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    rideBtnText: {
      fontSize: 14,
      fontWeight: 'bold',
    },
    reviewsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    addReviewLink: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 15,
      borderWidth: 1,
    },
    addReviewLinkText: {
      fontSize: 12,
      fontWeight: '600',
    },
    xpCard: {
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
    },
    xpHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    xpLevelName: {
      fontSize: 14,
      fontWeight: '700',
    },
    xpText: {
      fontSize: 14,
      fontWeight: '800',
    },
    progressBarBg: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    xpFooter: {
      marginTop: 12,
    },
    xpLabel: {
      fontSize: 12,
    },
    noReviews: {
      fontSize: 13,
      fontStyle: 'italic',
      textAlign: 'center',
      marginVertical: 12,
    },
    reviewCard: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    reviewUserRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    userAvatar: {
      fontSize: 24,
      marginRight: 8,
    },
    reviewUser: {
      fontSize: 13,
      fontWeight: '700',
    },
    reviewDate: {
      fontSize: 11,
    },
    reviewContent: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    reviewPhotosRow: {
      flexDirection: 'row',
      marginTop: spacing.sm,
      marginHorizontal: -spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    reviewPhoto: {
      width: 70,
      height: 70,
      borderRadius: borderRadius.sm,
      marginRight: spacing.sm,
    },
    reviewActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: spacing.sm,
    },
    helpfulBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.xs,
      borderRadius: borderRadius.sm,
      backgroundColor: c.surfaceLight,
    },
    helpfulText: {
      fontSize: 11,
      fontWeight: '600',
      marginLeft: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.md,
    },
    modalCard: {
      width: '100%',
      maxWidth: 340,
      borderRadius: borderRadius.lg,
      padding: spacing.lg,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 6,
    },
    starsInput: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'center',
      marginVertical: 10,
    },
    reviewInput: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.sm,
      height: 100,
      textAlignVertical: 'top',
      fontSize: 13,
      marginBottom: spacing.md,
    },
    submitButton: {
      borderRadius: borderRadius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      width: '100%',
    },
    submitButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: 'bold',
    },
    quizQuestionText: {
      fontSize: 15,
      fontWeight: '600',
      lineHeight: 22,
      marginBottom: spacing.md,
    },
    quizOptions: {
      gap: 8,
      marginBottom: spacing.md,
    },
    quizOptionBtn: {
      borderWidth: 1,
      borderRadius: borderRadius.md,
      padding: spacing.md,
    },
    quizOptionText: {
      fontSize: 13,
      fontWeight: '600',
    },
    quizExplanation: {
      marginTop: spacing.sm,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    explanationText: {
      fontSize: 13,
      lineHeight: 18,
      marginBottom: spacing.md,
    },
    nextQuizBtn: {
      borderRadius: borderRadius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    nextQuizBtnText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: 'bold',
    },
    actionStripContainer: {
      marginTop: spacing.md,
      paddingLeft: spacing.md,
    },
    actionStrip: {
      paddingRight: spacing.md,
      gap: 12,
    },
    actionStripBtn: {
      alignItems: 'center',
      minWidth: 60,
    },
    actionIconBg: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    actionStripText: {
      fontSize: 11,
      color: c.textSecondary,
      fontWeight: '600',
    },
    infoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: spacing.md,
    },
    infoGridItem: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '47%',
      backgroundColor: c.surface,
      padding: spacing.md,
      borderRadius: borderRadius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    infoGridTextCol: {
      marginLeft: 10,
    },
    infoGridLabel: {
      fontSize: 11,
      color: c.textMuted,
      fontWeight: '600',
    },
    infoGridValue: {
      fontSize: 13,
      color: c.text,
      fontWeight: 'bold',
      marginTop: 2,
    },
    amenitiesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: c.surfaceLight,
      padding: spacing.md,
      borderRadius: borderRadius.md,
    },
    amenityBadge: {
      alignItems: 'center',
    },
    amenityText: {
      fontSize: 10,
      color: c.text,
      marginTop: 4,
      fontWeight: '500',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    seeAllText: {
      fontSize: 13,
      fontWeight: '600',
    },
    vendorsList: {
      marginHorizontal: -spacing.md,
      paddingHorizontal: spacing.md,
    },
    vendorCard: {
      width: 200,
      borderRadius: borderRadius.md,
      marginRight: spacing.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: c.border,
    },
    vendorImg: {
      width: '100%',
      height: 100,
    },
    vendorInfo: {
      padding: spacing.sm,
    },
    vendorName: {
      fontSize: 14,
      fontWeight: 'bold',
      color: c.text,
    },
    vendorType: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 2,
    },
    reelsList: {
      marginHorizontal: -spacing.md,
      paddingHorizontal: spacing.md,
    },
    reelThumbCard: {
      width: 110,
      height: 180,
      borderRadius: borderRadius.md,
      marginRight: spacing.sm,
      overflow: 'hidden',
    },
    reelThumbImg: {
      width: '100%',
      height: '100%',
    },
    reelOverlay: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    reelViews: {
      color: '#fff',
      fontSize: 10,
      fontWeight: 'bold',
      marginLeft: 4,
    },
    puzzleBoard: {
      width: puzzleSize,
      height: puzzleSize,
      flexWrap: 'wrap',
      flexDirection: 'row',
      backgroundColor: '#E2E8F0',
      borderWidth: 1,
      borderColor: '#CBD5E1',
      alignSelf: 'center',
    },
    puzzleTile: {
      width: tileSize,
      height: tileSize,
      borderWidth: 1,
      borderColor: '#fff',
      position: 'relative',
      overflow: 'hidden',
    },
    puzzleTileEmpty: {
      backgroundColor: 'transparent',
    },
    tileNumberBadge: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    tileNumberText: {
      fontSize: 10,
      color: '#fff',
      fontWeight: 'bold',
    },
  });
}
