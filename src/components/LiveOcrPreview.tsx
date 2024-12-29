import React from 'react';
import { StyleSheet, NativeSyntheticEvent } from 'react-native';
import NativeLiveOcrPreview, {
    NativeLiveOcrPreviewProps,
    OcrResultEvent,
    OcrErrorEvent
} from '../native/LiveOcrPreview';

export interface LiveOcrPreviewProps extends Omit<NativeLiveOcrPreviewProps, 'onOcrResult' | 'onOcrError'> {
    onOcrResult?: (text: string) => void;
    onOcrError?: (error: string) => void;
}

export const LiveOcrPreview: React.FC<LiveOcrPreviewProps> = ({
    onOcrResult,
    onOcrError,
    style,
    ...rest
}) => {
    const handleOcrResult = React.useCallback(
        (event: NativeSyntheticEvent<OcrResultEvent>) => {
            onOcrResult?.(event.nativeEvent.text);
        },
        [onOcrResult]
    );

    const handleOcrError = React.useCallback(
        (event: NativeSyntheticEvent<OcrErrorEvent>) => {
            onOcrError?.(event.nativeEvent.error);
        },
        [onOcrError]
    );

    return (
        <NativeLiveOcrPreview
            style={[styles.preview, style]}
            onOcrResult={handleOcrResult}
            onOcrError={handleOcrError}
            {...rest}
        />
    );
};

const styles = StyleSheet.create({
    preview: {
        width: '100%',
        height: '100%',
    },
}); 