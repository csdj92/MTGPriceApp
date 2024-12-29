import { StyleProp, ViewStyle, requireNativeComponent } from 'react-native';
import type { HostComponent } from 'react-native';

interface LiveOcrPreviewProps {
    style?: StyleProp<ViewStyle>;
    isActive: boolean;
}

const LiveOcrPreview = requireNativeComponent<LiveOcrPreviewProps>('LiveOcrPreview');

export default LiveOcrPreview as HostComponent<LiveOcrPreviewProps>;

