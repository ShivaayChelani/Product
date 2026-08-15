import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useBottomSafePadding } from '../../../design/responsive';

const COLORS = {
  bg: '#FFFFFF',
  primary: '#7B5E43',
  danger: '#DC2626',
  textPrimary: '#1F1A17',
  textSecondary: '#5E544C',
  border: '#E3DACD',
  gold: '#A67C52',
};

// ==========================================
// TIMELINE
// ==========================================
type CollaborationTimelineProps = {
  status: string;
};

export function CollaborationTimeline({ status }: CollaborationTimelineProps) {
  // We infer progress based on standard statuses
  const stages = [
    { key: 'PENDING', label: 'Request Received' },
    { key: 'ACCEPTED', label: 'Accepted' },
    { key: 'IN_PROGRESS', label: 'Visit Business' },
    { key: 'REEL_UPLOADED', label: 'Content Submitted' },
    { key: 'APPROVED', label: 'Approval' },
    { key: 'COMPLETED', label: 'Payment' },
  ];

  let currentIndex = stages.findIndex((s) => s.key === status);
  if (currentIndex === -1) {
    if (status === 'REVISION_REQUESTED') currentIndex = 2; // Treat as In Progress
    else if (status === 'REJECTED' || status === 'CANCELLED') currentIndex = 0;
    else currentIndex = stages.length - 1;
  }

  return (
    <View style={timelineStyles.container}>
      <Text style={timelineStyles.title}>Timeline</Text>
      <View style={timelineStyles.timeline}>
        {stages.map((stage, idx) => {
          const isCompleted = idx < currentIndex || status === 'COMPLETED';
          const isCurrent = idx === currentIndex && status !== 'COMPLETED';
          
          return (
            <View key={stage.key} style={timelineStyles.step}>
              <View style={timelineStyles.iconCol}>
                <View style={[
                  timelineStyles.dot,
                  isCompleted && timelineStyles.dotCompleted,
                  isCurrent && timelineStyles.dotCurrent
                ]}>
                  {isCompleted && <Icon name="checkmark" size={10} color="#FFF" />}
                </View>
                {idx < stages.length - 1 && (
                  <View style={[
                    timelineStyles.line,
                    isCompleted && timelineStyles.lineCompleted
                  ]} />
                )}
              </View>
              <View style={timelineStyles.textCol}>
                <Text style={[
                  timelineStyles.label,
                  (isCompleted || isCurrent) && timelineStyles.labelActive,
                  isCurrent && timelineStyles.labelCurrent
                ]}>
                  {stage.label}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const timelineStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  timeline: {
    paddingLeft: 8,
  },
  step: {
    flexDirection: 'row',
  },
  iconCol: {
    width: 24,
    alignItems: 'center',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCompleted: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  dotCurrent: {
    borderColor: COLORS.primary,
    borderWidth: 4,
  },
  line: {
    width: 2,
    flex: 1,
    minHeight: 24,
    backgroundColor: COLORS.border,
    marginVertical: 4,
  },
  lineCompleted: {
    backgroundColor: COLORS.gold,
  },
  textCol: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 24,
  },
  label: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: -2,
  },
  labelActive: {
    color: COLORS.textPrimary,
  },
  labelCurrent: {
    fontWeight: '700',
    color: COLORS.primary,
  },
});

// ==========================================
// ACTION FOOTER
// ==========================================
type ActionFooterProps = {
  status: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onStart?: () => void;
  onMessage?: () => void;
  onSubmitContent?: () => void;
  onViewContent?: () => void;
  onViewEarnings?: () => void;
};

export function ContextAwareActionFooter({
  status,
  onAccept,
  onDecline,
  onStart,
  onMessage,
  onSubmitContent,
  onViewContent,
  onViewEarnings,
}: ActionFooterProps) {
  const padBottom = useBottomSafePadding(16);

  let content = null;

  if (status === 'PENDING') {
    content = (
      <>
        <Pressable style={footerStyles.secondaryBtn} onPress={onDecline}>
          <Text style={footerStyles.dangerText}>Decline</Text>
        </Pressable>
        <Pressable style={footerStyles.primaryBtn} onPress={onAccept}>
          <Text style={footerStyles.primaryText}>Accept</Text>
        </Pressable>
      </>
    );
  } else if (status === 'ACCEPTED') {
    content = (
      <>
        <Pressable style={footerStyles.secondaryBtn} onPress={onMessage}>
          <Text style={footerStyles.secondaryText}>Message</Text>
        </Pressable>
        <Pressable style={footerStyles.primaryBtn} onPress={onStart}>
          <Text style={footerStyles.primaryText}>Start Collaboration</Text>
        </Pressable>
      </>
    );
  } else if (status === 'IN_PROGRESS' || status === 'REVISION_REQUESTED') {
    content = (
      <>
        <Pressable style={footerStyles.secondaryBtn} onPress={onMessage}>
          <Text style={footerStyles.secondaryText}>Message</Text>
        </Pressable>
        <Pressable style={footerStyles.primaryBtn} onPress={onSubmitContent}>
          <Text style={footerStyles.primaryText}>Submit Content</Text>
        </Pressable>
      </>
    );
  } else if (status === 'REEL_UPLOADED') {
    content = (
      <Pressable style={footerStyles.secondaryBtn} onPress={onViewContent}>
        <Text style={footerStyles.secondaryText}>View Submission</Text>
      </Pressable>
    );
  } else if (status === 'APPROVED' || status === 'COMPLETED') {
    content = (
      <>
        <Pressable style={footerStyles.secondaryBtn} onPress={onViewContent}>
          <Text style={footerStyles.secondaryText}>View Content</Text>
        </Pressable>
        <Pressable style={footerStyles.primaryBtn} onPress={onViewEarnings}>
          <Text style={footerStyles.primaryText}>View Earnings</Text>
        </Pressable>
      </>
    );
  }

  if (!content) return null;

  return (
    <View style={[footerStyles.container, { paddingBottom: padBottom }]}>
      {content}
    </View>
  );
}

const footerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 8,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: {
    color: COLORS.textPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  dangerText: {
    color: COLORS.danger,
    fontWeight: '600',
    fontSize: 15,
  },
});
