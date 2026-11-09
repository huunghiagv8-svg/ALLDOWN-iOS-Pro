/**
 * ALLDOWN iOS Engine v3.0 - Multi-Platform Video Extractor
 * Hỗ trợ: TikTok (No-WM HD/Slide/MP3), Douyin, Facebook (Watch/Reels/Share HD), Instagram Reels, X/Twitter
 * Clean-Room Rebuild & Upgrade from SnapVideo iOS Shortcut Architecture
 * Author: Nghia MMO
 */

const USER_AGENTS = {
  DESKTOP:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  IOS_SAFARI:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  TELEGRAM_BOT: 'TelegramBot (like TwitterBot)'
};

/**
 * Tự động bóc tách URL đầu tiên từ văn bản bất kỳ (khi người dùng copy cả caption từ TikTok/FB)
 */
function extractFirstUrl(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const match = rawText.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].trim() : rawText.trim();
}

/**
 * Nhận diện nền tảng mạng xã hội
 */
function detectPlatform(url) {
  const lower = url.toLowerCase();
  if (
    lower.includes('tiktok.com') ||
    lower.includes('douyin.com') ||
    lower.includes('iesdouyin.com')
  ) {
    return 'tiktok';
  }
  if (
    lower.includes('facebook.com') ||
    lower.includes('fb.watch') ||
    lower.includes('fb.com') ||
    lower.includes('fb.gg')
  ) {
    return 'facebook';
  }
  if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
    return 'instagram';
  }
  if (lower.includes('twitter.com') || lower.includes('x.com')) {
    return 'twitter';
  }
  return 'unknown';
}

/**
 * Giải mã chuỗi JSON Escape của Facebook / Instagram Relay
 */
function decodeEscapedUrl(raw) {
  if (!raw) return null;
  try {
    let cleaned = raw
      .replace(/\\u0025/g, '%')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003C/g, '<')
      .replace(/\\u003E/g, '>')
      .replace(/\\u003D/g, '=')
      .replace(/\\\//g, '/')
      .replace(/&amp;/g, '&');
    if (cleaned.includes('\\u')) {
      cleaned = JSON.parse(`"${cleaned.replace(/"/g, '\\"')}"`);
    }
    return cleaned;
  } catch {
    return raw.replace(/\\\//g, '/').replace(/&amp;/g, '&');
  }
}

/**
 * ============================================================================
 * 1. TIKTOK & DOUYIN EXTRACTOR (TikWM API + Direct Rehydration Fallback)
 * ============================================================================
 */
async function extractTikTok(inputUrl) {
  // Tầng 1: Gọi TikWM API (Lõi chính của phím tắt SnapVideo iOS)
  try {
    const body = new URLSearchParams({
      url: inputUrl,
      hd: '1'
    });

    const res = await fetch('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': USER_AGENTS.IOS_SAFARI,
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Referer: 'https://www.tikwm.com/'
      },
      body: body.toString()
    });

    const json = await res.json();
    if (json && json.code === 0 && json.data) {
      const d = json.data;
      const fixHost = (u) => {
        if (!u) return null;
        if (u.startsWith('http')) return u;
        return `https://www.tikwm.com${u.startsWith('/') ? '' : '/'}${u}`;
      };

      const hdUrl = fixHost(d.hdplay || d.play);
      const sdUrl = fixHost(d.play || d.wmplay);
      const wmUrl = fixHost(d.wmplay);
      const audioUrl = fixHost(d.music || (d.music_info && d.music_info.play));
      const images = Array.isArray(d.images) ? d.images : [];

      const qualities = [];
      if (hdUrl) {
        qualities.push({
          id: 'hd_nowm',
          label: 'Video Full HD (Không Logo)',
          badge: 'HD NO-WM',
          type: 'video',
          ext: 'mp4',
          size: d.hd_size || d.size || null,
          url: hdUrl
        });
      }
      if (sdUrl && sdUrl !== hdUrl) {
        qualities.push({
          id: 'sd_nowm',
          label: 'Video Tiêu Chuẩn (Không Logo)',
          badge: 'SD NO-WM',
          type: 'video',
          ext: 'mp4',
          size: d.size || null,
          url: sdUrl
        });
      }
      if (wmUrl) {
        qualities.push({
          id: 'wm',
          label: 'Video Có Logo Gốc',
          badge: 'WATERMARK',
          type: 'video',
          ext: 'mp4',
          size: d.wm_size || null,
          url: wmUrl
        });
      }
      if (audioUrl) {
        qualities.push({
          id: 'audio',
          label: 'Nhạc nền gốc (Audio MP3)',
          badge: 'MP3 AUDIO',
          type: 'audio',
          ext: 'mp3',
          size: null,
          url: audioUrl
        });
      }

      return {
        success: true,
        platform: 'tiktok',
        engine: 'TikWM-SnapVideo-Core',
        id: d.id || String(Date.now()),
        title: d.title || 'TikTok Video',
        author: {
          name: (d.author && d.author.nickname) || 'TikTok User',
          username: (d.author && d.author.unique_id) || '',
          avatar: fixHost(d.author && d.author.avatar)
        },
        duration: d.duration || 0,
        thumbnail: fixHost(d.origin_cover || d.cover),
        stats: {
          views: d.play_count || 0,
          likes: d.digg_count || 0,
          comments: d.comment_count || 0,
          shares: d.share_count || 0
        },
        isPhotoSlide: images.length > 0,
        images,
        qualities,
        bestVideoUrl: hdUrl || sdUrl || wmUrl,
        audioUrl
      };
    }
  } catch (err) {
    console.warn('[TikTok Layer 1 Warning]:', err.message);
  }

  // Tầng 2: Fallback bóc trực tiếp từ __UNIVERSAL_DATA_FOR_REHYDRATION__ của TikTok
  const pageRes = await fetch(inputUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENTS.DESKTOP,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  const html = await pageRes.text();
  const scriptMatch = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (scriptMatch) {
    const rawJson = JSON.parse(scriptMatch[1]);
    const itemStruct =
      rawJson?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (itemStruct) {
      const videoUrl =
        itemStruct.video?.playAddr || itemStruct.video?.downloadAddr;
      const audioUrl = itemStruct.music?.playUrl;
      return {
        success: true,
        platform: 'tiktok',
        engine: 'TikTok-Direct-Hydration',
        id: itemStruct.id,
        title: itemStruct.desc || 'TikTok Video',
        author: {
          name: itemStruct.author?.nickname || 'TikTok User',
          username: itemStruct.author?.uniqueId || '',
          avatar: itemStruct.author?.avatarThumb || ''
        },
        duration: itemStruct.video?.duration || 0,
        thumbnail: itemStruct.video?.cover || '',
        stats: {
          views: itemStruct.stats?.playCount || 0,
          likes: itemStruct.stats?.diggCount || 0,
          comments: itemStruct.stats?.commentCount || 0,
          shares: itemStruct.stats?.shareCount || 0
        },
        isPhotoSlide: false,
        images: [],
        qualities: [
          {
            id: 'hd_nowm',
            label: 'Video Gốc Không Logo',
            badge: 'NO-WM',
            type: 'video',
            ext: 'mp4',
            url: videoUrl
          },
          ...(audioUrl
            ? [
                {
                  id: 'audio',
                  label: 'Nhạc nền MP3',
                  badge: 'MP3',
                  type: 'audio',
                  ext: 'mp3',
                  url: audioUrl
                }
              ]
            : [])
        ],
        bestVideoUrl: videoUrl,
        audioUrl
      };
    }
  }

  throw new Error(
    'Không thể bóc tách video TikTok này. Hãy kiểm tra lại link công khai!'
  );
}

/**
 * Hàm tìm kiếm Regex luồng HD/SD trong mã nguồn HTML/Relay của Facebook
 */
function parseFacebookHtmlStreams(html) {
  let hdUrl = null;
  let sdUrl = null;
  let title = 'Facebook Video / Reel';
  let thumbnail = null;

  const hdPatterns = [
    /"browser_native_hd_url"\s*:\s*"([^"]+)"/,
    /"playable_url_quality_hd"\s*:\s*"([^"]+)"/,
    /"hd_src_no_ratelimit"\s*:\s*"([^"]+)"/,
    /"hd_src"\s*:\s*"([^"]+)"/,
    /hd_src\s*:\s*"([^"]+)"/
  ];

  const sdPatterns = [
    /"browser_native_sd_url"\s*:\s*"([^"]+)"/,
    /"playable_url"\s*:\s*"([^"]+)"/,
    /"sd_src_no_ratelimit"\s*:\s*"([^"]+)"/,
    /"sd_src"\s*:\s*"([^"]+)"/,
    /sd_src\s*:\s*"([^"]+)"/
  ];

  for (const reg of hdPatterns) {
    const m = html.match(reg);
    if (m && m[1] && m[1] !== 'null') {
      hdUrl = decodeEscapedUrl(m[1]);
      if (hdUrl && hdUrl.startsWith('http')) break;
    }
  }

  for (const reg of sdPatterns) {
    const m = html.match(reg);
    if (m && m[1] && m[1] !== 'null') {
      sdUrl = decodeEscapedUrl(m[1]);
      if (sdUrl && sdUrl.startsWith('http')) break;
    }
  }

  const titleMatch =
    html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = decodeEscapedUrl(titleMatch[1]);
  }

  const thumbMatch =
    html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) ||
    html.match(
      /"preferred_thumbnail"\s*:\s*\{\s*"image"\s*:\s*\{\s*"uri"\s*:\s*"([^"]+)"/
    );
  if (thumbMatch && thumbMatch[1]) {
    thumbnail = decodeEscapedUrl(thumbMatch[1]);
  }

  return { hdUrl, sdUrl, title, thumbnail };
}

/**
 * ============================================================================
 * 2. FACEBOOK EXTRACTOR (Direct Relay + Plugin Embed Bypass + Mobile Stream)
 * ============================================================================
 */
async function extractFacebook(inputUrl) {
  let resolvedUrl = inputUrl;
  try {
    const headRes = await fetch(inputUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENTS.DESKTOP,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    if (headRes.url) {
      resolvedUrl = headRes.url;
    }
    const html = await headRes.text();
    const parsed = parseFacebookHtmlStreams(html);

    if (parsed.hdUrl || parsed.sdUrl) {
      return buildFacebookResponse(resolvedUrl, parsed, 'FB-Relay-Direct');
    }
  } catch (err) {
    console.warn('[Facebook Stage 1 Warning]:', err.message);
  }

  // Bước 2: Gọi qua Facebook Embedded Video Player (Vượt tường đăng nhập đối với Video & Reels Public)
  const videoIdMatch =
    resolvedUrl.match(/\/(?:videos|reel|reels)\/(\d+)/i) ||
    resolvedUrl.match(/[?&]v=(\d+)/i) ||
    inputUrl.match(/\/(?:videos|reel|reels)\/(\d+)/i) ||
    inputUrl.match(/[?&]v=(\d+)/i);

  const canonicalVideoUrl = videoIdMatch
    ? `https://www.facebook.com/watch/?v=${videoIdMatch[1]}`
    : resolvedUrl;

  const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
    canonicalVideoUrl
  )}&show_text=false&width=734`;

  try {
    const embedRes = await fetch(embedUrl, {
      headers: {
        'User-Agent': USER_AGENTS.DESKTOP,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://www.facebook.com/'
      }
    });
    const embedHtml = await embedRes.text();
    const parsedEmbed = parseFacebookHtmlStreams(embedHtml);

    if (parsedEmbed.hdUrl || parsedEmbed.sdUrl) {
      return buildFacebookResponse(
        canonicalVideoUrl,
        parsedEmbed,
        'FB-Embed-Player-Bypass'
      );
    }
  } catch (err) {
    console.warn('[Facebook Stage 2 Embed Warning]:', err.message);
  }

  // Bước 3: Thử với User-Agent Mobile Safari
  try {
    const botRes = await fetch(canonicalVideoUrl, {
      headers: {
        'User-Agent': USER_AGENTS.IOS_SAFARI,
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    const botHtml = await botRes.text();
    const parsedBot = parseFacebookHtmlStreams(botHtml);
    if (parsedBot.hdUrl || parsedBot.sdUrl) {
      return buildFacebookResponse(
        canonicalVideoUrl,
        parsedBot,
        'FB-Mobile-Safari-Stream'
      );
    }
  } catch (err) {
    console.warn('[Facebook Stage 3 Warning]:', err.message);
  }

  throw new Error(
    'Không thể lấy link tải Facebook. Hãy đảm bảo Video/Reels đang ở chế độ Công khai (Public)!'
  );
}

function buildFacebookResponse(url, parsed, engineName) {
  const qualities = [];
  if (parsed.hdUrl) {
    qualities.push({
      id: 'fb_hd',
      label: 'Video Facebook Full HD (1080p/720p)',
      badge: 'FB HD',
      type: 'video',
      ext: 'mp4',
      size: null,
      url: parsed.hdUrl
    });
  }
  if (parsed.sdUrl) {
    qualities.push({
      id: 'fb_sd',
      label: 'Video Facebook Tiêu Chuẩn (SD)',
      badge: 'FB SD',
      type: 'video',
      ext: 'mp4',
      size: null,
      url: parsed.sdUrl
    });
  }

  return {
    success: true,
    platform: 'facebook',
    engine: engineName,
    id: String(Date.now()),
    title: parsed.title || 'Facebook Video / Reels',
    author: {
      name: 'Facebook Watch / Reels',
      username: 'facebook.com',
      avatar: null
    },
    duration: 0,
    thumbnail: parsed.thumbnail,
    stats: { views: 0, likes: 0, comments: 0, shares: 0 },
    isPhotoSlide: false,
    images: [],
    qualities,
    bestVideoUrl: parsed.hdUrl || parsed.sdUrl,
    audioUrl: null
  };
}

/**
 * ============================================================================
 * 3. INSTAGRAM REELS / POST EXTRACTOR (Embed & GraphQL Fallback)
 * ============================================================================
 */
async function extractInstagram(inputUrl) {
  const shortcodeMatch = inputUrl.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  if (!shortcodeMatch) {
    throw new Error('Link Instagram không hợp lệ!');
  }
  const shortcode = shortcodeMatch[1];
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

  const res = await fetch(embedUrl, {
    headers: {
      'User-Agent': USER_AGENTS.IOS_SAFARI,
      Accept: 'text/html,application/xhtml+xml'
    }
  });
  const html = await res.text();
  const videoMatch =
    html.match(/"video_url"\s*:\s*"([^"]+)"/) ||
    html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/i);
  const thumbMatch =
    html.match(/"display_url"\s*:\s*"([^"]+)"/) ||
    html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);

  if (videoMatch && videoMatch[1]) {
    const videoUrl = decodeEscapedUrl(videoMatch[1]);
    const thumbUrl = thumbMatch ? decodeEscapedUrl(thumbMatch[1]) : null;
    return {
      success: true,
      platform: 'instagram',
      engine: 'IG-Embed-Direct',
      id: shortcode,
      title: `Instagram Reel (${shortcode})`,
      author: { name: 'Instagram Creator', username: 'instagram', avatar: null },
      duration: 0,
      thumbnail: thumbUrl,
      stats: { views: 0, likes: 0, comments: 0, shares: 0 },
      isPhotoSlide: false,
      images: [],
      qualities: [
        {
          id: 'ig_hd',
          label: 'Instagram Reels Full HD',
          badge: 'IG HD',
          type: 'video',
          ext: 'mp4',
          url: videoUrl
        }
      ],
      bestVideoUrl: videoUrl,
      audioUrl: null
    };
  }

  throw new Error('Không thể bóc tách video Instagram này.');
}

/**
 * ============================================================================
 * 4. X / TWITTER VIDEO EXTRACTOR (vxTwitter / FixupX API)
 * ============================================================================
 */
async function extractTwitter(inputUrl) {
  const statusMatch = inputUrl.match(/status\/(\d+)/);
  if (!statusMatch) {
    throw new Error('Link X/Twitter không chứa mã bài đăng (status ID)!');
  }
  const apiRes = await fetch(`https://api.vxtwitter.com/Twitter/status/${statusMatch[1]}`, {
    headers: { 'User-Agent': USER_AGENTS.DESKTOP }
  });
  const data = await apiRes.json();
  const mediaList = data.media_extended || [];
  const videoItem = mediaList.find((m) => m.type === 'video' || m.type === 'gif');

  if (!videoItem || !videoItem.url) {
    throw new Error('Bài đăng X/Twitter này không chứa video!');
  }

  return {
    success: true,
    platform: 'twitter',
    engine: 'VXTwitter-Direct',
    id: statusMatch[1],
    title: data.text || 'X / Twitter Video',
    author: {
      name: data.user_name || 'X User',
      username: data.user_screen_name || '',
      avatar: data.user_profile_image_url || null
    },
    duration: Math.round((videoItem.duration_millis || 0) / 1000),
    thumbnail: videoItem.thumbnail_url || null,
    stats: {
      views: 0,
      likes: data.likes || 0,
      comments: data.replies || 0,
      shares: data.retweets || 0
    },
    isPhotoSlide: false,
    images: [],
    qualities: [
      {
        id: 'x_hd',
        label: 'Video X/Twitter Full HD',
        badge: 'X HD',
        type: 'video',
        ext: 'mp4',
        url: videoItem.url
      }
    ],
    bestVideoUrl: videoItem.url,
    audioUrl: null
  };
}

/**
 * Hàm điều phối chính (Main Dispatcher)
 */
async function extractMedia(rawInput) {
  const cleanUrl = extractFirstUrl(rawInput);
  if (!cleanUrl || !cleanUrl.startsWith('http')) {
    throw new Error('Vui lòng dán đường dẫn (URL) hợp lệ!');
  }

  const platform = detectPlatform(cleanUrl);
  if (platform === 'tiktok') {
    return await extractTikTok(cleanUrl);
  }
  if (platform === 'facebook') {
    return await extractFacebook(cleanUrl);
  }
  if (platform === 'instagram') {
    return await extractInstagram(cleanUrl);
  }
  if (platform === 'twitter') {
    return await extractTwitter(cleanUrl);
  }

  throw new Error(
    'Hỗ trợ: TikTok, Douyin, Facebook (Watch/Reels), Instagram Reels và X (Twitter).'
  );
}

module.exports = {
  extractFirstUrl,
  detectPlatform,
  extractTikTok,
  extractFacebook,
  extractInstagram,
  extractTwitter,
  extractMedia
};
