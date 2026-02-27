import React from 'react';
import { StyleProp, ViewStyle, requireNativeComponent } from 'react-native';
import type { HostComponent } from 'react-native';

interface NativeLiveOcrPreviewProps {
    style?: StyleProp<ViewStyle>;
    isActive: boolean;
}

interface LiveOcrPreviewProps extends NativeLiveOcrPreviewProps {}

const NativeLiveOcrPreview: HostComponent<NativeLiveOcrPreviewProps> = requireNativeComponent('LiveOcrPreview');

const LiveOcrPreviewWithOverlay: React.FC<LiveOcrPreviewProps> = (props) => {
    return <NativeLiveOcrPreview style={props.style} isActive={props.isActive} />;
};

export default LiveOcrPreviewWithOverlay;
