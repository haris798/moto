import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const mipmaps = [
  { dir: 'mipmap-mdpi', size: 48, fgSize: 108 },
  { dir: 'mipmap-hdpi', size: 72, fgSize: 162 },
  { dir: 'mipmap-xhdpi', size: 96, fgSize: 216 },
  { dir: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
  { dir: 'mipmap-xxxhdpi', size: 192, fgSize: 432 }
];

async function generateAndroidIcons() {
  const iconPath = path.resolve(process.cwd(), 'assets', 'icon.png');
  const fallbackPath = path.resolve(process.cwd(), 'public', 'pwa_icon.png');
  
  const srcImage = fs.existsSync(iconPath) ? iconPath : fallbackPath;
  if (!fs.existsSync(srcImage)) {
    console.error('❌ Source image not found at assets/icon.png or public/pwa_icon.png');
    process.exit(1);
  }

  const resDir = path.resolve(process.cwd(), 'android', 'app', 'src', 'main', 'res');
  if (!fs.existsSync(resDir)) {
    console.warn(`⚠️ Android res directory not found at ${resDir}. Skipping Android icon injection.`);
    return;
  }

  console.log(`📱 Injecting MOTO app icons into Android res folder (${resDir})...`);

  for (const m of mipmaps) {
    const targetFolder = path.join(resDir, m.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    // Standard square launcher icon
    await sharp(srcImage)
      .resize(m.size, m.size)
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher.png'));

    // Round launcher icon
    await sharp(srcImage)
      .resize(m.size, m.size)
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_round.png'));

    // Adaptive foreground icon
    await sharp(srcImage)
      .resize(m.fgSize, m.fgSize)
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_foreground.png'));

    console.log(`  ✓ Updated ${m.dir} (size: ${m.size}px, fg: ${m.fgSize}px)`);
  }

  console.log('🎉 Android APK launcher icons generated successfully!');
}

generateAndroidIcons().catch(console.error);
