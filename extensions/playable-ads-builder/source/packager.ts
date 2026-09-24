import * as path from 'path';
import * as fs from 'fs-extra';
// @ts-ignore - no bundled types published under this import path in this project's node_modules layout
import AdmZip = require('adm-zip');
import { CHANNEL, CHANNELS_REQUIRING_ZIP, IProductInfo } from './channels';

let processedFiles: string[] = [];

export function resetProcessedFiles() {
    processedFiles = [];
}

export function getProcessedFiles() {
    return processedFiles;
}

export async function ensureDirectoryExists(dir: string) {
    try {
        if (!(await fs.pathExists(dir))) {
            await fs.mkdir(dir);
        }
    } catch (err) {
        console.error(`Lỗi khi tạo thư mục ${dir}:`, err);
        throw err;
    }
}

export function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '');
}

/** Loại ký tự không hợp lệ trong tên thư mục Windows/macOS, dùng khi lấy tên game làm output folder mặc định */
export function sanitizeFolderName(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_');
}

const FILENAME_CHANNEL_PLACEHOLDERS = ['{渠道}', '{channel}', '{kênh}'];

/** filename = "{channel}_TênGame" -> "AppLovin_TênGame.html" */
export function generateFileName(filenameTemplate: string, channel: CHANNEL): string {
    let name = filenameTemplate;
    FILENAME_CHANNEL_PLACEHOLDERS.forEach(p => {
        name = name.replace(p, channel);
    });
    name = name.replace('渠道', channel);
    if (channel === CHANNEL.Mintegral) {
        name = sanitizeFileName(name);
    }
    return name + '.html';
}

async function recordProcessedFile(filePath: string, size: number) {
    const mb = (size / 1048576).toFixed(1);
    console.log(`[playable-ads-builder] ${path.basename(filePath)} đã xử lý xong.`);
    processedFiles.push(`${filePath} ${mb}MB`);
}

async function zipFolder(dir: string, zip: AdmZip) {
    const entries = await fs.readdir(dir);
    await Promise.all(entries.map(async entry => {
        const full = path.join(dir, entry);
        if ((await fs.stat(full)).isDirectory()) {
            zip.addLocalFolder(full);
            await zipFolder(full, zip);
        } else {
            zip.addLocalFile(full);
        }
    }));
}

/**
 * Ghi các file phụ theo yêu cầu riêng của từng kênh (config.json/luna.json/...) vào thư mục `dir`
 * trước khi nén thành zip. `htmlContent` = html đã patch, `zipJsContent` = nội dung {channel}.zip.js,
 * `product` = thông tin game (dùng cho luna.json của UnityPlayworks).
 */
async function writeChannelSpecificFiles(channel: CHANNEL, dir: string, htmlContent: string, zipJsContent: string, product: IProductInfo) {
    const htmlFileName = path.basename(dir) + '.html';
    switch (channel) {
        case CHANNEL.UnityPlayworks: {
            const withStartGame = (html: string) => {
                const script = '<script> !function(){var i=window.__launcher;if(i&&"function"==typeof i.initialize){var n=i.initialize.bind(i),a=!1;window.startGame=function(){a||(a=!0,n())},i.initialize=function(){"Luna"in window||window.startGame()}}else console.error("[PlayableSDK:UnityPlayworks:startGame] window.__launcher not in the expected shape; aborting.")}(); </script>';
                return html.includes('</body>') ? html.replace('</body>', () => `${script}</body>`) : `${html}${script}`;
            };
            await fs.writeFile(path.join(dir, 'source.html'), withStartGame(htmlContent), 'utf-8');
            const displayName = product.name || 'Playable';
            await fs.writeFile(path.join(dir, 'luna.json'), JSON.stringify({
                unity: {
                    packages: {
                        default: {
                            applicationName: displayName,
                            iosLink: product.appleUrl || '',
                            androidLink: product.googleUrl || '',
                            orientation: 'unspecified',
                            supportedLanguages: ['en'],
                        },
                        ironsource: { appID: '', assetID: '', applicationGenre: '', versionName: '', apiType: 0, playableMode: 0, packageType: 0 },
                        facebook: { assetID: '', packageType: 0 },
                        tiktok: { orientation: 0 },
                    },
                },
            }, null, 4), 'utf-8');
            await fs.writeFile(path.join(dir, 'playground.json'), JSON.stringify({
                title: displayName, icon: null, fields: {}, assets: {}, sections: [],
            }, null, 4), 'utf-8');
            break;
        }
        case CHANNEL.Mintegral:
            await fs.writeFile(path.join(dir, htmlFileName), htmlContent, 'utf-8');
            break;
        case CHANNEL.Facebook:
            await fs.writeFile(path.join(dir, 'zip.js'), zipJsContent, 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case CHANNEL.Google:
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case CHANNEL.TikTok:
        case CHANNEL.OceanEngine:
        case CHANNEL.Pangle:
            await fs.writeFile(path.join(dir, 'config.json'), '{ "playable_orientation": 0 }', 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case CHANNEL.Kuaishou:
        case CHANNEL.Kwai:
            await fs.writeFile(path.join(dir, 'config.json'), JSON.stringify({
                name: 'playable', version: '0.0.1', config: { playable_orientation: 0 },
            }, null, 2), 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case CHANNEL.Tencent:
            await fs.writeFile(path.join(dir, 'config.json'), '{"name":"Playable","version":"0.0.1","config":{"play_direction":0}}', 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case CHANNEL.BIGO:
            await fs.writeFile(path.join(dir, 'config.json'), '{ "orientation": 0 }', 'utf-8');
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        case CHANNEL.Vungle:
        case CHANNEL.Liftoff:
        case CHANNEL.MyTarget:
            await fs.writeFile(path.join(dir, 'index.html'), htmlContent, 'utf-8');
            break;
        default:
            return;
    }
}

/**
 * Ghi output cuối cùng cho 1 kênh: kênh cần zip -> tạo thư mục tạm, ghi các file phụ, nén .zip;
 * kênh không cần zip -> ghi thẳng file .html vào outputPath.
 */
export async function processChannelFiles(channel: CHANNEL, fileName: string, outputPath: string, htmlContent: string, zipJsContent: string, product: IProductInfo) {
    try {
        if (CHANNELS_REQUIRING_ZIP.includes(channel)) {
            const baseName = fileName.replace('.html', '');
            const workDir = path.join(outputPath, baseName);
            await ensureDirectoryExists(workDir);
            await writeChannelSpecificFiles(channel, workDir, htmlContent, zipJsContent, product);
            const zip = new AdmZip();
            await zipFolder(workDir, zip);
            const zipPath = workDir + '.zip';
            zip.writeZip(zipPath);
            await fs.remove(workDir);
            const stat = await fs.stat(zipPath);
            await recordProcessedFile(zipPath, stat.size);
        } else {
            const outFile = path.join(outputPath, fileName);
            await fs.writeFile(outFile, htmlContent, 'utf-8');
            const stat = await fs.stat(outFile);
            await recordProcessedFile(outFile, stat.size);
        }
    } catch (err) {
        console.error('[playable-ads-builder] Xử lý kênh thất bại:', err);
        throw err;
    }
}
