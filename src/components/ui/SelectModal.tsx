import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  TouchableWithoutFeedback,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import Pal from '../../design/DesignSystem';
import { scale, verticalScale, fontScale, radiusScale, iconScale } from '../../design/responsive';

export interface SelectModalProps {
  visible: boolean;
  title: string;
  options: readonly string[];
  selectedValue?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function SelectModal({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
}: SelectModalProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(query));
  }, [options, searchQuery]);

  // Reset search when closed
  const handleClose = () => {
    setSearchQuery('');
    onClose();
  };

  const handleSelect = (option: string) => {
    setSearchQuery('');
    onSelect(option);
    onClose();
  };

  const renderItem = ({ item, index }: { item: string; index: number }) => {
    const isSelected = item === selectedValue;
    return (
      <TouchableOpacity
        style={[
          styles.optionBtn,
          isSelected && styles.optionBtnSelected,
          index === filteredOptions.length - 1 && styles.lastOption
        ]}
        onPress={() => handleSelect(item)}
      >
        <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
          {item}
        </Text>
        {isSelected && (
          <Icon name="checkmark" size={20} color={Pal.colors.light.primary} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
              <View style={styles.content}>
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                  <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                    <Icon name="close" size={24} color={Pal.colors.light.text} />
                  </TouchableOpacity>
                </View>
                
                {options.length > 10 && (
                  <View style={styles.searchContainer}>
                    <Icon name="search-outline" size={20} color={Pal.colors.light.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search..."
                      placeholderTextColor={Pal.colors.light.textMuted}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <Icon name="close-circle" size={20} color={Pal.colors.light.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                <FlatList
                  data={filteredOptions}
                  keyExtractor={(item) => item}
                  renderItem={renderItem}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  initialNumToRender={15}
                  maxToRenderPerBatch={20}
                  windowSize={5}
                />
              </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(20),
  },
  modalContainer: {
    maxHeight: '80%',
    width: '100%',
    maxWidth: 400,
    backgroundColor: Pal.colors.light.card,
    borderRadius: radiusScale(20),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  content: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(16),
    borderBottomWidth: 1,
    borderBottomColor: Pal.colors.light.border,
  },
  title: {
    fontFamily: Pal.typography.fontFamily.semibold,
    fontSize: fontScale(18),
    color: Pal.colors.light.text,
  },
  closeBtn: {
    padding: scale(4),
    marginRight: scale(-4),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Pal.colors.light.background,
    margin: scale(16),
    marginBottom: verticalScale(8),
    paddingHorizontal: scale(12),
    borderRadius: radiusScale(10),
    borderWidth: 1,
    borderColor: Pal.colors.light.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(8),
    fontFamily: Pal.typography.fontFamily.regular,
    fontSize: fontScale(16),
    color: Pal.colors.light.text,
  },
  list: {
    flexShrink: 1,
  },
  listContent: {
    padding: scale(8),
    paddingTop: 0,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(16),
    borderRadius: radiusScale(12),
    borderBottomWidth: 1,
    borderBottomColor: Pal.colors.light.border + '60',
  },
  lastOption: {
    borderBottomWidth: 0,
  },
  optionBtnSelected: {
    backgroundColor: Pal.colors.light.primary + '10',
    borderColor: 'transparent',
  },
  optionText: {
    flex: 1,
    fontFamily: Pal.typography.fontFamily.regular,
    fontSize: fontScale(16),
    color: Pal.colors.light.text,
  },
  optionTextSelected: {
    fontFamily: Pal.typography.fontFamily.semibold,
    color: Pal.colors.light.primary,
  },
});
