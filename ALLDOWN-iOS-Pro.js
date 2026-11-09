// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-purple; icon-glyph: cloud-download-alt;
// share-sheet-inputs: url, plain-text;

/**
 * ============================================================================
 * ALLDOWN iOS Pro - Standalone iPhone Downloader (TikTok & Facebook HD)
 * Chạy trực tiếp trên iPhone qua Share Sheet (Không cần bật máy tính)
 * Tác giả: Nghĩa MMO (Rebuild & Upgrade từ SnapVideo)
 * ============================================================================
 */

async function main() {
  // 1. Lấy link từ Share Sheet của TikTok / Facebook hoặc từ Clipboard iPhone
  let rawInput = args.urls && args.urls.length > 0 ? args.urls[0] : null;
  if (!rawInput && args.plainTexts && args.plainTexts.length > 0) {
    rawInput = args.plainTexts[0];
  }
  if (!rawInput) {
    rawInput = await Pasteboard.pasteString();
  }

  if (!rawInput) {
    const alert = new Alert();
    alert.title = "ALLDOWN iOS Pro";
    alert.message = "Không tìm thấy link! Hãy bấm Chia sẻ (Share) từ TikTok/Facebook hoặc Sao chép liên kết trước.";
    alert.addAction("Đóng");
    await alert.presentAlert();
    return;
  }

  const urlMatch = rawInput.match(/https?:\/\/[^\s"'<>]+/i);
  const targetUrl = urlMatch ? urlMatch[0] : rawInput.trim();
  const lower = targetUrl.toLowerCase();

  try {
    let videoUrl = null;
    let title = "ALLDOWN Video";

    if (lower.includes("tiktok.com") || lower.includes("douyin.com")) {
      // Xử lý TikTok Không Logo HD qua TikWM API
      const req = new Request("https://www.tikwm.com/api/");
      req.method = "POST";
      req.headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15"
      };
      req.body = "url=" + encodeURIComponent(targetUrl) + "&hd=1";
      const res = await req.loadJSON();

      if (res && res.code === 0 && res.data) {
        const d = res.data;
        title = d.title || "TikTok HD";
        const menu = new Alert();
        menu.title = "ALLDOWN - TikTok Downloader";
        menu.message = title.slice(0, 80);
        menu.addAction("🎬 Tải Video Full HD (Không Logo)");
        menu.addAction("⚡ Tải Video SD (Nhanh - Không Logo)");
        menu.addAction("🎵 Tải Nhạc Nền MP3");
        menu.addCancelAction("Hủy");
        const choice = await menu.presentSheet();
        if (choice === -1) return;

        if (choice === 0) videoUrl = d.hdplay || d.play;
        else if (choice === 1) videoUrl = d.play || d.hdplay;
        else if (choice === 2) videoUrl = d.music;

        if (videoUrl && !videoUrl.startsWith("http")) {
          videoUrl = "https://www.tikwm.com" + videoUrl;
        }
      } else {
        throw new Error("Không bóc tách được link TikTok này.");
      }
    } else if (lower.includes("facebook.com") || lower.includes("fb.watch") || lower.includes("fb.com")) {
      // Xử lý Facebook Watch / Reels HD trực tiếp trên iPhone
      const req = new Request(targetUrl);
      req.headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml"
      };
      const html = await req.loadString();

      const decodeFb = (str) => str.replace(/\\u0025/g, "%").replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&");
      const hdMatch = html.match(/"browser_native_hd_url"\s*:\s*"([^"]+)"/) || html.match(/"playable_url_quality_hd"\s*:\s*"([^"]+)"/);
      const sdMatch = html.match(/"browser_native_sd_url"\s*:\s*"([^"]+)"/) || html.match(/"playable_url"\s*:\s*"([^"]+)"/);

      const hdUrl = hdMatch ? decodeFb(hdMatch[1]) : null;
      const sdUrl = sdMatch ? decodeFb(sdMatch[1]) : null;

      if (!hdUrl && !sdUrl) {
        throw new Error("Video Facebook này ở chế độ Riêng tư hoặc cần tải qua Web App ALLDOWN.");
      }

      const menu = new Alert();
      menu.title = "ALLDOWN - Facebook Downloader";
      menu.message = "Chọn chất lượng video Facebook muốn lưu:";
      if (hdUrl) menu.addAction("🎬 Tải Facebook Full HD");
      if (sdUrl) menu.addAction("⚡ Tải Facebook SD (Nhẹ)");
      menu.addCancelAction("Hủy");
      const choice = await menu.presentSheet();
      if (choice === -1) return;

      videoUrl = (choice === 0 && hdUrl) ? hdUrl : (sdUrl || hdUrl);
    } else {
      throw new Error("Link không thuộc TikTok hoặc Facebook!");
    }

    if (videoUrl) {
      // Tải file nhị phân và lưu thẳng vào Album Ảnh (Photos) của iPhone
      const dlReq = new Request(videoUrl);
      const data = await dlReq.load();
      const tempPath = FileManager.local().joinPath(FileManager.local().temporaryDirectory(), "alldown_" + Date.now() + ".mp4");
      FileManager.local().write(tempPath, data);
      await Photos.saveVideo(tempPath);
      FileManager.local().remove(tempPath);

      const n = new Notification();
      n.title = "✅ ALLDOWN Đã Lưu Thành Công!";
      n.body = "Video đã nằm trong ứng dụng Ảnh (Photos) trên iPhone của bạn.";
      await n.schedule();
    }
  } catch (e) {
    const errAlert = new Alert();
    errAlert.title = "⚠️ Lỗi tải video";
    errAlert.message = String(e.message || e);
    errAlert.addAction("OK");
    await errAlert.presentAlert();
  }
}

await main();
Script.complete();
