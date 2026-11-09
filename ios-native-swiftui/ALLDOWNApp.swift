//
//  ALLDOWNApp.swift
//  ALLDOWN iOS Native (Main App Entry & Full SwiftUI Interface)
//  Clean-Room Rebuild & Upgrade from SnapVideo iOS Shortcut Architecture
//  Author: Nghia MMO
//

import SwiftUI
import AVKit

@main
struct ALLDOWNApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
    }
}

struct ContentView: View {
    @State private var inputUrl: String = ""
    @State private var isLoading: Bool = false
    @State private var statusMessage: String = "Sẵn sàng tải TikTok (Không Logo HD) & Facebook Watch/Reels"
    @State private var extracted: ExtractedMedia?
    @State private var player: AVPlayer?
    @State private var history: [ExtractedMedia] = []
    @State private var selectedTab: Int = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            // TAB 1: DOWNLOADER
            NavigationView {
                ZStack {
                    Color(red: 0.04, green: 0.04, blue: 0.06).ignoresSafeArea()

                    ScrollView {
                        VStack(spacing: 18) {
                            // Header Card
                            HStack(spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 14)
                                        .fill(
                                            LinearGradient(
                                                colors: [.cyan, .pink, .indigo],
                                                startPoint: .topLeading,
                                                endPoint: .bottomTrailing
                                            )
                                        )
                                        .frame(width: 48, height: 48)
                                    Image(systemName: "arrow.down.to.line.compact")
                                        .font(.title2.bold())
                                        .foregroundColor(.white)
                                }
                                VStack(alignment: .leading, spacing: 3) {
                                    Text("ALLDOWN iOS Pro")
                                        .font(.headline.bold())
                                        .foregroundColor(.white)
                                    Text("TikTok Không Logo • Facebook Reels HD")
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                                Spacer()
                                Text("NO-WM")
                                    .font(.caption2.bold())
                                    .padding(.horizontal, 9)
                                    .padding(.vertical, 5)
                                    .background(Color.green.opacity(0.2))
                                    .foregroundColor(.green)
                                    .cornerRadius(99)
                            }
                            .padding(.horizontal, 4)

                            // Input Box
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Dán liên kết Video / Reels từ TikTok hoặc Facebook")
                                    .font(.caption.bold())
                                    .foregroundColor(.gray)

                                HStack {
                                    TextField("https://vt.tiktok.com/... hoặc fb.watch/...", text: $inputUrl)
                                        .foregroundColor(.white)
                                        .autocapitalization(.none)
                                        .disableAutocorrection(true)

                                    if !inputUrl.isEmpty {
                                        Button(action: { inputUrl = "" }) {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundColor(.gray)
                                        }
                                    }
                                }
                                .padding(14)
                                .background(Color.white.opacity(0.07))
                                .cornerRadius(14)

                                HStack(spacing: 10) {
                                    Button(action: {
                                        if let clip = UIPasteboard.general.string {
                                            inputUrl = clip
                                            Task { await analyzeAndSave(autoSave: true) }
                                        }
                                    }) {
                                        Label("Dán & Tải Ngay", systemImage: "doc.on.clipboard")
                                            .font(.subheadline.bold())
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 14)
                                            .background(Color.white.opacity(0.12))
                                            .foregroundColor(.white)
                                            .cornerRadius(14)
                                    }

                                    Button(action: {
                                        Task { await analyzeAndSave(autoSave: false) }
                                    }) {
                                        Label("Lấy Video HD", systemImage: "bolt.fill")
                                            .font(.subheadline.bold())
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 14)
                                            .background(
                                                LinearGradient(
                                                    colors: [.cyan, .pink],
                                                    startPoint: .leading,
                                                    endPoint: .trailing
                                                )
                                            )
                                            .foregroundColor(.white)
                                            .cornerRadius(14)
                                    }
                                }
                            }
                            .padding(16)
                            .background(Color.white.opacity(0.05))
                            .cornerRadius(20)

                            // Status Banner
                            if isLoading {
                                HStack(spacing: 12) {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .cyan))
                                    Text(statusMessage)
                                        .font(.footnote.bold())
                                        .foregroundColor(.cyan)
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity)
                                .background(Color.cyan.opacity(0.1))
                                .cornerRadius(14)
                            } else {
                                Text(statusMessage)
                                    .font(.footnote)
                                    .foregroundColor(.cyan)
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 8)
                            }

                            // Extracted Result & Video Player
                            if let media = extracted {
                                VStack(alignment: .leading, spacing: 14) {
                                    if let p = player {
                                        VideoPlayer(player: p)
                                            .frame(height: 280)
                                            .cornerRadius(16)
                                    }

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(media.platform.rawValue + " • " + media.authorName)
                                            .font(.subheadline.bold())
                                            .foregroundColor(.cyan)
                                        Text(media.title)
                                            .font(.footnote)
                                            .foregroundColor(.white.opacity(0.85))
                                            .lineLimit(2)
                                    }

                                    Button(action: {
                                        Task { await saveSpecificUrl(media.bestVideoUrl) }
                                    }) {
                                        Label("Lưu Thẳng Vào Album Ảnh iPhone (Photos)", systemImage: "photo.on.rectangle.angled")
                                            .font(.subheadline.bold())
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 15)
                                            .background(Color.green)
                                            .foregroundColor(.white)
                                            .cornerRadius(14)
                                    }

                                    ForEach(media.qualities) { q in
                                        Button(action: {
                                            Task { await saveSpecificUrl(q.url) }
                                        }) {
                                            HStack {
                                                Text(q.badge)
                                                    .font(.caption2.bold())
                                                    .padding(.horizontal, 8)
                                                    .padding(.vertical, 4)
                                                    .background(Color.cyan.opacity(0.2))
                                                    .foregroundColor(.cyan)
                                                    .cornerRadius(6)
                                                Text(q.label)
                                                    .font(.footnote.bold())
                                                    .foregroundColor(.white)
                                                Spacer()
                                                Image(systemName: "arrow.down.circle.fill")
                                                    .foregroundColor(.cyan)
                                            }
                                            .padding(12)
                                            .background(Color.white.opacity(0.07))
                                            .cornerRadius(12)
                                        }
                                    }
                                }
                                .padding(16)
                                .background(Color.white.opacity(0.05))
                                .cornerRadius(20)
                            }
                        }
                        .padding(16)
                    }
                }
                .navigationBarHidden(true)
            }
            .tabItem {
                Label("Tải Video", systemImage: "arrow.down.circle.fill")
            }
            .tag(0)

            // TAB 2: HƯỚNG DẪN SHARE SHEET & LỊCH SỬ
            NavigationView {
                ZStack {
                    Color(red: 0.04, green: 0.04, blue: 0.06).ignoresSafeArea()
                    List {
                        Section(header: Text("Cách Tải Từ Nút Chia Sẻ (Share Sheet) Giống SnapVideo")) {
                            Text("1. Mở ứng dụng TikTok hoặc Facebook trên iPhone.")
                            Text("2. Bấm nút Chia sẻ (Share) dưới video bạn muốn tải.")
                            Text("3. Chọn 'Tải bằng ALLDOWN Pro' trong danh sách Chia sẻ.")
                            Text("4. Video Không Logo HD sẽ tự động lưu thẳng vào Album Ảnh!")
                        }

                        Section(header: Text("Lịch Sử Đã Phân Tích (\(history.count))")) {
                            if history.isEmpty {
                                Text("Chưa có video nào trong lịch sử.")
                                    .foregroundColor(.gray)
                            } else {
                                ForEach(history) { item in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(item.platform.rawValue)
                                            .font(.caption.bold())
                                            .foregroundColor(.cyan)
                                        Text(item.title)
                                            .font(.footnote)
                                            .lineLimit(1)
                                    }
                                    .onTapGesture {
                                        extracted = item
                                        selectedTab = 0
                                    }
                                }
                            }
                        }
                    }
                }
                .navigationTitle("Share Sheet & Lịch Sử")
            }
            .tabItem {
                Label("Share Sheet", systemImage: "square.and.arrow.up")
            }
            .tag(1)
        }
        .onOpenURL { url in
            // Hỗ trợ URL Scheme: alldown://download?url=...
            if let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
               let shared = comps.queryItems?.first(where: { $0.name == "url" })?.value {
                inputUrl = shared
                selectedTab = 0
                Task { await analyzeAndSave(autoSave: true) }
            }
        }
    }

    private func analyzeAndSave(autoSave: Bool) async {
        guard !inputUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            statusMessage = "⚠️ Vui lòng dán link TikTok hoặc Facebook trước!"
            return
        }
        isLoading = true
        statusMessage = "Đang bóc tách luồng Video HD Không Logo..."
        do {
            let media = try await VideoExtractorService.shared.extractMedia(from: inputUrl)
            extracted = media
            if let vUrl = URL(string: media.bestVideoUrl) {
                player = AVPlayer(url: vUrl)
            }
            history.insert(media, at: 0)

            if autoSave {
                statusMessage = "Đang tải \(media.platform.rawValue) về Album Ảnh iPhone..."
                try await VideoExtractorService.shared.downloadAndSaveToCameraRoll(from: media.bestVideoUrl)
                statusMessage = "✅ Đã lưu thành công vào ứng dụng Ảnh (Photos) trên iPhone!"
            } else {
                statusMessage = "✅ Đã lấy xong link \(media.platform.rawValue)! Chọn chất lượng bên dưới để lưu."
            }
        } catch {
            statusMessage = "❌ \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func saveSpecificUrl(_ urlString: String) async {
        isLoading = true
        statusMessage = "Đang lưu file vào Album Ảnh iPhone (Photos)..."
        do {
            try await VideoExtractorService.shared.downloadAndSaveToCameraRoll(from: urlString)
            statusMessage = "✅ Đã lưu thành công vào ứng dụng Ảnh (Photos) trên iPhone!"
        } catch {
            statusMessage = "❌ \(error.localizedDescription)"
        }
        isLoading = false
    }
}
