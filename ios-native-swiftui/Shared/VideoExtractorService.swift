//
//  VideoExtractorService.swift
//  ALLDOWN iOS Pro (Shared Core Engine for Main App & iOS Share Sheet Extension)
//  Clean-Room Rebuild & Upgrade from SnapVideo iOS Shortcut Architecture
//  Author: Nghia MMO
//

import Foundation
import Photos

// MARK: - Data Models
public struct TikWMResponse: Codable {
    public let code: Int
    public let msg: String?
    public let data: TikWMData?
}

public struct TikWMData: Codable {
    public let id: String?
    public let title: String?
    public let play: String?
    public let hdplay: String?
    public let wmplay: String?
    public let music: String?
    public let origin_cover: String?
    public let cover: String?
    public let author: TikWMAuthor?
}

public struct TikWMAuthor: Codable {
    public let nickname: String?
    public let unique_id: String?
    public let avatar: String?
}

public enum SocialPlatform: String, Codable {
    case tiktok = "TikTok HD (Không Logo)"
    case facebook = "Facebook Watch / Reels HD"
    case instagram = "Instagram Reels HD"
}

public struct VideoQualityOption: Identifiable, Codable {
    public var id: String { label + url }
    public let badge: String
    public let label: String
    public let url: String
    public let isAudio: Bool
}

public struct ExtractedMedia: Identifiable, Codable {
    public let id: String
    public let platform: SocialPlatform
    public let title: String
    public let authorName: String
    public let thumbnailUrl: String?
    public let bestVideoUrl: String
    public let qualities: [VideoQualityOption]
    public let createdAt: Date
}

// MARK: - Core Extractor Service
public final class VideoExtractorService {
    public static let shared = VideoExtractorService()

    private let desktopUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    private let iosSafariUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"

    private init() {}

    /// Bóc tách URL đầu tiên trong chuỗi văn bản chia sẻ từ TikTok hoặc Facebook
    public func extractFirstURL(from rawText: String) -> String? {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(rawText.startIndex..., in: rawText)
        let matches = detector?.matches(in: rawText, options: [], range: range)
        return matches?.first?.url?.absoluteString
    }

    /// Hàm điều phối chính: Nhận diện TikTok / Facebook / Instagram và trả về danh sách link tải HD
    public func extractMedia(from rawInput: String) async throws -> ExtractedMedia {
        guard let cleanUrl = extractFirstURL(from: rawInput) else {
            throw NSError(
                domain: "ALLDOWN",
                code: 400,
                userInfo: [NSLocalizedDescriptionKey: "Không tìm thấy đường dẫn (URL) hợp lệ trong nội dung bạn dán!"]
            )
        }

        let lower = cleanUrl.lowercased()
        if lower.contains("tiktok.com") || lower.contains("douyin.com") {
            return try await extractTikTok(url: cleanUrl)
        } else if lower.contains("facebook.com") || lower.contains("fb.watch") || lower.contains("fb.com") {
            return try await extractFacebook(url: cleanUrl)
        } else if lower.contains("instagram.com") || lower.contains("instagr.am") {
            return try await extractInstagram(url: cleanUrl)
        } else {
            throw NSError(
                domain: "ALLDOWN",
                code: 422,
                userInfo: [NSLocalizedDescriptionKey: "Vui lòng chia sẻ link từ TikTok, Facebook (Watch/Reels) hoặc Instagram!"]
            )
        }
    }

    // MARK: - 1. TikTok No-Watermark HD Extractor
    private func extractTikTok(url: String) async throws -> ExtractedMedia {
        guard let endpoint = URL(string: "https://www.tikwm.com/api/") else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/x-www-form-urlencoded; charset=UTF-8", forHTTPHeaderField: "Content-Type")
        request.setValue(iosSafariUA, forHTTPHeaderField: "User-Agent")
        request.setValue("https://www.tikwm.com/", forHTTPHeaderField: "Referer")

        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "&+=?")
        let encodedUrl = url.addingPercentEncoding(withAllowedCharacters: allowed) ?? url
        request.httpBody = "url=\(encodedUrl)&hd=1".data(using: .utf8)

        let (data, _) = try await URLSession.shared.data(for: request)
        let decoded = try JSONDecoder().decode(TikWMResponse.self, from: data)

        guard decoded.code == 0, let d = decoded.data else {
            throw NSError(
                domain: "ALLDOWN",
                code: 500,
                userInfo: [NSLocalizedDescriptionKey: decoded.msg ?? "Không thể phân tích video TikTok này."]
            )
        }

        let fixHost: (String?) -> String? = { path in
            guard let p = path, !p.isEmpty else { return nil }
            if p.hasPrefix("http") { return p }
            return "https://www.tikwm.com\(p.hasPrefix("/") ? "" : "/")\(p)"
        }

        let hdUrl = fixHost(d.hdplay ?? d.play)
        let sdUrl = fixHost(d.play)
        let wmUrl = fixHost(d.wmplay)
        let mp3Url = fixHost(d.music)

        guard let bestVideo = hdUrl ?? sdUrl ?? wmUrl else {
            throw NSError(
                domain: "ALLDOWN",
                code: 404,
                userInfo: [NSLocalizedDescriptionKey: "Không tìm thấy luồng MP4 trong bài đăng TikTok này."]
            )
        }

        var qualities: [VideoQualityOption] = []
        if let hd = hdUrl {
            qualities.append(VideoQualityOption(badge: "HD NO-WM", label: "Video Full HD (Không Logo)", url: hd, isAudio: false))
        }
        if let sd = sdUrl, sd != hdUrl {
            qualities.append(VideoQualityOption(badge: "SD NO-WM", label: "Video Tiêu Chuẩn (Không Logo)", url: sd, isAudio: false))
        }
        if let mp3 = mp3Url {
            qualities.append(VideoQualityOption(badge: "MP3", label: "Nhạc Nền Gốc (Audio MP3)", url: mp3, isAudio: true))
        }

        return ExtractedMedia(
            id: d.id ?? UUID().uuidString,
            platform: .tiktok,
            title: d.title ?? "TikTok Video",
            authorName: d.author?.nickname ?? "TikTok Creator",
            thumbnailUrl: fixHost(d.origin_cover ?? d.cover),
            bestVideoUrl: bestVideo,
            qualities: qualities,
            createdAt: Date()
        )
    }

    // MARK: - 2. Facebook Watch / Reels / Share Link Extractor (Multi-Stage)
    private func extractFacebook(url: String) async throws -> ExtractedMedia {
        guard let initialURL = URL(string: url) else {
            throw URLError(.badURL)
        }

        // Tầng 1: Follow Redirect (/share/v/, /share/r/, fb.watch) & Parse Facebook Relay JSON
        var req1 = URLRequest(url: initialURL)
        req1.timeoutInterval = 20
        req1.setValue(desktopUA, forHTTPHeaderField: "User-Agent")
        req1.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", forHTTPHeaderField: "Accept")
        req1.setValue("vi-VN,vi;q=0.9,en-US;q=0.8", forHTTPHeaderField: "Accept-Language")

        var resolvedUrlString = url
        if let (data1, response1) = try? await URLSession.shared.data(for: req1),
           let html1 = String(data: data1, encoding: .utf8) {
            if let finalUrl = response1.url?.absoluteString {
                resolvedUrlString = finalUrl
            }
            if let media = parseFacebookHTML(html1, sourceUrl: resolvedUrlString) {
                return media
            }
        }

        // Tầng 2: Facebook Plugin Embed Player Bypass (Vượt màn hình bắt đăng nhập của Facebook)
        let videoId = matchRegex(in: resolvedUrlString, pattern: #"/(?:videos|reel|reels)/(\d+)"#)
            ?? matchRegex(in: resolvedUrlString, pattern: #"[?&]v=(\d+)"#)
            ?? matchRegex(in: url, pattern: #"/(?:videos|reel|reels)/(\d+)"#)

        let canonicalUrl = videoId != nil ? "https://www.facebook.com/watch/?v=\(videoId!)" : resolvedUrlString
        let encodedCanonical = canonicalUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? canonicalUrl
        if let embedURL = URL(string: "https://www.facebook.com/plugins/video.php?href=\(encodedCanonical)&show_text=false&width=734") {
            var req2 = URLRequest(url: embedURL)
            req2.timeoutInterval = 20
            req2.setValue(desktopUA, forHTTPHeaderField: "User-Agent")
            req2.setValue("https://www.facebook.com/", forHTTPHeaderField: "Referer")

            if let (data2, _) = try? await URLSession.shared.data(for: req2),
               let html2 = String(data: data2, encoding: .utf8),
               let media2 = parseFacebookHTML(html2, sourceUrl: canonicalUrl) {
                return media2
            }
        }

        throw NSError(
            domain: "ALLDOWN",
            code: 404,
            userInfo: [NSLocalizedDescriptionKey: "Không lấy được link Facebook. Hãy đảm bảo Video/Reels đang để chế độ Công khai (Public)!"]
        )
    }

    private func parseFacebookHTML(_ html: String, sourceUrl: String) -> ExtractedMedia? {
        let hdPatterns = [
            #""browser_native_hd_url"\s*:\s*"([^"]+)""#,
            #""playable_url_quality_hd"\s*:\s*"([^"]+)""#,
            #""hd_src_no_ratelimit"\s*:\s*"([^"]+)""#,
            #""hd_src"\s*:\s*"([^"]+)""#
        ]
        let sdPatterns = [
            #""browser_native_sd_url"\s*:\s*"([^"]+)""#,
            #""playable_url"\s*:\s*"([^"]+)""#,
            #""sd_src_no_ratelimit"\s*:\s*"([^"]+)""#,
            #""sd_src"\s*:\s*"([^"]+)""#
        ]

        var hdUrl: String?
        for pat in hdPatterns {
            if let raw = matchRegex(in: html, pattern: pat), raw != "null" {
                let decoded = decodeEscapedURL(raw)
                if decoded.hasPrefix("http") {
                    hdUrl = decoded
                    break
                }
            }
        }

        var sdUrl: String?
        for pat in sdPatterns {
            if let raw = matchRegex(in: html, pattern: pat), raw != "null" {
                let decoded = decodeEscapedURL(raw)
                if decoded.hasPrefix("http") {
                    sdUrl = decoded
                    break
                }
            }
        }

        guard let best = hdUrl ?? sdUrl else { return nil }

        let title = matchRegex(in: html, pattern: #"<meta\s+property="og:title"\s+content="([^"]+)""#)
            .map(decodeEscapedURL) ?? "Facebook Video / Reels HD"
        let thumb = matchRegex(in: html, pattern: #"<meta\s+property="og:image"\s+content="([^"]+)""#)
            .map(decodeEscapedURL)

        var qualities: [VideoQualityOption] = []
        if let hd = hdUrl {
            qualities.append(VideoQualityOption(badge: "FB HD", label: "Facebook Full HD (1080p/720p)", url: hd, isAudio: false))
        }
        if let sd = sdUrl {
            qualities.append(VideoQualityOption(badge: "FB SD", label: "Facebook Tiêu Chuẩn (SD)", url: sd, isAudio: false))
        }

        return ExtractedMedia(
            id: UUID().uuidString,
            platform: .facebook,
            title: title,
            authorName: "Facebook Watch / Reels",
            thumbnailUrl: thumb,
            bestVideoUrl: best,
            qualities: qualities,
            createdAt: Date()
        )
    }

    // MARK: - 3. Instagram Reels Extractor
    private func extractInstagram(url: String) async throws -> ExtractedMedia {
        guard let shortcode = matchRegex(in: url, pattern: #"/(?:p|reel|reels|tv)/([A-Za-z0-9_-]+)"#),
              let embedUrl = URL(string: "https://www.instagram.com/p/\(shortcode)/embed/captioned/") else {
            throw NSError(domain: "ALLDOWN", code: 400, userInfo: [NSLocalizedDescriptionKey: "Link Instagram không hợp lệ!"])
        }

        var req = URLRequest(url: embedUrl)
        req.setValue(iosSafariUA, forHTTPHeaderField: "User-Agent")
        let (data, _) = try await URLSession.shared.data(for: req)
        let html = String(data: data, encoding: .utf8) ?? ""

        guard let rawVideo = matchRegex(in: html, pattern: #""video_url"\s*:\s*"([^"]+)""#) else {
            throw NSError(domain: "ALLDOWN", code: 404, userInfo: [NSLocalizedDescriptionKey: "Không tìm thấy video Instagram công khai."])
        }

        let videoUrl = decodeEscapedURL(rawVideo)
        return ExtractedMedia(
            id: shortcode,
            platform: .instagram,
            title: "Instagram Reels (\(shortcode))",
            authorName: "Instagram Creator",
            thumbnailUrl: nil,
            bestVideoUrl: videoUrl,
            qualities: [
                VideoQualityOption(badge: "IG HD", label: "Instagram Reels Full HD", url: videoUrl, isAudio: false)
            ],
            createdAt: Date()
        )
    }

    // MARK: - 4. Tải MP4 và Lưu Thẳng Vào Ứng Dụng Ảnh (Photos) của iPhone
    public func downloadAndSaveToCameraRoll(from urlString: String) async throws {
        guard let mediaURL = URL(string: urlString) else {
            throw URLError(.badURL)
        }

        var req = URLRequest(url: mediaURL)
        req.timeoutInterval = 60
        req.setValue(iosSafariUA, forHTTPHeaderField: "User-Agent")
        if urlString.contains("tikwm") || urlString.contains("tiktok") {
            req.setValue("https://www.tikwm.com/", forHTTPHeaderField: "Referer")
        } else {
            req.setValue("https://www.facebook.com/", forHTTPHeaderField: "Referer")
        }

        let (tempURL, response) = try await URLSession.shared.download(for: req)
        if let httpRes = response as? HTTPURLResponse, !(200...299).contains(httpRes.statusCode) {
            throw NSError(
                domain: "ALLDOWN",
                code: httpRes.statusCode,
                userInfo: [NSLocalizedDescriptionKey: "Máy chủ CDN trả về mã lỗi \(httpRes.statusCode)"]
            )
        }

        let targetURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("ALLDOWN_\(Int(Date().timeIntervalSince1970)).mp4")
        try? FileManager.default.removeItem(at: targetURL)
        try FileManager.default.moveItem(at: tempURL, to: targetURL)

        let authStatus = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard authStatus == .authorized || authStatus == .limited else {
            throw NSError(
                domain: "ALLDOWN",
                code: 403,
                userInfo: [NSLocalizedDescriptionKey: "Hãy cấp quyền Thêm Ảnh (Photos) cho ALLDOWN trong Cài đặt iPhone!"]
            )
        }

        try await PHPhotoLibrary.shared().performChanges {
            PHAssetCreationRequest.forAsset().addResource(with: .video, fileURL: targetURL, options: nil)
        }

        try? FileManager.default.removeItem(at: targetURL)
    }

    // MARK: - Helpers
    private func matchRegex(in text: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
            return nil
        }
        let range = NSRange(text.startIndex..., in: text)
        guard let match = regex.firstMatch(in: text, options: [], range: range),
              match.numberOfRanges > 1,
              let groupRange = Range(match.range(at: 1), in: text) else {
            return nil
        }
        return String(text[groupRange])
    }

    private func decodeEscapedURL(_ raw: String) -> String {
        return raw
            .replacingOccurrences(of: "\\u0025", with: "%")
            .replacingOccurrences(of: "\\u0026", with: "&")
            .replacingOccurrences(of: "\\u003C", with: "<")
            .replacingOccurrences(of: "\\u003E", with: ">")
            .replacingOccurrences(of: "\\u003D", with: "=")
            .replacingOccurrences(of: "\\/", with: "/")
            .replacingOccurrences(of: "&amp;", with: "&")
    }
}

