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
exports.buildPlayableAds = buildPlayableAds;
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs-extra"));
// @ts-ignore - no published types for this package version in this project's setup
const html_minifier_1 = require("html-minifier");
const channels_1 = require("./channels");
const packager_1 = require("./packager");
const build_engine_1 = require("./build-engine");
function getExtensionVersion() {
    try {
        return require(path.join(__dirname, '..', 'package.json')).version || '1.0.0';
    }
    catch {
        return '1.0.0';
    }
}
async function readSourceFiles(webMobileDir) {
    const [htmlContent, styleContent, base122Decode, jszipMin, launcher, importMapContent] = await Promise.all([
        fs.readFile(path.join(webMobileDir, 'index.html'), 'utf-8'),
        fs.readFile(path.join(webMobileDir, 'style.css'), 'utf-8'),
        fs.readFile(path.join((0, build_engine_1.getPlayableEnginePath)(), 'base122-decode.min.js'), 'utf-8'),
        fs.readFile(path.join((0, build_engine_1.getPlayableEnginePath)(), 'jszip.min.js'), 'utf-8'),
        fs.readFile(path.join((0, build_engine_1.getPlayableEnginePath)(), 'launcher.js'), 'utf-8'),
        fs.readFile(path.join(webMobileDir, 'src', 'import-map.json'), 'utf-8').catch(() => ''),
    ]);
    return {
        htmlContent,
        styleContent,
        jszipContent: base122Decode + '\n' + jszipMin,
        launcherContent: launcher,
        importMapContent,
    };
}
/** Patch index.html Cocos 3.x (system.bundle.js/import-map.json) thành shell nhúng launcher, dùng chung cho mọi kênh */
function patchBaseHtml(src, cocosVersion, extVersion) {
    const launcherInit = `window.__BINGO_VERSION__="${extVersion}";window.__COCOS_VERSION__="${cocosVersion}";${src.launcherContent}`;
    return src.htmlContent
        .replace('<link rel="stylesheet" type="text/css" href="style.css"/>', () => `<style>${src.styleContent}</style>`)
        .replace('<link rel="icon" href="favicon.ico"/>', () => '')
        .replace('<script src="src/system.bundle.js" charset="utf-8"> </script>', () => '')
        .replace('<script src="src/import-map.json" type="systemjs-importmap" charset="utf-8"> </script>', () => src.importMapContent
        ? `<script type="systemjs-importmap">${src.importMapContent}</script>\n<script>${src.jszipContent}</script>`
        : `<script>${src.jszipContent}</script>`)
        .replace(`System.import('./index.js').catch(function(err) { console.error(err); })`, () => launcherInit);
}
async function buildChannelHtml(baseHtml, channel, product, zipJsContent) {
    let html = baseHtml;
    const apiText = (0, channels_1.getChannelApiText)(channel, product);
    if (apiText) {
        html = html.replace('</head>', () => `${apiText}</head>`);
    }
    if (channel === channels_1.CHANNEL.Facebook) {
        html = html.replace('<script src="src/polyfills.bundle.js" charset="utf-8"> </script>', () => '<script src="zip.js" type="text/javascript"></script>');
    }
    else {
        html = html.replace('<head>', () => '<head>\n<base href="https://localhost/">');
        html = html.replace('<script src="src/polyfills.bundle.js" charset="utf-8"> </script>', () => `<script>${zipJsContent}</script>`);
    }
    const specific = (0, channels_1.getChannelSpecificScript)(channel);
    if (specific.scriptContent) {
        html = html.replace(specific.replaceTarget, () => `${specific.scriptContent}\n${specific.replaceTarget}`);
    }
    return (0, html_minifier_1.minify)(html, { collapseWhitespace: true, removeComments: true, minifyJS: false, minifyCSS: true });
}
/**
 * Đóng gói playable ad cho toàn bộ kênh đã chọn, ngay trong build pipeline của Cocos Creator -
 * không cần mở PlayableBuilder rời nữa.
 * @param webMobileDir  Thư mục output "web-mobile" Cocos vừa build xong (result.dest)
 * @param cocosVersion  Phiên bản engine Cocos đang dùng (result.settings.CocosEngine)
 */
async function buildPlayableAds(webMobileDir, cocosVersion, options, onProgress) {
    if (options.channels.length === 0) {
        console.warn('[playable-ads-builder] Chưa chọn kênh nào, bỏ qua đóng gói playable ad.');
        return [];
    }
    (0, packager_1.resetProcessedFiles)();
    await fs.ensureDir(options.outputPath);
    const tempDir = path.join(os.tmpdir(), 'playable-ads-builder-workplace', String(Date.now()));
    await fs.ensureDir(tempDir);
    try {
        const source = await readSourceFiles(webMobileDir);
        const extVersion = getExtensionVersion();
        const baseHtml = patchBaseHtml(source, cocosVersion, extVersion);
        const collected = await (0, build_engine_1.collectWebMobileFiles)(webMobileDir, options.compression, options.audio, tempDir);
        onProgress?.('processFiles', 1, 1);
        await (0, build_engine_1.generateChannelZipJs)(collected, options.channels, options.product, tempDir, (current, total) => onProgress?.('generateZip', current, total));
        await (0, packager_1.ensureDirectoryExists)(options.outputPath);
        let done = 0;
        for (const channel of options.channels) {
            const zipJsContent = await fs.readFile(path.join(tempDir, `${channel}.zip.js`), 'utf-8');
            const html = await buildChannelHtml(baseHtml, channel, options.product, zipJsContent);
            const fileName = (0, packager_1.generateFileName)(`{channel}_${options.product.name}`, channel);
            await (0, packager_1.processChannelFiles)(channel, fileName, options.outputPath, html, zipJsContent, options.product);
            done++;
            onProgress?.('buildHtml', done, options.channels.length);
        }
        return (0, packager_1.getProcessedFiles)();
    }
    finally {
        await fs.remove(tempDir).catch(() => undefined);
    }
}
