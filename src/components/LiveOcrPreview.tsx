import React from 'react';
import { StyleProp, ViewStyle, requireNativeComponent, View, StyleSheet } from 'react-native';
import type { HostComponent } from 'react-native';

interface NativeLiveOcrPreviewProps {
    style?: StyleProp<ViewStyle>;
    isActive: boolean;
    type?: 'ocr' | 'classifier';  // Add type prop to specify which preview to use
}

interface LiveOcrPreviewProps extends NativeLiveOcrPreviewProps {}

const NativeLiveOcrPreview: HostComponent<NativeLiveOcrPreviewProps> = requireNativeComponent('LiveOcrPreview');

const LiveOcrPreviewWithOverlay: React.FC<LiveOcrPreviewProps> = (props) => {
    return (
        <View style={styles.container}>
            <NativeLiveOcrPreview 
                style={[props.style, styles.preview]} 
                isActive={props.isActive}
                type={props.type || 'ocr'}  // Default to 'ocr' if not specified
            />
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
        borderColor: '#FFD700',  // More subtle gold color
        borderRadius: 8,         // Rounded corners
        backgroundColor: 'rgba(255, 215, 0, 0.05)',  // More subtle gold tint
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
});

export default LiveOcrPreviewWithOverlay;

