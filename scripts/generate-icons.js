import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const svgLogo = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>

    <!-- Outer Border Gradient -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>

    <!-- Blue M Arrow Gradient -->
    <linearGradient id="blueArrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#172554" />
      <stop offset="40%" stop-color="#1e40af" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <!-- Orange Checkmark Arrow Gradient -->
    <linearGradient id="orangeArrowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#9a3412" />
      <stop offset="45%" stop-color="#ea580c" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>

    <!-- Drop Shadow -->
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#0f172a" flood-opacity="0.15" />
    </filter>
  </defs>

  <!-- Container Box with Rounded Outer Border -->
  <rect x="24" y="24" width="976" height="976" rx="210" fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="28" />

  <!-- Background Geometric Grid Lines -->
  <g stroke="#cbd5e1" stroke-width="2" opacity="0.4">
    <line x1="120" y1="140" x2="320" y2="300" />
    <line x1="320" y1="300" x2="520" y2="190" />
    <line x1="520" y1="190" x2="760" y2="260" />
    <line x1="760" y1="260" x2="910" y2="130" />
    <line x1="320" y1="300" x2="220" y2="520" />
    <line x1="520" y1="190" x2="620" y2="470" />
    <line x1="760" y1="260" x2="860" y2="560" />
    <line x1="220" y1="520" x2="130" y2="720" />
    <line x1="860" y1="560" x2="910" y2="780" />
  </g>

  <!-- Cloud Icon Outline -->
  <g filter="url(#shadow)">
    <path d="M 270 310 
             C 270 240, 350 200, 410 230 
             C 450 170, 560 180, 580 250 
             C 630 250, 660 300, 630 350 
             C 610 380, 570 390, 540 390 
             L 270 390 
             C 230 390, 220 330, 270 310 Z" 
          fill="none" stroke="#0284c7" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" />

    <!-- Left Blue Arrow (M First Half) -->
    <path d="M 200 620 
             L 310 300 
             L 460 210 
             L 740 160 
             L 590 350 
             L 460 560 
             L 380 450 
             Z" 
          fill="url(#blueArrowGrad)" />

    <!-- Right Orange Checkmark Arrow (M Second Half) -->
    <path d="M 380 450 
             L 530 570 
             L 630 640 
             L 950 230 
             L 720 350 
             L 610 500 
             L 530 440 
             Z" 
          fill="url(#orangeArrowGrad)" />
  </g>

  <!-- Typography MOTO -->
  <text x="512" y="820" 
        font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" 
        font-size="144" 
        font-weight="900" 
        letter-spacing="18" 
        fill="#0f172a" 
        text-anchor="middle">MOTO</text>
</svg>`;

async function generateAllIcons() {
  const assetsDir = path.resolve(process.cwd(), 'assets');
  const publicDir = path.resolve(process.cwd(), 'public');

  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

  const svgBuffer = Buffer.from(svgLogo);

  // Write base SVG
  fs.writeFileSync(path.join(assetsDir, 'logo.svg'), svgLogo);
  fs.writeFileSync(path.join(publicDir, 'logo.svg'), svgLogo);

  // 1. Assets icons for Capacitor
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon.png'));
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-only.png'));
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-foreground.png'));
  await sharp(svgBuffer).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon-background.png'));

  // 2. Public icons for PWA & Web
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa_icon.png'));
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'pwa_icon_192.png'));
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'pwa_icon_maskable.png'));

  // 3. Fallback JPG versions
  await sharp(svgBuffer).resize(512, 512).jpeg({ quality: 95 }).toFile(path.join(publicDir, 'pwa_icon.jpg'));
  await sharp(svgBuffer).resize(192, 192).jpeg({ quality: 95 }).toFile(path.join(publicDir, 'pwa_icon_192.jpg'));
  await sharp(svgBuffer).resize(512, 512).jpeg({ quality: 95 }).toFile(path.join(publicDir, 'pwa_icon_maskable.jpg'));

  console.log('✅ Generated all icons successfully in /assets and /public!');
}

generateAllIcons().catch(console.error);
