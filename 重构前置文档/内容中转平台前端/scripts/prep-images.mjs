// 把设计稿里用到的配图压成 webp，供页面内联使用
import sharp from 'sharp';
import path from 'node:path';

const srcDir = 'C:/Users/zjy/WorkBuddy/开发任务/generated-images';
const outDir = path.resolve('src/assets');

const jobs = [
  { in: 'Cinematic_still_frame_for_a_sh_2026-10-27T08-00-44.png', out: 'cover.webp', width: 1000 },
  { in: 'Clean_product_photography_of_a_2026-10-27T08-01-07.png', out: 'cup.webp', width: 720 },
  { in: 'Extreme_close_up_macro_of_roas_2026-10-27T08-01-25.png', out: 'beans.webp', width: 720 },
];

for (const job of jobs) {
  const info = await sharp(path.join(srcDir, job.in))
    .resize({ width: job.width })
    .webp({ quality: 72 })
    .toFile(path.join(outDir, job.out));
  console.log(job.out, Math.round(info.size / 1024) + 'KB');
}
