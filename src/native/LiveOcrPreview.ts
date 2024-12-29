import type { ViewProps } from 'react-native';
import type { DirectEventHandler } from 'react-native/Libraries/Types/CodegenTypes';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import type { HostComponent } from 'react-native';

export interface OcrResultEvent {
    text: string;
}

export interface OcrErrorEvent {
    error: string;
}

export interface NativeLiveOcrPreviewProps extends ViewProps {
    isActive?: boolean;
    onOcrResult?: DirectEventHandler<OcrResultEvent>;
    onOcrError?: DirectEventHandler<OcrErrorEvent>;
}

export default codegenNativeComponent<NativeLiveOcrPreviewProps>(
    'LiveOcrPreview'
) as HostComponent<NativeLiveOcrPreviewProps>; 