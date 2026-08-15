import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Image, ActivityIndicator } from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { isStaticImageUrl } from '../../services/reels/reelMediaKind';

interface ReelPlayerProps {
  videoUrl: string;
  posterUrl?: string | null;
  isActive: boolean;
  isPausedOverride?: boolean;
  muted?: boolean;
  onDoubleTap?: () => void;
  onLongPress?: () => void;
  onProgress?: (progress: number) => void;
}

export const ReelPlayer: React.FC<ReelPlayerProps> = React.memo(({
  videoUrl,
  posterUrl,
  isActive,
  isPausedOverride = false,
  muted = false,
  onDoubleTap,
  onLongPress,
  onProgress,
}) => {
  const resolvedInitial = useMemo(() => {
    if (!videoUrl || typeof videoUrl !== 'string') return '';
    const trimmed = videoUrl.trim();
    if (
      trimmed.startsWith('http://') || 
      trimmed.startsWith('https://') || 
      trimmed.startsWith('file://') || 
      trimmed.startsWith('content://') ||
      trimmed.startsWith('/')
    ) {
      return trimmed;
    }
    return trimmed; // allow any valid string, let react-native-video handle the rest
  }, [videoUrl]);

  const [isPlaying, setIsPlaying] = useState(isActive);
  const [isBuffering, setIsBuffering] = useState(!!resolvedInitial);
  const [isError, setIsError] = useState(!resolvedInitial);

  const playIconOpacity = useRef(new Animated.Value(0)).current;
  const videoRef = useRef<VideoRef>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    setIsError(!resolvedInitial);
    setIsBuffering(!!resolvedInitial);
  }, [resolvedInitial]);

  useEffect(() => {
    setIsPlaying(!!isActive);
  }, [isActive]);

  const flashPauseIcon = () => {
    Animated.sequence([
      Animated.timing(playIconOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(playIconOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const togglePlayPause = () => {
    if (!isActive || isError) return;
    setIsPlaying(prev => {
      if (prev) flashPauseIcon();
      return !prev;
    });
  };

  const handleTap = () => {
    if (!isActive || isError) return;

    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTapRef.current = 0;
      onDoubleTap?.();
      return;
    }

    lastTapRef.current = now;
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      togglePlayPause();
    }, 280);
  };

  useEffect(() => () => {
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handlePressIn = () => {
    longPressTimer.current = setTimeout(() => {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      onLongPress?.();
    }, 400);
  };

  const handlePressOut = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const actuallyPaused = !isActive || !isPlaying || isPausedOverride || isError;
  const isImageReel = isStaticImageUrl(resolvedInitial);
  const showVideo = !!resolvedInitial && !isError && !isImageReel;
  const showImage = !!resolvedInitial && isImageReel;

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={styles.container}
      onPress={handleTap}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={!showVideo && !showImage && !posterUrl}
    >
      {posterUrl ? (
        <Image source={{ uri: posterUrl }} style={styles.poster} resizeMode="cover" />
      ) : null}

      {showImage ? (
        <Image source={{ uri: resolvedInitial }} style={styles.video} resizeMode="cover" />
      ) : showVideo ? (
        <View style={styles.video} pointerEvents="none">
          <Video
          ref={videoRef}
          source={{ uri: resolvedInitial }}
          style={styles.video}
          resizeMode="cover"
          repeat
          paused={actuallyPaused}
          muted={muted}
          poster={posterUrl || undefined}
          posterResizeMode="cover"
          playInBackground={false}
          playWhenInactive={false}
          ignoreSilentSwitch="ignore"
          onLoadStart={() => setIsBuffering(true)}
          onLoad={() => setIsBuffering(false)}
          onReadyForDisplay={() => setIsBuffering(false)}
          onBuffer={({ isBuffering: buffering }) => setIsBuffering(!!buffering)}
          onProgress={({ currentTime, seekableDuration }) => {
            if (isActive && seekableDuration > 0) {
              onProgress?.(currentTime / seekableDuration);
            }
          }}
          progressUpdateInterval={250}
          onError={() => {
            setIsError(true);
            setIsBuffering(false);
          }}
          bufferConfig={{
            minBufferMs: 2500,
            maxBufferMs: 10000,
            bufferForPlaybackMs: 1000,
            bufferForPlaybackAfterRebufferMs: 1500,
          }}
        />
        </View>
      ) : (
        <View style={styles.errorContainer}>
          <Ionicons name="videocam-off-outline" size={48} color="rgba(255,255,255,0.5)" />
          <Text style={{ color: 'red', fontSize: 10, marginTop: 10, paddingHorizontal: 20, textAlign: 'center' }}>
            {resolvedInitial}
          </Text>
        </View>
      )}

      {isActive && isBuffering && showVideo ? (
        <View style={styles.bufferOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : null}

      <View style={styles.overlayCenter} pointerEvents="none">
        <Animated.View
          style={{
            opacity: playIconOpacity,
            transform: [{
              scale: playIconOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.5],
              }),
            }],
          }}
        >
          <Ionicons name="play" size={64} color="rgba(255,255,255,0.7)" />
        </Animated.View>
      </View>

      {!isPlaying && isActive && showVideo ? (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.8)" />
        </View>
      ) : null}

      {muted && isActive ? (
        <View style={styles.muteBadge} pointerEvents="none">
          <Ionicons name="volume-mute" size={18} color="#fff" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  poster: {
    ...StyleSheet.absoluteFillObject,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 3,
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  muteBadge: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 10,
    borderRadius: 24,
    zIndex: 4,
  },
});
