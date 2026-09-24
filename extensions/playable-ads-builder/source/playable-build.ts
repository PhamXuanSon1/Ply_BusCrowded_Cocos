import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs-extra';
// @ts-ignore - no published types for this package version in this project's setup
import { minify } from 'html-minifier';
import { CHANNEL, IProductInfo, getChannelApiText, getChannelSpecificScript } from './channels';
import { generateFileName, processChannelFiles, resetProcessedFiles, getProcessedFiles, ensureDirectoryExists } from './packager';
import { collectWebMobileFiles, generateChannelZipJs, getPlayableEnginePath, ICompressionOptions, IAudioOptions } from './build-engine';

export interface IPlayableBuildOptions {
    product: IProductInfo;
    channels: CHANNEL[];
    outputPath: string;
    compression: ICompressionOptions;
    audio: IAudioOptions;
}

function getExtensionVersion(): string {
    try {
        return require(path.join(__dirname, '..', 'package.json')).version || '1.0.0';
    } catch {
        return '1.0.0';
    }
}

async function readSourceFiles(webMobileDir: string) {
    const [htmlContent, styleContent, base122Decode, jszipMin, launcher, importMapContent] = await Promise.all([
        fs.readFile(path.join(webMobileDir, 'index.html'), 'utf-8'),
        fs.readFile(path.join(webMobileDir, 'style.css'), 'utf-8'),
        fs.readFile(path.join(getPlayableEnginePath(), 'base122-decode.min.js'), 'utf-8'),
        fs.readFile(path.join(getPlayableEnginePath(), 'jszip.min.js'), 'utf-8'),
        fs.readFile(path.join(getPlayableEnginePath(), 'launcher.js'), 'utf-8'),
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
function patchBaseHtml(src: { htmlContent: string; styleContent: string; jszipContent: string; launcherContent: string; importMapContent: string }, cocosVersion: string, extVersion: string): string {
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

async function buildChannelHtml(baseHtml: string, channel: CHANNEL, product: IProductInfo, zipJsContent: string): Promise<string> {
    let html = baseHtml;
    const apiText = getChannelApiText(channel, product);
    if (apiText) {
        html = html.replace('</head>', () => `${apiText}</head>`);
    }
    if (channel === CHANNEL.Facebook) {
        html = html.replace('<script src="src/polyfills.bundle.js" charset="utf-8"> </script>', () => '<script src="zip.js" type="text/javascript"></script>');
    } else {
        html = html.replace('<head>', () => '<head>\n<base href="https://localhost/">');
        html = html.replace('<script src="src/polyfills.bundle.js" charset="utf-8"> </script>', () => `<script>${zipJsContent}</script>`);
    }
    const specific = getChannelSpecificScript(channel);
    if (specific.scriptContent) {
        html = html.replace(specific.replaceTarget, () => `${specific.scriptContent}\n${specific.replaceTarget}`);
    }
    return minify(html, { collapseWhitespace: true, removeComments: true, minifyJS: false, minifyCSS: true });
}

export type OnStageProgress = (stage: 'processFiles' | 'generateZip' | 'buildHtml', current: number, total: number) => void;

/**
 * Đóng gói playable ad cho toàn bộ kênh đã chọn, ngay trong build pipeline của Cocos Creator -
 * không cần mở PlayableBuilder rời nữa.
 * @param webMobileDir  Thư mục output "web-mobile" Cocos vừa build xong (result.dest)
 * @param cocosVersion  Phiên bản engine Cocos đang dùng (result.settings.CocosEngine)
 */
export async function buildPlayableAds(webMobileDir: string, cocosVersion: string, options: IPlayableBuildOptions, onProgress?: OnStageProgress): Promise<string[]> {
    if (options.channels.length === 0) {
        console.warn('[playable-ads-builder] Chưa chọn kênh nào, bỏ qua đóng gói playable ad.');
        return [];
    }
    resetProcessedFiles();
    await fs.ensureDir(options.outputPath);

    const tempDir = path.join(os.tmpdir(), 'playable-ads-builder-workplace', String(Date.now()));
    await fs.ensureDir(tempDir);

    try {
        const source = await readSourceFiles(webMobileDir);
        const extVersion = getExtensionVersion();
        const baseHtml = patchBaseHtml(source, cocosVersion, extVersion);

        const collected = await collectWebMobileFiles(webMobileDir, options.compression, options.audio, tempDir);
        onProgress?.('processFiles', 1, 1);

        await generateChannelZipJs(collected, options.channels, options.product, tempDir, (current, total) => onProgress?.('generateZip', current, total));

        await ensureDirectoryExists(options.outputPath);
        let done = 0;
        for (const channel of options.channels) {
            const zipJsContent = await fs.readFile(path.join(tempDir, `${channel}.zip.js`), 'utf-8');
            const html = await buildChannelHtml(baseHtml, channel, options.product, zipJsContent);
            const fileName = generateFileName(`{channel}_${options.product.name}`, channel);
            await processChannelFiles(channel, fileName, options.outputPath, html, zipJsContent, options.product);
            done++;
            onProgress?.('buildHtml', done, options.channels.length);
        }

        return getProcessedFiles();
    } finally {
        await fs.remove(tempDir).catch(() => undefined);
    }
}
