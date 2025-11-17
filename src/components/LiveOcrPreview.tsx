import React from 'react';
import { StyleProp, ViewStyle, requireNativeComponent, View, StyleSheet } from 'react-native';
import type { HostComponent } from 'react-native';

interface NativeLiveOcrPreviewProps {
    style?: StyleProp<ViewStyle>;
    isActive: boolean;
}

interface LiveOcrPreviewProps extends NativeLiveOcrPreviewProps {}

const NativeLiveOcrPreview: HostComponent<NativeLiveOcrPreviewProps> = requireNativeComponent('LiveOcrPreview');

const LiveOcrPreviewWithOverlay: React.FC<LiveOcrPreviewProps> = (props) => {
    return (
        <View style={styles.container}>
            <NativeLiveOcrPreview 
                style={[props.style, styles.preview]} 
                isActive={props.isActive}
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
        left: '5%',    // Reduced left margin for wider overlay
        top: '10%',    // Move overlay closer to the top to maximize vertical space
        width: '90%',  // Increase width for fuller card capture
        height: '60%', // Increase height so entire card fits inside the overlay
        borderWidth: 2,
        borderColor: '#FFD700',  // More subtle gold color
        borderRadius: 8,         // Rounded corners
        backgroundColor: 'rgba(255, 215, 0, 0.05)',  // Subtle gold tint
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

