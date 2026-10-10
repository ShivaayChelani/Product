import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { palette } from '../../config/theme';

interface AppleEmailCompletionModalProps {
  visible: boolean;
  step: 'email' | 'code';
  email: string;
  isLoading?: boolean;
  error?: string | null;
  onSubmitEmail: (email: string) => void;
  onSubmitCode: (code: string) => void;
  onResend: () => void;
  onCancel: () => void;
}

/**
 * Shown when a new Apple identity has no recoverable email. The typed address
 * is confirmed with a one-time code before the server creates or links an account.
 */
export const AppleEmailCompletionModal: React.FC<AppleEmailCompletionModalProps> = ({
  visible,
  step,
  email,
  isLoading = false,
  error,
  onSubmitEmail,
  onSubmitCode,
  onResend,
  onCancel,
}) => {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (visible) setDraft('');
  }, [visible, step]);

  const submit = () => {
    if (isLoading) return;
    if (step === 'email') onSubmitEmail(draft.trim());
    else onSubmitCode(draft.trim());
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Finish creating your account</Text>
          <Text style={styles.body}>
            {step === 'email'
              ? 'Apple did not include an email address for this sign-in. Enter an email you can access. We will send a code to confirm it before creating your PalSafar account.'
              : `Enter the 8-character code sent to ${email}.`}
          </Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            autoCapitalize={step === 'email' ? 'none' : 'characters'}
            autoCorrect={false}
            keyboardType={step === 'email' ? 'email-address' : 'default'}
            placeholder={step === 'email' ? 'Email address' : 'Verification code'}
            placeholderTextColor={palette.textSecondary}
            style={styles.input}
            editable={!isLoading}
            testID={step === 'email' ? 'appleEmailCompletionInput' : 'appleEmailCodeInput'}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.primary, isLoading && styles.primaryDisabled]}
            onPress={submit}
            disabled={isLoading}
            testID="appleEmailCompletionSubmit"
          >
            {isLoading ? (
              <ActivityIndicator color={palette.onPrimary} />
            ) : (
              <Text style={styles.primaryText}>{step === 'email' ? 'Continue' : 'Verify email'}</Text>
            )}
          </TouchableOpacity>
          {step === 'code' ? (
            <TouchableOpacity onPress={onResend} disabled={isLoading} testID="appleEmailCompletionResend">
              <Text style={styles.link}>Resend code</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onCancel} disabled={isLoading} testID="appleEmailCompletionCancel">
            <Text style={styles.link}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.text,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: palette.textSecondary,
    marginBottom: 16,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: palette.text,
    marginBottom: 12,
  },
  error: {
    color: palette.error,
    marginBottom: 12,
  },
  primary: {
    height: 52,
    borderRadius: 14,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryDisabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: palette.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    textAlign: 'center',
    color: palette.textSecondary,
    fontSize: 15,
    paddingVertical: 8,
  },
});
