import { BuildPlugin } from '../@types';
import { PACKAGE_NAME } from './global';
import { CHANNEL_OPTION_FIELDS } from './channels';

export const load: BuildPlugin.load = function() {
    console.debug(`${PACKAGE_NAME} load`);
};
export const unload: BuildPlugin.load = function() {
    console.debug(`${PACKAGE_NAME} unload`);
};

export const configs: BuildPlugin.Configs = {
    'web-mobile': {
        hooks: './hooks',
        doc: 'https://github.com/',
        // appleUrl / googleUrl / compressionType / compressionQuality / audioCompressionEnabled / audioBitrate /
        // channel checkboxes được VẼ (nút "Open" cho 2 link, ẩn/hiện field theo điều kiện, channels xuống cuối
        // cùng) trong ./panel, nhưng vẫn khai báo ở "options" bên dưới (chỉ default, KHÔNG có "render") để
        // Editor coi là dữ liệu hợp lệ của build task -> khởi tạo & lưu/cache đúng giữa các lần mở lại Build
        // panel. Thử "hidden:true" trước đó không ăn (vẫn hiện control tự sinh -> bị trùng với panel.ts), nên
        // bỏ hẳn "render" - không có render.ui thì không có gì để Editor tự vẽ control.
        panel: './panel',
        options: {
            outputPath: {
                label: `i18n:${PACKAGE_NAME}.options.outputPath`,
                description: `i18n:${PACKAGE_NAME}.options.outputPathTip`,
                default: '',
                render: {
                    ui: 'ui-input',
                    attributes: {
                        placeholder: `i18n:${PACKAGE_NAME}.options.outputPathPlaceholder`,
                    },
                },
            },
            appleUrl: { default: '' },
            googleUrl: { default: '' },
            compressionType: { default: 'lossy' },
            compressionQuality: { default: 80 },
            audioCompressionEnabled: { default: true },
            audioBitrate: { default: 64 },
            ...CHANNEL_OPTION_FIELDS,
        },
    },
};
