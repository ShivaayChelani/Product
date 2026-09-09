import React, { useEffect, useState, useContext, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { launchCamera } from 'react-native-image-picker';
import { riddlesApi, Riddle } from '../services/api/riddles';
import { TH, SANS, SANS_BOLD, SANS_SEMI } from '../features/treasureHunt/theme';

import { useLocationContext } from '../context/LocationContext';

const PALPOINT_ICON = require('../assets/palpoint icon.png');

export default function TreasureHuntScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const locationCtx = useLocationContext();

  const [hunts, setHunts] = useState<Riddle[]>([]);
  const [currentCity, setCurrentCity] = useState<string | null>(null);
  
  // States: 'detecting' | 'error' | 'list' | 'detail' | 'checkin' | 'preview' | 'submitting' | 'success'
  const [viewState, setViewState] = useState<'detecting' | 'error' | 'list' | 'detail' | 'checkin' | 'preview' | 'submitting' | 'success'>('detecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorTitle, setErrorTitle] = useState('');
  const [selectedHunt, setSelectedHunt] = useState<Riddle | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [checkInDistance, setCheckInDistance] = useState<number | null>(null);
  const [isCheckInAllowed, setIsCheckInAllowed] = useState(false);
  const lastFetchedCity = useRef<{ lat: number, lng: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      if (locationCtx?.hasPermission === false) {
        if (isActive) {
          setErrorTitle('Location Permission Denied');
          setErrorMsg('Please enable GPS to play Treasure Hunt.');
          setViewState('error');
        }
      } else if (locationCtx?.position) {
        const { latitude, longitude } = locationCtx.position;
        
        // Calculate approx distance from last fetch (if any)
        let distance = 0;
        if (lastFetchedCity.current) {
          const latDiff = latitude - lastFetchedCity.current.lat;
          const lngDiff = longitude - lastFetchedCity.current.lng;
          // Very rough distance estimation: 1 deg ~ 111km. Threshold ~ 2km.
          distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111;
        }

        if (!lastFetchedCity.current || distance > 2) {
          loadHunts(latitude, longitude);
        }
      } else {
        if (isActive) setViewState('detecting');
      }

      return () => { isActive = false; };
    }, [locationCtx?.position, locationCtx?.hasPermission])
  );

  const loadHunts = async (lat: number, lng: number) => {
    try {
      lastFetchedCity.current = { lat, lng };
      const res = await riddlesApi.getActiveForCurrentLocation(lat, lng);
      setCurrentCity(res.data.city);
      setHunts(res.data.riddles);
      setViewState('list');
    } catch (err: any) {
      if (err.code === 'CITY_RESOLUTION_FAILED') {
        setErrorTitle('City Not Found');
        setErrorMsg('We couldn\'t determine your current city. Please try again.');
      } else if (err.message?.includes('Network') || err.message?.includes('timeout') || err.name === 'AbortError') {
        setErrorTitle('Network Error');
        setErrorMsg('Unable to connect. Check your internet connection and try again.');
      } else {
        setErrorTitle('Location Error');
        setErrorMsg(err.message || 'Could not find your city.');
      }
      setViewState('error');
    }
  };

  const handleRetry = () => {
    lastFetchedCity.current = null;
    setViewState('detecting');
    if (locationCtx?.position) {
      loadHunts(locationCtx.position.latitude, locationCtx.position.longitude);
    }
  };

  const handleStartHunt = (hunt: Riddle) => {
    setSelectedHunt(hunt);
    setViewState('detail');
  };

  const handleVerifyLocation = async () => {
    if (!locationCtx?.position || !selectedHunt) return;
    try {
      const res = await riddlesApi.validateCheckIn(selectedHunt.id, locationCtx.position.latitude, locationCtx.position.longitude);
      setCheckInDistance(res.data.distanceMeters);
      setIsCheckInAllowed(res.data.allowed);
      setViewState('checkin');
    } catch (err: any) {
      Alert.alert('Check-in failed', err.response?.data?.message || 'Could not verify your location.');
    }
  };

  const handleTakePhoto = async () => {
    const result = await launchCamera({ mediaType: 'photo', quality: 0.8 });
    if (result.assets && result.assets.length > 0 && result.assets[0].uri) {
      setPhotoUri(result.assets[0].uri);
      setViewState('preview');
    }
  };

  const handleSubmit = async () => {
    if (!selectedHunt || !photoUri || !locationCtx?.position) return;
    try {
      setViewState('submitting');
      await riddlesApi.submit(selectedHunt.id, photoUri, locationCtx.position.latitude, locationCtx.position.longitude);
      setViewState('success');
    } catch (err: any) {
      setViewState('preview');
      Alert.alert('Submission Failed', err.response?.data?.message || 'Please try again.');
    }
  };

  // --- Renders ---

  if (viewState === 'detecting') {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6F4528" />
        <Text style={styles.detectingText}>Finding your city...</Text>
      </View>
    );
  }

  if (viewState === 'error') {
    return (
      <View style={[styles.container, styles.center, { padding: 32 }]}>
        <Icon name="location-outline" size={64} color="#666" style={{ marginBottom: 16 }} />
        <Text style={[styles.successTitle, { color: '#1C1C1E', textAlign: 'center' }]}>{errorTitle}</Text>
        <Text style={[styles.successSub, { textAlign: 'center', marginBottom: 32 }]}>{errorMsg}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
          <Text style={styles.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryBtn, { marginTop: 16 }]} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (viewState === 'success') {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: '#F8F9FA' }]}>
        <Icon name="checkmark-circle" size={80} color="#2E7D32" />
        <Text style={styles.successTitle}>Treasure Found!</Text>
        <Text style={styles.successSub}>Your photo has been submitted for verification.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { setViewState('list'); setSelectedHunt(null); }}>
          <Text style={styles.primaryBtnText}>Back to Hunts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('MyTreasureHunts' as any)}>
          <Text style={styles.secondaryBtnText}>View My Hunts</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => {
          if (viewState === 'list') navigation.goBack();
          else if (viewState === 'detail') setViewState('list');
          else if (viewState === 'checkin') setViewState('detail');
          else if (viewState === 'preview') setViewState('checkin');
        }}>
          <Icon name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Treasure Hunt</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MyTreasureHunts' as any)} style={styles.historyBtn}>
          <Icon name="time-outline" size={24} color="#1C1C1E" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {viewState === 'list' && (
          <>
            <View style={styles.cityHeader}>
              <Icon name="location" size={20} color="#6F4528" />
              <Text style={styles.cityText}>You're in {currentCity}</Text>
            </View>
            <Text style={styles.subtitle}>Discover hidden stories around you.</Text>
            
            {hunts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 18, fontFamily: SANS_BOLD, color: '#1C1C1E', marginBottom: 8 }}>📍 You're in {currentCity}</Text>
                  <Text style={styles.emptyText}>Treasure Hunt isn't available here yet.</Text>
                  <Text style={[styles.emptyText, { marginTop: 8 }]}>More cities coming soon!</Text>
                  <TouchableOpacity style={{ marginTop: 24, padding: 12, backgroundColor: TH.primary, borderRadius: 8 }} onPress={() => {
                    lastFetchedCity.current = null;
                    setViewState('detecting');
                    if (locationCtx?.position) loadHunts(locationCtx.position.latitude, locationCtx.position.longitude);
                  }}>
                    <Text style={{ color: 'white', fontFamily: SANS_BOLD }}>Refresh Location</Text>
                  </TouchableOpacity>
                </View>
              ) : (
              hunts.map((h) => (
                <TouchableOpacity key={h.id} style={styles.huntCard} onPress={() => handleStartHunt(h)}>
                  <View style={styles.huntCardInner}>
                    <Text style={styles.huntTitle}>🗺️ {h.title}</Text>
                    <Text style={styles.huntClue} numberOfLines={2}>{h.clue}</Text>
                    <View style={styles.rewardPill}>
                      <Text style={styles.rewardText}>{h.rewardPoints} PalPoints</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {viewState === 'detail' && selectedHunt && (
          <View style={styles.detailContainer}>
            <Text style={styles.detailTitle}>{selectedHunt.title}</Text>
            <View style={styles.clueCard}>
              <Text style={styles.clueLabel}>THE CLUE</Text>
              <Text style={styles.clueText}>{selectedHunt.clue}</Text>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyLocation}>
              <Text style={styles.primaryBtnText}>I'm Here (Check-in)</Text>
            </TouchableOpacity>
          </View>
        )}

        {viewState === 'checkin' && (
          <View style={styles.checkinContainer}>
            {isCheckInAllowed ? (
              <>
                <Icon name="location" size={64} color="#2E7D32" />
                <Text style={styles.checkinTitle}>You found it!</Text>
                <Text style={styles.checkinSub}>Take a photo of the location to prove you're here.</Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleTakePhoto}>
                  <Text style={styles.primaryBtnText}>Take Photo</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Icon name="navigate-circle" size={64} color="#F57F17" />
                <Text style={styles.checkinTitle}>You are {checkInDistance}m away</Text>
                <Text style={styles.checkinSub}>Move closer to the treasure location to check in.</Text>
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleVerifyLocation}>
                  <Text style={styles.secondaryBtnText}>Refresh Distance</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {viewState === 'preview' && photoUri && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: photoUri }} style={styles.previewImage} />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit}>
              <Text style={styles.primaryBtnText}>Submit Answer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleTakePhoto}>
              <Text style={styles.secondaryBtnText}>Retake Photo</Text>
            </TouchableOpacity>
          </View>
        )}

        {viewState === 'submitting' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#6F4528" />
            <Text style={styles.detectingText}>Submitting...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFDF9' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
  backButton: { padding: 4 },
  historyBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontFamily: SANS_SEMI, color: '#1C1C1E' },
  scroll: { padding: 16 },
  detectingText: { marginTop: 16, fontSize: 16, fontFamily: SANS, color: '#666' },
  cityHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  cityText: { fontSize: 16, fontFamily: SANS_BOLD, color: '#6F4528', textTransform: 'uppercase' },
  subtitle: { fontSize: 16, fontFamily: SANS, color: '#666', marginBottom: 24 },
  emptyState: { padding: 32, alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 16 },
  emptyText: { textAlign: 'center', color: '#666', fontFamily: SANS },
  huntCard: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 16, shadowColor: '#6F4528', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
  huntCardInner: { padding: 20 },
  huntTitle: { fontSize: 18, fontFamily: SANS_BOLD, color: '#1C1C1E', marginBottom: 8 },
  huntClue: { fontSize: 14, fontFamily: SANS, color: '#666', marginBottom: 16, lineHeight: 20 },
  rewardPill: { backgroundColor: '#FDF1E6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, alignSelf: 'flex-start' },
  rewardText: { color: '#D97706', fontFamily: SANS_BOLD, fontSize: 12 },
  detailContainer: { padding: 8 },
  detailTitle: { fontSize: 24, fontFamily: SANS_BOLD, color: '#1C1C1E', marginBottom: 24 },
  clueCard: { backgroundColor: '#F8F9FA', padding: 20, borderRadius: 16, marginBottom: 32, borderWidth: 1, borderColor: '#E5E5EA' },
  clueLabel: { fontSize: 12, fontFamily: SANS_BOLD, color: '#999', marginBottom: 8, letterSpacing: 1 },
  clueText: { fontSize: 18, fontFamily: SANS_SEMI, color: '#1C1C1E', lineHeight: 26 },
  primaryBtn: { backgroundColor: '#6F4528', padding: 16, borderRadius: 12, alignItems: 'center', width: '100%', marginBottom: 12 },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontFamily: SANS_BOLD },
  secondaryBtn: { backgroundColor: '#F5F5F5', padding: 16, borderRadius: 12, alignItems: 'center', width: '100%' },
  secondaryBtnText: { color: '#1C1C1E', fontSize: 16, fontFamily: SANS_SEMI },
  checkinContainer: { alignItems: 'center', padding: 24, marginTop: 40 },
  checkinTitle: { fontSize: 24, fontFamily: SANS_BOLD, color: '#1C1C1E', marginTop: 16, marginBottom: 8 },
  checkinSub: { fontSize: 16, fontFamily: SANS, color: '#666', textAlign: 'center', marginBottom: 32 },
  previewContainer: { alignItems: 'center' },
  previewImage: { width: '100%', height: 300, borderRadius: 16, marginBottom: 24, backgroundColor: '#EFEFEF' },
  successTitle: { fontSize: 28, fontFamily: SANS_BOLD, color: '#1C1C1E', marginTop: 24, marginBottom: 12 },
  successSub: { fontSize: 16, fontFamily: SANS, color: '#666', textAlign: 'center', marginBottom: 40, paddingHorizontal: 32 }
});
