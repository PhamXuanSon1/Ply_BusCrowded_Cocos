import * as path from 'path';
import * as fs from 'fs-extra';
import { spawn } from 'child_process';
// @ts-ignore
import AdmZip = require('adm-zip');
import { CHANNEL, CHANNELS_REQUIRING_ZIP, CompressionType, IProductInfo } from './channels';

export const FILE_EXTENSIONS = {
    // .html/.css được đọc & patch riêng (không đóng vào zip asset)
    EXCLUDE: ['.html', '.css'],
    IMAGE: ['.png', '.jpg', '.jpeg'],
    AUDIO: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'],
};

export interface ICompressionOptions {
    type: CompressionType;
    quality: number;
}

export interface IAudioOptions {
    enabled: boolean;
    bitrate: number;
}

interface ICollectedFile {
    path: string;
    data: Buffer;
}

/**
 * Console riêng của Cocos Creator (asset-db/builder worker) không hiện được object Error truyền
 * làm tham số phụ cho console.warn/error (chỉ hiện đúng chuỗi message đầu tiên) -> luôn nhét
 * message + stack thẳng vào 1 chuỗi duy nhất để chắc chắn thấy được lỗi thật.
 */
function errorDetail(err: any): string {
    if (err instanceof Error) {
        return `${err.message}\n${err.stack || ''}`;
    }
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

/**
 * Ảnh nén bằng "sharp" NHƯNG chạy trong 1 TIẾN TRÌNH CON riêng (./compress-worker.js), không nén
 * trực tiếp trong tiến trình hook build.
 *
 * Lý do: hook build của Cocos Creator luôn chạy trong 1 renderer process của Electron (xác nhận
 * qua stack trace thật đi qua node:electron/js2c/renderer_init). "sharp" (native .node addon, phụ
 * thuộc libvips-42.dll) load lỗi ERR_DLOPEN_FAILED ngay trong đúng tiến trình đó - libvips-42.dll
 * xung đột phiên bản với các DLL Chromium/Electron đã nạp sẵn trong renderer. Lỗi này bắt được bằng
 * try/catch bình thường (không phải crash cứng), nhưng vẫn khiến nén ảnh không chạy được tại chỗ.
 * Giải pháp: spawn ra 1 tiến trình con hoàn toàn tách biệt (dùng chính process.execPath =
 * CocosCreator.exe kèm biến môi trường ELECTRON_RUN_AS_NODE=1 để nó tự chạy như Node thuần, không
 * cần cài Node riêng trên máy - đã test thực tế cách này chạy "sharp" bình thường, không lỗi DLL).
 * Hook chỉ gửi danh sách đường dẫn ảnh cần nén cho tiến trình con qua 1 file JSON, đợi nó nén xong
 * rồi đọc lại kết quả từ đĩa.
 */
interface IPendingImage {
    id: number;
    full: string;
}

interface IBatchCompressResultEntry {
    compressed: boolean;
    originalSize?: number;
    compressedSize?: number;
    error?: string;
}

async function compressImagesBatch(
    images: IPendingImage[],
    compression: ICompressionOptions,
    tempDir: string,
): Promise<Map<number, Buffer>> {
    const compressedById = new Map<number, Buffer>();
    if (images.length === 0) {
        return compressedById;
    }

    const jobDir = path.join(tempDir, `_imgCompress_${Date.now()}_${Math.round(Math.random() * 1e6)}`);
    await fs.ensureDir(jobDir);
    const jobFile = path.join(jobDir, 'job.json');
    const resultFile = path.join(jobDir, 'result.json');
    const workerScript = path.join(__dirname, 'compress-worker.js');

    try {
        await fs.writeJson(jobFile, {
            compression,
            outDir: jobDir,
            images: images.map(img => ({ id: img.id, input: img.full })),
        });

        await new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, [workerScript, jobFile, resultFile], {
                env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
                windowsHide: true,
            });
            let stderr = '';
            child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
            child.on('error', reject);
            child.on('exit', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Tiến trình con nén ảnh thoát với mã lỗi ${code}.${stderr ? `\n${stderr}` : ''}`));
                }
            });
        });

        const results: Record<number, IBatchCompressResultEntry> = await fs.readJson(resultFile);
        for (const img of images) {
            const entry = results[img.id];
            if (!entry) {
                continue;
            }
            if (entry.error) {
                console.warn(`[playable-ads-builder] Nén ảnh thất bại, dùng ảnh gốc: ${img.full}. Chi tiết lỗi: ${entry.error}`);
                continue;
            }
            if (entry.compressed) {
                const outFile = path.join(jobDir, `${img.id}.webp`);
                compressedById.set(img.id, await fs.readFile(outFile));
                console.log(`[playable-ads-builder] Nén ảnh ${path.basename(img.full)}: ${entry.originalSize} -> ${entry.compressedSize} byte`);
            } else {
                console.log(`[playable-ads-builder] Nén ảnh ${path.basename(img.full)}: không nhỏ hơn bản gốc, giữ nguyên.`);
            }
        }
    } catch (err) {
        console.warn(`[playable-ads-builder] Nén ảnh (tiến trình con) thất bại, toàn bộ ảnh sẽ giữ nguyên không nén. Chi tiết lỗi: ${errorDetail(err)}`);
    } finally {
        await fs.remove(jobDir).catch(() => undefined);
    }

    return compressedById;
}

let ffmpegLib: any = null;
try {
    ffmpegLib = require('fluent-ffmpeg');
    const ffmpegStaticPath = require('ffmpeg-static');
    if (ffmpegStaticPath) {
        ffmpegLib.setFfmpegPath(ffmpegStaticPath);
    }
} catch (err) {
    console.warn(`[playable-ads-builder] Không load được "fluent-ffmpeg"/"ffmpeg-static", audio sẽ giữ nguyên (không nén mp3). Chi tiết lỗi: ${errorDetail(err)}`);
}

async function compressAudio(filePath: string, tempDir: string, bitrate: number): Promise<{ relativeExt: string; data: Buffer }> {
    if (!ffmpegLib) {
        return { relativeExt: path.extname(filePath), data: await fs.readFile(filePath) };
    }
    try {
        await fs.ensureDir(tempDir);
        const outFile = path.join(tempDir, `${path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_')}_${Date.now()}_${Math.round(Math.random() * 1e6)}.mp3`);
        await new Promise<void>((resolve, reject) => {
            ffmpegLib(filePath).audioBitrate(bitrate).toFormat('mp3').on('error', reject).on('end', () => resolve()).save(outFile);
        });
        return { relativeExt: '.mp3', data: await fs.readFile(outFile) };
    } catch (err) {
        console.warn(`[playable-ads-builder] Nén audio thất bại, dùng file gốc: ${filePath}. Chi tiết lỗi: ${errorDetail(err)}`);
        return { relativeExt: path.extname(filePath), data: await fs.readFile(filePath) };
    }
}

/** File thường (không phải ảnh) đã có data sẵn; file ảnh đang chờ nén hàng loạt (data gán sau ở collectWebMobileFiles) */
type IWalkEntry = ICollectedFile | { path: string; pendingImageId: number };

function isPendingImage(entry: IWalkEntry): entry is { path: string; pendingImageId: number } {
    return (entry as any).pendingImageId !== undefined;
}

/** Duyệt đệ quy thư mục web-mobile output; ảnh chỉ được ĐĂNG KÝ vào `pendingImages` (nén hàng loạt
 *  ở collectWebMobileFiles bằng 1 tiến trình con duy nhất), audio nén ngay tại đây (ffmpeg tự spawn
 *  tiến trình riêng cho mỗi file nên không bị giới hạn renderer process). */
async function walk(dir: string, root: string, audio: IAudioOptions, tempDir: string, pendingImages: IPendingImage[]): Promise<IWalkEntry[]> {
    const entries = await fs.readdir(dir);
    const results = await Promise.all(entries.map(async entry => {
        const full = path.join(dir, entry);
        if ((await fs.stat(full)).isDirectory()) {
            return walk(full, root, audio, tempDir, pendingImages);
        }
        const ext = path.extname(full).toLowerCase();
        const relPath = path.relative(root, full).replace(/\\/g, '/');
        if (FILE_EXTENSIONS.EXCLUDE.includes(ext)) {
            return null;
        }
        if (FILE_EXTENSIONS.IMAGE.includes(ext)) {
            const id = pendingImages.length;
            pendingImages.push({ id, full });
            return { path: relPath, pendingImageId: id } as IWalkEntry;
        }
        if (FILE_EXTENSIONS.AUDIO.includes(ext) && audio.enabled) {
            const { relativeExt, data } = await compressAudio(full, path.join(tempDir, '_audioCompressed'), audio.bitrate);
            const newRelPath = relativeExt === ext ? relPath : `${relPath.slice(0, -ext.length)}${relativeExt}`;
            return { path: newRelPath, data } as IWalkEntry;
        }
        return { path: relPath, data: await fs.readFile(full) } as IWalkEntry;
    }));
    return results.flat().filter((f): f is IWalkEntry => f !== null);
}

export async function collectWebMobileFiles(webMobileDir: string, compression: ICompressionOptions, audio: IAudioOptions, tempDir: string): Promise<ICollectedFile[]> {
    const pendingImages: IPendingImage[] = [];
    const entries = await walk(webMobileDir, webMobileDir, audio, tempDir, pendingImages);

    const compressedById = compression.type === CompressionType.None
        ? new Map<number, Buffer>()
        : await compressImagesBatch(pendingImages, compression, tempDir);

    const files: ICollectedFile[] = await Promise.all(entries.map(async entry => {
        if (!isPendingImage(entry)) {
            return entry;
        }
        const pending = pendingImages[entry.pendingImageId];
        const compressed = compressedById.get(entry.pendingImageId);
        return { path: entry.path, data: compressed || await fs.readFile(pending.full) };
    }));
    return files;
}

// --- base122: mã hoá gọn cho các kênh nhúng zip.js trực tiếp vào <script> inline (không zip riêng) ---
const BASE122_ILLEGAL_BYTES = [0, 10, 13, 34, 38, 92, 60];
function base122Encode(input: Buffer): Buffer {
    let byteIndex = 0;
    let bitOffset = 0;
    const out: number[] = [];
    function nextSeptet(): number | false {
        if (byteIndex >= input.length) {
            return false;
        }
        let value = (254 >>> bitOffset & input[byteIndex]) << bitOffset;
        value >>= 1;
        bitOffset += 7;
        if (bitOffset < 8) {
            return value;
        }
        bitOffset -= 8;
        byteIndex++;
        if (byteIndex >= input.length) {
            return value;
        }
        let extra = 65280 >>> bitOffset & input[byteIndex] & 255;
        extra >>= 8 - bitOffset;
        return value | extra;
    }
    while (true) {
        const septet = nextSeptet();
        if (septet === false) {
            break;
        }
        const illegalIndex = BASE122_ILLEGAL_BYTES.indexOf(septet);
        if (illegalIndex !== -1) {
            let next = nextSeptet();
            let lead = 194;
            if (next === false) {
                lead |= 28;
                next = septet;
            } else {
                lead |= (illegalIndex & 7) << 2;
            }
            lead |= (next & 64) > 0 ? 1 : 0;
            const trail = next & 63 | 128;
            out.push(lead);
            out.push(trail);
        } else {
            out.push(septet);
        }
    }
    return Buffer.from(out);
}

export function getPlayableEnginePath(): string {
    return path.join(__dirname, '..', 'playable-engine');
}

async function getChannelSdkScript(channel: CHANNEL, product: IProductInfo): Promise<string> {
    if (!Object.values(CHANNEL).includes(channel)) {
        throw new Error(`Kênh "${channel}" không hợp lệ.`);
    }
    const sdkPath = path.join(getPlayableEnginePath(), 'channels', `${channel}.js`);
    let content = await fs.readFile(sdkPath, 'utf-8');
    // Format thật trong channels/*.js là `google_url: "",` (key không nháy, value nháy kép),
    // KHÔNG phải `'google_url':''` như code gốc PlayableBuilder giả định - regex cũ không bao
    // giờ khớp nên link luôn bị để trống dù đã điền trong panel Build. Dùng hàm thay thế (không
    // phải chuỗi template trực tiếp) để tránh URL chứa ký tự "$" bị hiểu nhầm thành pattern đặc
    // biệt của String.replace.
    content = content.replace(/google_url:\s*""/, () => `google_url: "${product.googleUrl}"`);
    content = content.replace(/apple_url:\s*""/, () => `apple_url: "${product.appleUrl}"`);
    return content;
}

export type OnZipProgress = (current: number, total: number) => void;

/**
 * Với mỗi channel: đóng gói asset đã nén + BingoEngine.js + PlayableSDK.js (adapter riêng kênh)
 * thành 1 zip, encode base64/base122, ghi ra `${channel}.zip.js` trong `tempDir`.
 */
export async function generateChannelZipJs(files: ICollectedFile[], channels: CHANNEL[], product: IProductInfo, tempDir: string, onProgress?: OnZipProgress) {
    await fs.ensureDir(tempDir);
    const bingoEngineContent = await fs.readFile(path.join(getPlayableEnginePath(), 'BingoEngine.js'), 'utf-8');
    let done = 0;
    for (const channel of channels) {
        const zip = new AdmZip();
        for (const f of files) {
            zip.addFile(f.path, f.data);
        }
        zip.addFile('BingoEngine.js', Buffer.from(bingoEngineContent, 'utf-8'));
        const sdkScript = await getChannelSdkScript(channel, product);
        zip.addFile('PlayableSDK.js', Buffer.from(sdkScript, 'utf-8'));
        const zipBuffer: Buffer = zip.toBuffer();
        const useBase64 = CHANNELS_REQUIRING_ZIP.includes(channel);
        const encoded = useBase64 ? zipBuffer.toString('base64') : base122Encode(zipBuffer).toString('utf-8');
        const jsContent = useBase64
            ? `window.__zipEncoding="base64";window.__zip=${JSON.stringify(encoded)};`
            : `window.__zipEncoding="base122";window.__zip="${encoded}";`;
        await fs.writeFile(path.join(tempDir, `${channel}.zip.js`), jsContent, 'utf-8');
        done++;
        onProgress?.(done, channels.length);
    }
}
