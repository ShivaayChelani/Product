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

/** After a reel is sent, treat ACCEPTED/IN_PROGRESS as waiting on vendor review. */
export function effectiveCollaborationStatus(status: string, hasSubmittedReel?: boolean): string {
  if (hasSubmittedReel && (status === 'ACCEPTED' || status === 'IN_PROGRESS')) {
    return 'REEL_UPLOADED';
  }
  return status;
}

export function CollaborationTimeline({ status }: CollaborationTimelineProps) {
  const stages = [
    { key: 'PENDING', label: 'Request Received' },
    { key: 'ACCEPTED', label: 'Accepted' },
    { key: 'IN_PROGRESS', label: 'Visit Business' },
    { key: 'REEL_UPLOADED', label: 'Content Submitted' },
    { key: 'APPROVED', label: 'Approval' },
  ];

  let currentIndex = stages.findIndex((s) => s.key === status);
  if (status === 'COMPLETED') {
    currentIndex = stages.length;
  } else if (currentIndex === -1) {
    if (status === 'REVISION_REQUESTED') currentIndex = 3;
    else if (status === 'REJECTED' || status === 'CANCELLED') currentIndex = 0;
    else currentIndex = 0;
  }

  return (
    <View style={timelineStyles.container}>
      <Text style={timelineStyles.title}>Timeline</Text>
      <View style={timelineStyles.timeline}>
        {stages.map((stage, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          
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
  hasSubmittedReel?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onStart?: () => void;
  onMessage?: () => void;
  onSubmitContent?: () => void;
  onViewContent?: () => void;
  onPublishReel?: () => void;
};

export function ContextAwareActionFooter({
  status,
  hasSubmittedReel,
  onAccept,
  onDecline,
  onStart,
  onMessage,
  onSubmitContent,
  onViewContent,
  onPublishReel,
}: ActionFooterProps) {
  const padBottom = useBottomSafePadding(16);
  const effective = effectiveCollaborationStatus(status, hasSubmittedReel);

  let content = null;

  if (effective === 'PENDING') {
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
  } else if (effective === 'ACCEPTED') {
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
  } else if (effective === 'REVISION_REQUESTED') {
    content = (
      <>
        <Pressable style={footerStyles.secondaryBtn} onPress={onMessage}>
          <Text style={footerStyles.secondaryText}>Message</Text>
        </Pressable>
        <Pressable style={footerStyles.primaryBtn} onPress={onSubmitContent}>
          <Text style={footerStyles.primaryText}>Edit & Resubmit</Text>
        </Pressable>
      </>
    );
  } else if (effective === 'IN_PROGRESS') {
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
  } else if (effective === 'REEL_UPLOADED') {
    content = (
      <>
        <Pressable style={footerStyles.secondaryBtn} onPress={onViewContent}>
          <Text style={footerStyles.secondaryText}>View Content</Text>
        </Pressable>
        <Pressable style={[footerStyles.primaryBtn, footerStyles.pendingBtn]} disabled>
          <Text style={footerStyles.primaryText}>Pending</Text>
        </Pressable>
      </>
    );
  } else if (effective === 'APPROVED') {
    content = (
      <>
        <Pressable style={footerStyles.secondaryBtn} onPress={onViewContent}>
          <Text style={footerStyles.secondaryText}>View Content</Text>
        </Pressable>
        <Pressable style={footerStyles.primaryBtn} onPress={onPublishReel}>
          <Text style={footerStyles.primaryText}>Publish Reel</Text>
        </Pressable>
      </>
    );
  } else if (effective === 'COMPLETED') {
    content = (
      <Pressable style={footerStyles.secondaryBtn} onPress={onViewContent}>
        <Text style={footerStyles.secondaryText}>View Content</Text>
      </Pressable>
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
  pendingBtn: {
    opacity: 0.72,
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
