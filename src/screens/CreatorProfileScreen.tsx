import React from 'react';
import ViewCreatorProfileScreen from '../features/travelSocial/screens/ViewCreatorProfileScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomSafePadding } from '../design/responsive';
import { View } from 'react-native';

interface CreatorProfileScreenProps {
  username: string;
  onBack?: () => void;
}

export default function CreatorProfileScreen(props: CreatorProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const contentPadBottom = useBottomSafePadding(24);
  return (
    <View style={{ flex: 1, paddingTop: Math.max(insets.top, 16), paddingBottom: contentPadBottom }}>
      <ViewCreatorProfileScreen {...props} />
    </View>
  );
}
