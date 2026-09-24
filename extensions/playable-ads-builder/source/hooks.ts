import * as path from 'path';
import { BuildHook, IBuildResult, ITaskOptions } from '../@types';
import { PACKAGE_NAME } from './global';
import { CHANNEL_SORTED, channelFieldKey, CompressionType } from './channels';
import { buildPlayableAds } from './playable-build';
import { sanitizeFolderName } from './packager';

function log(...arg: any[]) {
    return console.log(`[${PACKAGE_NAME}]`, ...arg);
}

/** Mỗi kênh giờ là 1 field checkbox độc lập (packages.playable-ads-builder.channel_<Tên>) */
function resolveSelectedChannels(pkgOptions: any) {
    return CHANNEL_SORTED.filter(channel => pkgOptions[channelFieldKey(channel)] === true);
}

export const throwError: BuildHook.throwError = true;

export const load: BuildHook.load = async function() {
    log('load');
};

export const unload: BuildHook.unload = async function() {
    log('unload');
};

export const onError: BuildHook.onError = async function() {
    console.warn(`[${PACKAGE_NAME}] Build gặp lỗi, bỏ qua bước đóng gói playable ad.`);
};

/**
 * Sau khi Cocos build xong web-mobile, đóng gói playable ad cho tất cả kênh đã chọn -
 * không cần mở PlayableBuilder rời nữa.
 */
export const onAfterBuild: BuildHook.onAfterBuild = async function(options: ITaskOptions, result: IBuildResult) {
    const pkgOptions = options.packages[PACKAGE_NAME];
    if (!pkgOptions) {
        return;
    }
    // Dùng luôn trường "Name" gốc ở đầu panel Build (options.name) làm tên game,
    // không cần field riêng của plugin nữa.
    const gameName = (options.name || '').trim();
    if (!gameName) {
        console.warn(`[${PACKAGE_NAME}] Chưa đặt Name cho build task, bỏ qua đóng gói playable ad.`);
        return;
    }
    const channels = resolveSelectedChannels(pkgOptions);
    if (channels.length === 0) {
        log('Chưa tick kênh quảng cáo nào trong panel Build, bỏ qua đóng gói playable ad.');
        return;
    }

    const webMobileDir = result.dest;
    // Mặc định: <cấp cha của ./build>/<game_name>, tức cùng cấp với thư mục ./build
    // (build = cha của web-mobile -> webMobileDir/../.. = cấp cha của ./build).
    const outputPath = pkgOptions.outputPath && pkgOptions.outputPath.trim()
        ? pkgOptions.outputPath.trim()
        : path.join(webMobileDir, '..', '..', sanitizeFolderName(gameName));
    const cocosVersion = (result.settings && (result.settings as any).CocosEngine) || 'unknown';

    log(`Bắt đầu đóng gói playable ad cho ${channels.length} kênh -> ${outputPath}`);

    try {
        const processed = await buildPlayableAds(webMobileDir, cocosVersion, {
            product: {
                name: gameName,
                appleUrl: pkgOptions.appleUrl || '',
                googleUrl: pkgOptions.googleUrl || '',
            },
            channels,
            outputPath,
            compression: {
                type: (pkgOptions.compressionType || CompressionType.Lossy) as CompressionType,
                quality: typeof pkgOptions.compressionQuality === 'number' ? pkgOptions.compressionQuality : 80,
            },
            audio: {
                enabled: pkgOptions.audioCompressionEnabled !== false,
                bitrate: typeof pkgOptions.audioBitrate === 'number' ? pkgOptions.audioBitrate : 64,
            },
        }, (stage, current, total) => {
            log(`[${stage}] ${current}/${total}`);
        });

        log(`Đóng gói playable ad hoàn tất (${processed.length} file):`);
        processed.forEach(f => log(`  - ${f}`));
    } catch (err) {
        console.error(`[${PACKAGE_NAME}] Đóng gói playable ad thất bại:`, err);
        throw err;
    }
};
