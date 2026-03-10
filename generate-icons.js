import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const iconSizes = [192, 512];
const inputIcon = 'public/icon-original.png';
const outputDir = 'public';

async function generateIcons() {
    console.log('🎨 Generating PWA icons...\n');

    // Check if input file exists
    if (!fs.existsSync(inputIcon)) {
        console.error(`❌ Input icon not found: ${iconSizes}`);
        process.exit(1);
    }

    for (const size of iconSizes) {
        const outputPath = path.join(outputDir, `icon-${size}.png`);

        try {
            await sharp(inputIcon)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png()
                .toFile(outputPath);

            console.log(`✅ Generated: icon-${size}.png`);
        } catch (error) {
            console.error(`❌ Failed to generate icon-${size}.png:`, error.message);
        }
    }

    console.log('\n🎉 Icon generation complete!');
}

generateIcons();
