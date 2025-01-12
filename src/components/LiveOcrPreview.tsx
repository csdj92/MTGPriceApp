import React from 'react';
import { StyleProp, ViewStyle, requireNativeComponent, View, StyleSheet } from 'react-native';
import type { HostComponent } from 'react-native';

interface LiveOcrPreviewProps {
    style?: StyleProp<ViewStyle>;
    isActive: boolean;
}

const LiveOcrPreview = requireNativeComponent<LiveOcrPreviewProps>('LiveOcrPreview');

const LiveOcrPreviewWithOverlay: React.FC<LiveOcrPreviewProps> = (props) => {
    return (
        <View style={styles.container}>
            <LiveOcrPreview style={[props.style, styles.preview]} isActive={props.isActive} />
            <View style={styles.overlay} />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    preview: {
        ...StyleSheet.absoluteFillObject,
    },
    overlay: {
        position: 'absolute',
        left: '10%',    // Corresponds to AOI_LEFT_PERCENT
        top: '20%',     // Updated to move the overlay higher
        width: '80%',    // Corresponds to AOI_WIDTH_PERCENT
        height: '40%',   // Corresponds to AOI_HEIGHT_PERCENT
        borderWidth: 2,
        borderColor: 'yellow',
        backgroundColor: 'rgba(255, 255, 0, 0.1)',
    },
});

export default LiveOcrPreviewWithOverlay;

