/**
 * Generate PWA icon PNGs from the SVG source.
 *
 * Usage:
 *   npx tsx scripts/generate-icons.ts
 *
 * Requires: sharp (npm i -D sharp)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const sharp = (await import('sharp')).default;

  const svgPath = resolve(__dirname, '..', 'public', 'icons', 'icon.svg');
  const svgBuffer = readFileSync(svgPath);

  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'icon-maskable-512.png', size: 512 },
  ];

  for (const { name, size } of sizes) {
    const outPath = resolve(__dirname, '..', 'public', 'icons', name);
    await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
    console.log(`Created ${outPath}`);
  }

  console.log('Done! All icons generated.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
