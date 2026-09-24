export * from '@cocos/creator-types/editor/packages/builder/@types/public';

import { IBuildTaskOption, IPanelThis } from '@cocos/creator-types/editor/packages/builder/@types/public';

const PACKAGE_NAME = 'playable-ads-builder';

export interface IOptions {
    appleUrl: string;
    googleUrl: string;
    outputPath: string;
    compressionType: string;
    compressionQuality: number;
    audioCompressionEnabled: boolean;
    audioBitrate: number;
    /** Mỗi kênh 1 field checkbox riêng: channel_<TênKênh> (xem channelFieldKey trong ./source/channels.ts) */
    [channelFieldKey: string]: any;
}

export interface ITaskOptions extends IBuildTaskOption {
    packages: {
        [PACKAGE_NAME]: IOptions;
    };
}

export interface ICustomPanelThis extends IPanelThis {
    options: IOptions;
    $: {
        root: HTMLElement;
        appleUrlInput: Editor.UI.HTMLCustomElement<any>;
        appleUrlOpenBtn: Editor.UI.HTMLCustomElement<any>;
        googleUrlInput: Editor.UI.HTMLCustomElement<any>;
        googleUrlOpenBtn: Editor.UI.HTMLCustomElement<any>;
        compressionType: Editor.UI.HTMLCustomElement<any>;
        compressionQualityProp: HTMLElement;
        compressionQuality: Editor.UI.HTMLCustomElement<any>;
        audioCompressionEnabled: Editor.UI.HTMLCustomElement<any>;
        audioBitrateProp: HTMLElement;
        audioBitrate: Editor.UI.HTMLCustomElement<any>;
        channelsSection: HTMLElement;
        selectedChannelsValue: HTMLElement;
    };
}
