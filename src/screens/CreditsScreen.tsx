import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Linking,
} from 'react-native';
import { Ionicons } from '../utils/Icons';
import { colors, spacing, borderRadius, shadows } from '../config/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';

interface CreditsScreenProps {
  onBack: () => void;
}

export default function CreditsScreen({ onBack }: CreditsScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Credits & Data Sources</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: contentPadBottom }}>
        {/* Map Data */}
        <View style={styles.section}>
          <View style={styles.sectionIcon}>
            <Text style={styles.sectionEmoji}>🗺️</Text>
          </View>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>Map & Location Data</Text>
            <Text style={styles.sectionText}>
              Map tiles and geographic data are provided by OpenStreetMap contributors under the Open Database License (ODbL).
            </Text>
            <Text style={styles.attributionText}>
              © OpenStreetMap contributors
            </Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
            >
              <Text style={styles.linkText}>View OSM License Details →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tourist Information */}
        <View style={styles.section}>
          <View style={styles.sectionIcon}>
            <Text style={styles.sectionEmoji}>📍</Text>
          </View>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>Tourist Spot Information</Text>
            <Text style={styles.sectionText}>
              Tourist spot data, descriptions, and points of interest are sourced from the PalSafar platform database and verified place records. Details may not reflect real-time changes — always confirm opening hours, entry fees, and safety information from official sources before visiting.
            </Text>
            <Text style={styles.sourceBadge}>Source: PalSafar Places API</Text>
          </View>
        </View>

        {/* Routing */}
        <View style={styles.section}>
          <View style={styles.sectionIcon}>
            <Text style={styles.sectionEmoji}>🧭</Text>
          </View>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>Driving Routes</Text>
            <Text style={styles.sectionText}>
              Drive distance and time-to-reach use OSRM driving routes from your current location to the place, via PalSafar’s server. Straight-line estimates are never shown as driving distance.
            </Text>
          </View>
        </View>

        {/* Future Data Sources */}
        <View style={styles.section}>
          <View style={styles.sectionIcon}>
            <Text style={styles.sectionEmoji}>📚</Text>
          </View>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>Future Data Sources</Text>
            <Text style={styles.sectionText}>
              Some future structured tourist information may come from Wikidata and Wikimedia Commons with proper attribution. All third-party data will be credited appropriately within the app.
            </Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL('https://www.wikidata.org/')}
            >
              <Text style={styles.linkText}>Explore Wikidata →</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <View style={styles.sectionIcon}>
            <Text style={styles.sectionEmoji}>📱</Text>
          </View>
          <View style={styles.sectionContent}>
            <Text style={styles.sectionTitle}>PalSafar</Text>
            <Text style={styles.sectionText}>
              A gamified tourism mobile app built with React Native. Designed to make exploring India fun, rewarding, and accessible.
            </Text>
            <Text style={styles.versionText}>Version 1.0.0</Text>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerCard}>
          <Ionicons name="information-circle" size={20} color={colors.textMuted} style={{ marginRight: 8 }} />
          <Text style={styles.disclaimerText}>
            Tourist information is provided for exploration planning only. Always verify real-time details (opening hours, entry fees, safety) from official sources before visiting.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  content: {
    flex: 1,
  },
  section: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    marginTop: 2,
  },
  sectionEmoji: {
    fontSize: 22,
  },
  sectionContent: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  attributionText: {
    fontSize: 12,
    color: colors.gold,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  sourceBadge: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
    marginTop: spacing.sm,
    backgroundColor: colors.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  linkButton: {
    marginTop: spacing.sm,
    paddingVertical: 4,
  },
  linkText: {
    fontSize: 13,
    color: colors.primaryLight,
    fontWeight: '600',
  },
  versionText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  disclaimerCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
});
