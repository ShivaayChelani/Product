import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const COLORS = {
  white: '#FFFFFF',
  text: '#202020',
  textMuted: '#6D6D6D',
  gold: '#D9A441',
  border: '#E7DFD2',
  background: '#FFFFFF',
  error: '#FF3B30',
  success: '#34C759',
};

interface VendorCodeRedeemModalProps {
  visible: boolean;
  offerTitle: string;
  pointsRequired: number;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (vendorCode: string) => void;
}

export default function VendorCodeRedeemModal({
  visible,
  offerTitle,
  pointsRequired,
  loading = false,
  onClose,
  onSubmit,
}: VendorCodeRedeemModalProps) {
  const [vendorCode, setVendorCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) {
      setVendorCode('');
      setError('');
    }
  }, [visible]);

  const handleSubmit = () => {
    const code = vendorCode.trim().toUpperCase();
    if (code.length < 4) {
      setError('Enter the vendor code shown at the business (e.g. VND-82KFQ1)');
      return;
    }
    setError('');
    onSubmit(code);
  };

  const handleClose = () => {
    setVendorCode('');
    setError('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Redeem Offer</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12}>
              <Icon name="close" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.offerTitle}>{offerTitle}</Text>
          <Text style={styles.subtitle}>
            Ask the vendor for their business code and enter it below to redeem {pointsRequired} PalPoints.
          </Text>

          <Text style={styles.label}>Vendor Code</Text>
          <TextInput
            value={vendorCode}
            onChangeText={(t) => {
              setVendorCode(t.toUpperCase());
              setError('');
            }}
            placeholder="VND-82KFQ1"
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, error ? styles.inputError : null]}
            editable={!loading}
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.hintBox}>
            <Icon name="information-circle-outline" size={18} color={COLORS.gold} />
            <Text style={styles.hintText}>
              No camera or QR scan needed — type the code the vendor shares with you.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.submitText}>Confirm Redemption</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  offerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 20,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 1,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
});
