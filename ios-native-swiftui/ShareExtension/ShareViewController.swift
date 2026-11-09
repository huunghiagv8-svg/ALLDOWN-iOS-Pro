//
//  ShareViewController.swift
//  ALLDOWNShareExtension (iOS Native Share Sheet Action for TikTok & Facebook)
//  Khi bấm nút "Chia sẻ" (Share) trong app TikTok hoặc Facebook -> Chọn "Tải bằng ALLDOWN Pro" -> Tự lưu vào Album Ảnh!
//  Author: Nghia MMO
//

import UIKit
import SwiftUI
import UniformTypeIdentifiers

@objc(ShareViewController)
class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear

        let hostingController = UIHostingController(
            rootView: ShareSheetOverlayView(
                extensionContext: self.extensionContext,
                onDismiss: { [weak self] in
                    self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
                }
            )
        )
        hostingController.view.backgroundColor = .clear
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        hostingController.didMove(toParent: self)
    }
}

struct ShareSheetOverlayView: View {
    let extensionContext: NSExtensionContext?
    let onDismiss: () -> Void

    @State private var statusTitle: String = "ALLDOWN iOS Pro"
    @State private var statusSubtitle: String = "Đang đọc liên kết từ TikTok / Facebook..."
    @State private var isProcessing: Bool = true
    @State private var isSuccess: Bool = false
    @State private var extracted: ExtractedMedia?

    var body: some View {
        ZStack {
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .onTapGesture {
                    if !isProcessing { onDismiss() }
                }

            VStack(spacing: 16) {
                HStack {
                    Image(systemName: isSuccess ? "checkmark.seal.fill" : "arrow.down.circle.fill")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(
                            LinearGradient(colors: [.cyan, .pink], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                    Text(statusTitle)
                        .font(.headline.bold())
                        .foregroundColor(.white)
                    Spacer()
                    Button(action: onDismiss) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .foregroundColor(.gray)
                    }
                }

                if isProcessing {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .cyan))
                        .scaleEffect(1.3)
                        .padding(.vertical, 6)
                }

                Text(statusSubtitle)
                    .font(.subheadline)
                    .foregroundColor(.white.opacity(0.88))
                    .multilineTextAlignment(.center)
                    .lineLimit(3)

                if let media = extracted, !isProcessing && !isSuccess {
                    VStack(spacing: 10) {
                        ForEach(media.qualities.filter { !$0.isAudio }) { q in
                            Button(action: {
                                Task { await downloadQuality(q.url) }
                            }) {
                                HStack {
                                    Text(q.badge)
                                        .font(.caption.bold())
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.cyan.opacity(0.2))
                                        .foregroundColor(.cyan)
                                        .cornerRadius(6)
                                    Text(q.label)
                                        .font(.subheadline.bold())
                                        .foregroundColor(.white)
                                    Spacer()
                                    Image(systemName: "arrow.down.to.line")
                                        .foregroundColor(.cyan)
                                }
                                .padding(12)
                                .background(Color.white.opacity(0.08))
                                .cornerRadius(12)
                            }
                        }
                    }
                }
            }
            .padding(22)
            .background(Color(red: 0.08, green: 0.09, blue: 0.14))
            .cornerRadius(24)
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .stroke(Color.white.opacity(0.14), lineWidth: 1)
            )
            .padding(.horizontal, 24)
        }
        .task {
            await handleIncomingShare()
        }
    }

    private func handleIncomingShare() async {
        guard let sharedText = await extractSharedText() else {
            isProcessing = false
            statusSubtitle = "❌ Không tìm thấy liên kết TikTok hoặc Facebook!"
            return
        }

        statusSubtitle = "Đang bóc tách luồng Video HD Không Logo..."
        do {
            let media = try await VideoExtractorService.shared.extractMedia(from: sharedText)
            extracted = media
            statusTitle = media.platform.rawValue
            statusSubtitle = "Đang lưu thẳng Video HD vào Album Ảnh iPhone..."
            try await VideoExtractorService.shared.downloadAndSaveToCameraRoll(from: media.bestVideoUrl)
            isProcessing = false
            isSuccess = true
            statusTitle = "Đã Lưu Vào Album Ảnh!"
            statusSubtitle = "✅ Video đã nằm trong ứng dụng Ảnh (Photos) trên iPhone của bạn."
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            onDismiss()
        } catch {
            isProcessing = false
            statusSubtitle = "⚠️ \(error.localizedDescription)"
        }
    }

    private func downloadQuality(_ url: String) async {
        isProcessing = true
        statusSubtitle = "Đang tải về Album Ảnh iPhone..."
        do {
            try await VideoExtractorService.shared.downloadAndSaveToCameraRoll(from: url)
            isProcessing = false
            isSuccess = true
            statusTitle = "Đã Lưu Vào Album Ảnh!"
            statusSubtitle = "✅ Video đã được lưu vào ứng dụng Ảnh (Photos)."
            try? await Task.sleep(nanoseconds: 1_300_000_000)
            onDismiss()
        } catch {
            isProcessing = false
            statusSubtitle = "⚠️ \(error.localizedDescription)"
        }
    }

    private func extractSharedText() async -> String? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        for item in items {
            guard let attachments = item.attachments else { continue }
            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    if let item = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) {
                        if let url = item as? URL {
                            return url.absoluteString
                        }
                        if let nsUrl = item as? NSURL, let str = nsUrl.absoluteString {
                            return str
                        }
                    }
                }
                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if let item = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) {
                        if let text = item as? String {
                            return text
                        }
                        if let nsText = item as? NSString {
                            return String(nsText)
                        }
                    }
                }
            }
        }
        return nil
    }
}
