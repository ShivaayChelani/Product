import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LegalConsentRow } from './LegalConsentRow';

export interface LegalVersions {
  termsVersion: number;
  privacyVersion: number;
}

interface LegalAcceptanceModalProps {
  visible: boolean;
  legalVersions: LegalVersions | null;
  /** Called with accepted version numbers when user confirms. */
  onAccept: (versions: LegalVersions) => void;
  /** Called when user cancels — Google login is aborted, no account created. */
  onCancel: () => void;
  /** Navigate to a legal document screen from within the modal. */
  onOpenDocument: (type: 'TERMS_CONDITIONS' | 'PRIVACY_POLICY') => void;
  isLoading?: boolean;
}

/**
 * Shown when a brand-new Google account needs to accept Terms & Conditions and Privacy Policy
 * before the account is created. Cannot be dismissed by tapping outside — prevents bypass.
 *
 * Two-phase Google login flow:
 *   Phase 1: backend returns { requiresLegalAcceptance: true }
 *   → show this modal
 *   Phase 2: user accepts → frontend re-submits idToken + acceptance → session created
 */
export function LegalAcceptanceModal({
  visible,
  legalVersions,
  onAccept,
  onCancel,
  onOpenDocument,
  isLoading = false,
}: LegalAcceptanceModalProps) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const canContinue = termsAccepted && privacyAccepted && !isLoading;

  const handleAccept = useCallback(() => {
    if (!canContinue || !legalVersions) return;
    onAccept(legalVersions);
  }, [canContinue, legalVersions, onAccept]);

  const handleCancel = useCallback(() => {
    // Reset checkboxes when cancelling so they start fresh next time
    setTermsAccepted(false);
    setPrivacyAccepted(false);
    onCancel();
  }, [onCancel]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Prevent accidental dismissal — user must explicitly accept or cancel
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.sheet}>
            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Header */}
              <View style={styles.headerBar} />
              <Text style={styles.title}>Before You Continue</Text>
              <Text style={styles.subtitle}>
                To create your PalSafar account, please read and accept the following:
              </Text>

              {/* Legal consent checkboxes */}
              <View style={styles.checkboxSection}>
                <LegalConsentRow
                  accepted={termsAccepted}
                  onToggle={() => setTermsAccepted((v) => !v)}
                  onOpenDocument={() => onOpenDocument('TERMS_CONDITIONS')}
                  label="I agree to the"
                  linkLabel="Terms & Conditions"
                  accessibilityLabel="Accept Terms and Conditions"
                />
                <LegalConsentRow
                  accepted={privacyAccepted}
                  onToggle={() => setPrivacyAccepted((v) => !v)}
                  onOpenDocument={() => onOpenDocument('PRIVACY_POLICY')}
                  label="I have read and agree to the"
                  linkLabel="Privacy Policy"
                  accessibilityLabel="Accept Privacy Policy"
                />
              </View>

              {/* Actions */}
              <TouchableOpacity
                style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
                onPress={handleAccept}
                disabled={!canContinue}
                accessibilityRole="button"
                accessibilityLabel="Continue and create account"
                accessibilityState={{ disabled: !canContinue }}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.continueBtnText}>Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                disabled={isLoading}
                accessibilityRole="button"
                accessibilityLabel="Cancel Google Sign-In"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  safeArea: {
    backgroundColor: 'transparent',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 12 : 24,
    maxHeight: '85%',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerBar: {
    width: 40,
    height: 4,
    backgroundColor: '#DDDDDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6F6F6F',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  checkboxSection: {
    marginBottom: 24,
  },
  continueBtn: {
    backgroundColor: '#B9834B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  continueBtnDisabled: {
    backgroundColor: '#D4B896',
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#6F6F6F',
    fontSize: 15,
    fontWeight: '500',
  },
});
