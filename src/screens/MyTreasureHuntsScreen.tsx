import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { riddlesApi, MyRiddleSubmission } from '../services/api/riddles';

const PALPOINT_ICON = require('../assets/palpoint icon.png');

export default function MyTreasureHuntsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [submissions, setSubmissions] = useState<MyRiddleSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      const res = await riddlesApi.getMySubmissions();
      setSubmissions(res.data);
    } catch (err) {
      console.warn('Failed to load my treasure hunts', err);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: MyRiddleSubmission }) => {
    const isApproved = item.status === 'APPROVED';
    const isPending = item.status === 'PENDING';
    
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.title}>{item.riddle.title}</Text>
          <View style={[styles.badge, isApproved ? styles.badgeSuccess : isPending ? styles.badgeWarning : styles.badgeError]}>
            <Text style={[styles.badgeText, isApproved ? styles.badgeTextSuccess : isPending ? styles.badgeTextWarning : styles.badgeTextError]}>
              {item.status}
            </Text>
          </View>
        </View>
        
        <View style={styles.cardContent}>
          <Text style={styles.city}>📍 {item.riddle.city}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
        </View>

        {isApproved && (
          <View style={styles.rewardContainer}>
            <Text style={styles.rewardText}>Earned {item.pointsAwarded}</Text>
            <Image source={PALPOINT_ICON} style={styles.palpoint} />
          </View>
        )}

        {item.adminComment && (
          <View style={styles.commentContainer}>
            <Text style={styles.commentText}>Feedback: {item.adminComment}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="arrow-back" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Hunts</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : (
        <FlatList
          data={submissions}
          keyExtractor={(s) => s.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You haven't submitted any hunts yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E5EA'
  },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1C1C1E' },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '600', color: '#1C1C1E', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeSuccess: { backgroundColor: '#E8F5E9' },
  badgeWarning: { backgroundColor: '#FFF8E1' },
  badgeError: { backgroundColor: '#FFEBEE' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextSuccess: { color: '#2E7D32' },
  badgeTextWarning: { color: '#F57F17' },
  badgeTextError: { color: '#C62828' },
  cardContent: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  city: { fontSize: 14, color: '#666' },
  date: { fontSize: 14, color: '#999' },
  rewardContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', padding: 8, borderRadius: 8, alignSelf: 'flex-start' },
  rewardText: { fontSize: 14, fontWeight: '600', color: '#6F4528', marginRight: 4 },
  palpoint: { width: 16, height: 16 },
  commentContainer: { marginTop: 12, padding: 12, backgroundColor: '#FFF3E0', borderRadius: 8 },
  commentText: { fontSize: 14, color: '#E65100', fontStyle: 'italic' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#666', textAlign: 'center' }
});
