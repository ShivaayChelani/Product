import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { CreatorUI } from '../theme';
type Reel = any;

interface CreatorReelMenuModalProps {
  visible: boolean;
  reelTitle?: string;
  reelStatus?: 'APPROVED' | 'DRAFT' | 'ARCHIVED';
  onClose: () => void;
  onEdit: () => void;
  onAnalytics: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

export function CreatorReelMenuModal({
  visible,
  reelTitle,
  reelStatus,
  onClose,
  onEdit,
  onAnalytics,
  onArchiveToggle,
  onDelete,
}: CreatorReelMenuModalProps) {
  if (!visible) return null;

  const displayTitle = reelTitle ? `Manage ${reelTitle}` : 'Manage Moment';
  const isDraft = reelStatus === 'DRAFT';
  const isArchived = reelStatus === 'ARCHIVED';
  const isPublished = reelStatus === 'APPROVED' || !reelStatus;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />

              <View style={styles.header}>
                <View style={styles.headerIconWrap}>
                  <Icon name="grid-outline" size={20} color="#B5894B" />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.title} numberOfLines={1}>{displayTitle}</Text>
                  <Text style={styles.subtitle}>Choose an action for this reel</Text>
                </View>
                <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                  <Icon name="close" size={20} color={CreatorUI.colors.text} />
                </TouchableOpacity>
              </View>

              {(isPublished || isDraft) && (
                <TouchableOpacity style={[styles.row, styles.rowGreen]} activeOpacity={0.7} onPress={onEdit}>
                  <View style={[styles.iconBox, { backgroundColor: '#E8F5E9' }]}>
                    <Icon name="pencil-outline" size={20} color="#2E7D32" />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowTitle, { color: '#2E7D32' }]}>{isDraft ? 'Continue Editing' : 'Edit Reel'}</Text>
                    <Text style={styles.rowSub}>{isDraft ? 'Finish your draft' : 'Update your reel details'}</Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color="#2E7D32" />
                </TouchableOpacity>
              )}

              {isPublished && (
                <TouchableOpacity style={[styles.row, styles.rowPurple]} activeOpacity={0.7} onPress={onAnalytics}>
                  <View style={[styles.iconBox, { backgroundColor: '#F3E5F5' }]}>
                    <Icon name="stats-chart-outline" size={20} color="#6A1B9A" />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowTitle, { color: '#6A1B9A' }]}>View Analytics</Text>
                    <Text style={styles.rowSub}>See performance and insights</Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color="#6A1B9A" />
                </TouchableOpacity>
              )}

              {(isPublished || isArchived) && (
                <TouchableOpacity style={[styles.row, styles.rowOrange]} activeOpacity={0.7} onPress={onArchiveToggle}>
                  <View style={[styles.iconBox, { backgroundColor: '#FFF3E0' }]}>
                    <Icon name="archive-outline" size={20} color="#E65100" />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={[styles.rowTitle, { color: '#E65100' }]}>{isArchived ? 'Restore Reel' : 'Archive Reel'}</Text>
                    <Text style={styles.rowSub}>{isArchived ? 'Restore reel to public view' : 'Hide reel from public view'}</Text>
                  </View>
                  <Icon name="chevron-forward" size={20} color="#E65100" />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={[styles.row, styles.rowRed]} activeOpacity={0.7} onPress={onDelete}>
                <View style={[styles.iconBox, { backgroundColor: '#FFEBEE' }]}>
                  <Icon name="trash-outline" size={20} color="#C62828" />
                </View>
                <View style={styles.rowTextWrap}>
                  <Text style={[styles.rowTitle, { color: '#C62828' }]}>Delete Reel</Text>
                  <Text style={styles.rowSub}>Permanently delete this reel</Text>
                </View>
                <Icon name="chevron-forward" size={20} color="#C62828" />
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFCF8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0D4C3',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F7EDDE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: CreatorUI.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: CreatorUI.colors.textMuted,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8DFD1',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  rowGreen: {
    backgroundColor: '#FAFCFA',
    borderColor: '#E8F5E9',
  },
  rowPurple: {
    backgroundColor: '#FCFAFD',
    borderColor: '#F3E5F5',
  },
  rowOrange: {
    backgroundColor: '#FDFBFA',
    borderColor: '#FFF3E0',
  },
  rowRed: {
    backgroundColor: '#FCFAFA',
    borderColor: '#FFEBEE',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  rowSub: {
    fontSize: 13,
    color: '#757575',
  },
});
