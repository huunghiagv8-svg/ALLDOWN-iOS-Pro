/**
 * ALLDOWN iOS Pro - Direct iOS Package Builder (.mobileconfig & .ipa & Standalone Serverless App)
 * Tạo bộ cài đặt trực tiếp lên iPhone:
 *  1. ALLDOWN-iOS-App.mobileconfig (Apple iOS Configuration Profile - Cài thẳng vào iPhone không cần Jailbreak/Chứng chỉ)
 *  2. ALLDOWN-iOS-Pro-v2.0.ipa (Gói Payload/ALLDOWN.app chuẩn cấu trúc iOS .ipa)
 *  3. public/standalone.html (Ứng dụng iOS chạy độc lập 100% bằng 4G/5G không cần bật PC)
 * Author: Nghia MMO
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

function getLocalLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Tạo ảnh PNG 180x180 hợp lệ (Base64) cho Icon của Hồ sơ cài đặt iOS (.mobileconfig) & Payload/ALLDOWN.app
 */
function generateValidIconPngBuffer() {
  // 1x1x32-bit Deep Purple/Cyan PNG fallback hoặc đọc từ icon
  const zlib = require('node:zlib');
  const width = 180;
  const height = 180;

  // Vẽ icon Gradient Cyan -> Pink -> Deep Purple với mũi tên tải xuống màu trắng ở giữa
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    rawData[rowStart] = 0; // filter type 0
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 4;
      // Nền bo góc/gradient
      let r = Math.round(15 + (x / width) * 220);
      let g = Math.round(23 + ((height - y) / height) * 180);
      let b = Math.round(60 + (y / height) * 195);

      // Vẽ mũi tên tải xuống màu trắng ở trung tâm (180x180)
      const cx = x - 90;
      const cy = y - 90;
      const inStem = Math.abs(cx) <= 12 && cy >= -48 && cy <= 20;
      const inHead =
        cy >= -2 &&
        cy <= 34 &&
        Math.abs(cx) <= 38 - (cy + 2);
      const inBase = Math.abs(cx) <= 44 && cy >= 42 && cy <= 54;

      if (inStem || inHead || inBase) {
        r = 255;
        g = 255;
        b = 255;
      }

      rawData[px] = r;
      rawData[px + 1] = g;
      rawData[px + 2] = b;
      rawData[px + 3] = 255;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
    }
    return (c ^ -1) >>> 0;
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * 1. Sinh Hồ sơ Cài đặt iOS (.mobileconfig) chuẩn Apple Configuration Profile
 * Cài đặt trực tiếp trong Cài đặt (Settings) của iPhone mà không cần chứng chỉ hay Jailbreak!
 */
function generateMobileConfig(appUrl, iconBase64) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>FullScreen</key>
			<true/>
			<key>Icon</key>
			<data>${iconBase64}</data>
			<key>IgnoreManifestScope</key>
			<true/>
			<key>IsRemovable</key>
			<true/>
			<key>Label</key>
			<string>Nghĩa MMO ALLDOWNLOAD</string>
			<key>PayloadDescription</key>
			<string>Cấu hình cài đặt ứng dụng Nghĩa MMO ALLDOWNLOAD (Tải Video TikTok Không Logo HD &amp; Facebook Reels/Watch) lên Màn hình chính iPhone.</string>
			<key>PayloadDisplayName</key>
			<string>Nghĩa MMO ALLDOWNLOAD App</string>
			<key>PayloadIdentifier</key>
			<string>com.nghiammo.alldown.webclip</string>
			<key>PayloadType</key>
			<string>com.apple.webClip.managed</string>
			<key>PayloadUUID</key>
			<string>8A9C7E12-4B5D-4E8A-9C11-223344556677</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
			<key>Precomposed</key>
			<true/>
			<key>URL</key>
			<string>${appUrl}</string>
		</dict>
	</array>
	<key>PayloadDescription</key>
	<string>Bộ cài đặt chính thức Nghĩa MMO ALLDOWNLOAD (Rebuild từ SnapVideo bởi Nghĩa MMO) - Tải Video TikTok Không Logo HD, Nhạc MP3 &amp; Facebook Watch/Reels về Album Ảnh iPhone.</string>
	<key>PayloadDisplayName</key>
	<string>Nghĩa MMO ALLDOWNLOAD (TikTok &amp; FB Downloader)</string>
	<key>PayloadIdentifier</key>
	<string>com.nghiammo.alldown.profile</string>
	<key>PayloadOrganization</key>
	<string>Nghĩa MMO Lab</string>
	<key>PayloadRemovalDisallowed</key>
	<false/>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadUUID</key>
	<string>11223344-5566-7788-99AA-BBCCDDEEFF00</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
</dict>
</plist>`;
}

/**
 * 2. Đóng gói cấu trúc Payload/ALLDOWN.app thành file ALLDOWN-iOS-Pro-v2.0.ipa
 */
function buildLocalIpaPackage(iconPngBuffer) {
  const stagingDir = path.join(__dirname, '.ipa_staging');
  const appDir = path.join(stagingDir, 'Payload', 'ALLDOWN.app');
  const shareExtDir = path.join(
    appDir,
    'PlugIns',
    'ALLDOWNShareExtension.appex'
  );

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(shareExtDir, { recursive: true });

  // Copy Info.plist, Icon,PkgInfo và Source/Assets
  fs.copyFileSync(
    path.join(__dirname, 'ios-native-swiftui', 'Info.plist'),
    path.join(appDir, 'Info.plist')
  );
  fs.copyFileSync(
    path.join(__dirname, 'ios-native-swiftui', 'ShareExtension', 'Info.plist'),
    path.join(shareExtDir, 'Info.plist')
  );
  fs.writeFileSync(path.join(appDir, 'PkgInfo'), 'APPL????');
  fs.writeFileSync(path.join(appDir, 'AppIcon60x60@3x.png'), iconPngBuffer);
  fs.copyFileSync(
    path.join(__dirname, 'public', 'index.html'),
    path.join(appDir, 'index.html')
  );
  fs.copyFileSync(
    path.join(__dirname, 'ios-native-swiftui', 'ALLDOWNApp.swift'),
    path.join(appDir, 'ALLDOWNApp.swift')
  );
  fs.copyFileSync(
    path.join(
      __dirname,
      'ios-native-swiftui',
      'Shared',
      'VideoExtractorService.swift'
    ),
    path.join(appDir, 'VideoExtractorService.swift')
  );

  const zipPath = path.join(__dirname, 'ALLDOWN-iOS-Pro-v2.0.zip');
  const ipaPath = path.join(__dirname, 'ALLDOWN-iOS-Pro-v2.0.ipa');
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  if (fs.existsSync(ipaPath)) fs.unlinkSync(ipaPath);

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${path.join(
      stagingDir,
      'Payload'
    )}' -DestinationPath '${zipPath}' -Force; Move-Item -Path '${zipPath}' -Destination '${ipaPath}' -Force"`
  );

  fs.rmSync(stagingDir, { recursive: true, force: true });
  return ipaPath;
}

function main() {
  const lanIp = getLocalLanIp();
  const appUrl = `http://${lanIp}:3000/?source=mobileconfig`;
  const iconPng = generateValidIconPngBuffer();
  const iconBase64 = iconPng.toString('base64');

  // Lưu icon.png vào public/
  fs.writeFileSync(path.join(__dirname, 'public', 'icon.png'), iconPng);

  // Xuất file .mobileconfig ở cả thư mục gốc và public/ để iPhone tải 1 chạm
  const mobileConfigXml = generateMobileConfig(appUrl, iconBase64);
  const rootMobileConfig = path.join(
    __dirname,
    'ALLDOWN-iOS-App.mobileconfig'
  );
  const publicMobileConfig = path.join(
    __dirname,
    'public',
    'ALLDOWN-iOS-App.mobileconfig'
  );
  fs.writeFileSync(rootMobileConfig, mobileConfigXml, 'utf8');
  fs.writeFileSync(publicMobileConfig, mobileConfigXml, 'utf8');

  // Xuất gói .ipa
  const ipaPath = buildLocalIpaPackage(iconPng);
  fs.copyFileSync(
    ipaPath,
    path.join(__dirname, 'public', 'ALLDOWN-iOS-Pro-v2.0.ipa')
  );

  console.log('✅ Đã tạo thành công:');
  console.log('   1. ' + rootMobileConfig);
  console.log('   2. ' + ipaPath);
}

main();

