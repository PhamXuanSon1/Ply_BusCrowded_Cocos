"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onAfterBuild = exports.onError = exports.unload = exports.load = exports.throwError = void 0;
const path = __importStar(require("path"));
const global_1 = require("./global");
const channels_1 = require("./channels");
const playable_build_1 = require("./playable-build");
const packager_1 = require("./packager");
function log(...arg) {
    return console.log(`[${global_1.PACKAGE_NAME}]`, ...arg);
}
/** Mỗi kênh giờ là 1 field checkbox độc lập (packages.playable-ads-builder.channel_<Tên>) */
function resolveSelectedChannels(pkgOptions) {
    return channels_1.CHANNEL_SORTED.filter(channel => pkgOptions[(0, channels_1.channelFieldKey)(channel)] === true);
}
exports.throwError = true;
const load = async function () {
    log('load');
};
exports.load = load;
const unload = async function () {
    log('unload');
};
exports.unload = unload;
const onError = async function () {
    console.warn(`[${global_1.PACKAGE_NAME}] Build gặp lỗi, bỏ qua bước đóng gói playable ad.`);
};
exports.onError = onError;
/**
 * Sau khi Cocos build xong web-mobile, đóng gói playable ad cho tất cả kênh đã chọn -
 * không cần mở PlayableBuilder rời nữa.
 */
const onAfterBuild = async function (options, result) {
    const pkgOptions = options.packages[global_1.PACKAGE_NAME];
    if (!pkgOptions) {
        return;
    }
    // Dùng luôn trường "Name" gốc ở đầu panel Build (options.name) làm tên game,
    // không cần field riêng của plugin nữa.
    const gameName = (options.name || '').trim();
    if (!gameName) {
        console.warn(`[${global_1.PACKAGE_NAME}] Chưa đặt Name cho build task, bỏ qua đóng gói playable ad.`);
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
        : path.join(webMobileDir, '..', '..', (0, packager_1.sanitizeFolderName)(gameName));
    const cocosVersion = (result.settings && result.settings.CocosEngine) || 'unknown';
    log(`Bắt đầu đóng gói playable ad cho ${channels.length} kênh -> ${outputPath}`);
    try {
        const processed = await (0, playable_build_1.buildPlayableAds)(webMobileDir, cocosVersion, {
            product: {
                name: gameName,
                appleUrl: pkgOptions.appleUrl || '',
                googleUrl: pkgOptions.googleUrl || '',
            },
            channels,
            outputPath,
            compression: {
                type: (pkgOptions.compressionType || channels_1.CompressionType.Lossy),
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
    }
    catch (err) {
        console.error(`[${global_1.PACKAGE_NAME}] Đóng gói playable ad thất bại:`, err);
        throw err;
    }
};
exports.onAfterBuild = onAfterBuild;
