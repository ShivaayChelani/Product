import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { ProfileColors as C, SANS, SANS_BOLD } from './profileTheme';

interface MyTripsCardProps {
  upcomingCount: number;
  completedCount: number;
  savedCount: number;
  draftsCount: number;
  onViewAll: () => void;
  onPressUpcoming: () => void;
  onPressCompleted: () => void;
  onPressSaved: () => void;
  onPressDrafts: () => void;
}

export const MyTripsCard = ({
  upcomingCount,
  completedCount,
  savedCount,
  draftsCount,
  onViewAll,
  onPressUpcoming,
  onPressCompleted,
  onPressSaved,
  onPressDrafts,
}: MyTripsCardProps) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Trips</Text>
        <TouchableOpacity style={styles.viewAllBtn} onPress={onViewAll} activeOpacity={0.8}>
          <Text style={styles.viewAllText}>View All</Text>
          <Icon name="arrow-forward" size={14} color={C.goldDark} style={styles.viewAllArrow} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <TouchableOpacity style={styles.statItem} onPress={onPressUpcoming} activeOpacity={0.7}>
          <View style={styles.statIconWrapper}>
            <Icon name="briefcase-outline" size={22} color="#4A3427" />
          </View>
          <Text style={styles.statNumber}>{upcomingCount}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statItem} onPress={onPressCompleted} activeOpacity={0.7}>
          <View style={styles.statIconWrapper}>
            <Icon name="git-network-outline" size={22} color="#4A3427" />
          </View>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statItem} onPress={onPressSaved} activeOpacity={0.7}>
          <View style={styles.statIconWrapper}>
            <Icon name="heart-outline" size={22} color="#4A3427" />
          </View>
          <Text style={styles.statNumber}>{savedCount}</Text>
          <Text style={styles.statLabel}>Saved</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statItem} onPress={onPressDrafts} activeOpacity={0.7}>
          <View style={styles.statIconWrapper}>
            <Icon name="document-text-outline" size={22} color="#4A3427" />
          </View>
          <Text style={styles.statNumber}>{draftsCount}</Text>
          <Text style={styles.statLabel}>Drafts</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#2B1D15',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F3EBE3',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: SANS_BOLD,
    color: '#13111C',
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 13,
    fontFamily: SANS,
    color: '#13111C',
  },
  viewAllArrow: {
    marginLeft: 4,
    marginTop: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FDF7F2',
    borderWidth: 1,
    borderColor: '#E8DDD0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statNumber: {
    fontSize: 16,
    fontFamily: SANS_BOLD,
    color: '#13111C',
    lineHeight: 18,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: SANS,
    color: '#6A6158',
  },
});
