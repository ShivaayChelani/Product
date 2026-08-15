import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { ReelComment } from '../../types';
import { socialApi } from '../../services/api';
import { useBottomSafePadding } from '../../design/responsive';
import { useUserContext } from '../../context/UserContext';

interface ReelCommentsBottomSheetProps {
  reelId: string | null;
  visible: boolean;
  onClose: () => void;
  onCommentAdded?: (reelId: string, comment: ReelComment) => void;
}

export const ReelCommentsBottomSheet: React.FC<ReelCommentsBottomSheetProps> = ({
  reelId,
  visible,
  onClose,
  onCommentAdded,
}) => {
  const { user, isGuest, onLogout } = useUserContext();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const inputBottomPad = useBottomSafePadding(12);

  useEffect(() => {
    if (visible && reelId) {
      loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reelId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const response = await socialApi.getComments(reelId!);
      const items = Array.isArray(response?.data)
        ? response.data
        : Array.isArray((response as any)?.items)
          ? (response as any).items
          : [];
      setComments(items);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (isGuest || user?.uid === 'guest-user') {
      Alert.alert(
        'Sign In Required',
        'Please sign in to your account to post comments.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => {
              onClose();
              onLogout();
            },
          },
        ],
      );
      return;
    }
    if (!text.trim() || !reelId) return;
    const currentText = text.trim();
    setText('');

    const newComment: ReelComment = {
      id: `cmt_${Date.now()}`,
      reelId,
      userId: 'current-user',
      text: currentText,
      createdAt: new Date().toISOString(),
      user: { id: 'current-user', name: 'You' },
    };

    setComments(prev => [newComment, ...prev]);
    onCommentAdded?.(reelId, newComment);

    try {
      const res = await socialApi.addComment(reelId, currentText);
      if (res?.data?.id) {
        setComments(prev => prev.map(c => (c.id === newComment.id ? res.data : c)));
      }
    } catch {
      // Local comment persists for offline / sample creators
    }
  };

  const renderComment = ({ item }: { item: ReelComment }) => (
    <View style={styles.commentRow}>
      <View style={styles.avatarPlaceholder}>
        <Text style={styles.avatarText}>{item.user?.name?.charAt(0) || '?'}</Text>
      </View>
      <View style={styles.commentContent}>
        <Text style={styles.commentUser}>{item.user?.name || 'Unknown'}</Text>
        <Text style={styles.commentText}>{item.text}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        style={styles.overlay} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Comments</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={comments}
            renderItem={renderComment}
            keyExtractor={(item, index) => item.id || `comment-${index}`}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={() => (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {loading ? 'Loading comments...' : 'No comments yet. Be the first!'}
                </Text>
              </View>
            )}
          />

          <View style={[styles.inputContainer, { paddingBottom: inputBottomPad }]}>
            <TextInput
              style={styles.input}
              placeholder="Add a comment..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={200}
            />
            <TouchableOpacity 
              style={[styles.postBtn, !text.trim() && { opacity: 0.5 }]} 
              onPress={handlePost}
              disabled={!text.trim()}
            >
              <Text style={styles.postText}>Post</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '60%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  commentRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#008B8B',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  commentContent: {
    flex: 1,
  },
  commentUser: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  commentText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    color: '#fff',
    minHeight: 40,
    maxHeight: 100,
  },
  postBtn: {
    padding: 12,
    marginLeft: 8,
  },
  postText: {
    color: '#008B8B',
    fontWeight: '700',
    fontSize: 15,
  }
});
