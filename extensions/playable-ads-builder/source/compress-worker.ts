/**
 * Worker nén ảnh - CHỦ ĐÍCH chạy như 1 tiến trình Node THUẦN, tách rời khỏi renderer process
 * của Cocos Creator.
 *
 * Lý do tồn tại file này: hook build của Cocos Creator luôn chạy trong 1 renderer process của
 * Electron (đã xác nhận qua stack trace thật đi qua node:electron/js2c/renderer_init). Trong đúng
 * process đó, native addon "sharp" (phụ thuộc libvips-42.dll) load lỗi ERR_DLOPEN_FAILED (xung đột
 * DLL với Chromium/Electron đã nạp sẵn) - lỗi này bắt được bằng try/catch bình thường, không phải
 * crash cứng, nhưng vẫn khiến nén ảnh không chạy được ngay trong tiến trình đó.
 *
 * Giải pháp: build-engine.ts spawn CHÍNH CocosCreator.exe (qua process.execPath - không cần cài
 * Node riêng trên máy) kèm biến môi trường ELECTRON_RUN_AS_NODE=1, chạy file này như 1 script Node
 * thuần (đã test thực tế: sharp load & chạy hoàn toàn bình thường theo cách này). File này KHÔNG
 * được import bất kỳ module nào phụ thuộc Editor/Cocos - chỉ dùng Node API + sharp thuần.
 *
 * Cách dùng: node compress-worker.js <jobFile.json> <resultFile.json>
 *   jobFile.json: { compression: { type: 'none'|'lossy'|'lossless', quality: number }, outDir: string,
 *                   images: { id: number, input: string }[] }
 *   resultFile.json (ghi ra): { [id]: { compressed: boolean, originalSize?: number, compressedSize?: number, error?: string } }
 *   Ảnh nén thành công được ghi ra "<outDir>/<id>.webp".
 */
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore - sharp tự kèm type definition trong gói, nhưng resolve qua node_modules runtime của extension
import sharp = require('sharp');

interface IJobImage {
    id: number;
    input: string;
}

interface IJob {
    compression: { type: 'none' | 'lossy' | 'lossless'; quality: number };
    outDir: string;
    images: IJobImage[];
}

interface IResultEntry {
    compressed: boolean;
    originalSize?: number;
    compressedSize?: number;
    error?: string;
}

async function main() {
    const jobFile = process.argv[2];
    const resultFile = process.argv[3];
    if (!jobFile || !resultFile) {
        throw new Error('Thiếu tham số jobFile/resultFile.');
    }
    const job: IJob = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
    const results: Record<number, IResultEntry> = {};

    for (const img of job.images) {
        try {
            const raw = fs.readFileSync(img.input);
            const webpOptions = job.compression.type === 'lossless' ? { lossless: true } : { quality: job.compression.quality };
            const compressed: Buffer = await sharp(raw).webp(webpOptions).toBuffer();
            if (compressed.length < raw.length) {
                fs.writeFileSync(path.join(job.outDir, `${img.id}.webp`), compressed);
                results[img.id] = { compressed: true, originalSize: raw.length, compressedSize: compressed.length };
            } else {
                results[img.id] = { compressed: false, originalSize: raw.length, compressedSize: compressed.length };
            }
        } catch (err: any) {
            results[img.id] = { compressed: false, error: String((err && err.message) || err) };
        }
    }

    fs.writeFileSync(resultFile, JSON.stringify(results));
}

main()
    .then(() => process.exit(0))
    .catch(err => {
        // stderr của tiến trình con được build-engine.ts đọc lại để log lỗi thật khi spawn thất bại.
        console.error((err && err.stack) || err);
        process.exit(1);
    });
