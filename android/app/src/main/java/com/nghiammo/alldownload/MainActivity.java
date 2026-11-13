package com.nghiammo.alldownload;

import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progressBar;
    private String pendingSharedUrl = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        progressBar = findViewById(R.id.progressBar);

        setupWebView();
        handleIntent(getIntent());

        // Tải giao diện ứng dụng từ thư mục assets nội bộ (Chạy độc lập 100% không cần bật PC)
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                pendingSharedUrl = sharedText.trim();
                dispatchPendingUrl();
            }
        }
    }

    private void dispatchPendingUrl() {
        if (pendingSharedUrl != null && webView != null) {
            String js = "javascript:(function(){" +
                    "if(typeof window.onSharedUrlReceived === 'function'){" +
                    "  window.onSharedUrlReceived('" + escapeJs(pendingSharedUrl) + "');" +
                    "} else {" +
                    "  setTimeout(function(){ if(typeof window.onSharedUrlReceived === 'function') window.onSharedUrlReceived('" + escapeJs(pendingSharedUrl) + "'); }, 1000);" +
                    "}" +
                    "})();";
            webView.evaluateJavascript(js, null);
        }
    }

    private String escapeJs(String text) {
        return text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "");
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDatabaseEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " NghiaMMO_AndroidApp/1.0");

        // Cầu nối giao tiếp 2 chiều giữa WebView và Hệ điều hành Android Native
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidApp");

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(ProgressBar.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(ProgressBar.GONE);
                    dispatchPendingUrl();
                }
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    // Nếu người dùng bấm mở link ngoài hoặc link iCloud, mở bằng trình duyệt hệ thống
                    if (url.contains("icloud.com") || url.contains("shortcuts")) {
                        try {
                            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                            startActivity(browserIntent);
                            return true;
                        } catch (Exception ignored) {}
                    }
                }
                return false;
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // Class cầu nối giao tiếp Native
    public static class WebAppInterface {
        private final Context context;

        public WebAppInterface(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void downloadVideo(String url, String fileName, String title) {
            if (url == null || !url.startsWith("http")) {
                Toast.makeText(context, "Link video không hợp lệ!", Toast.LENGTH_SHORT).show();
                return;
            }

            try {
                DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));

                String cleanName = (fileName != null && !fileName.isEmpty()) ? fileName : ("NghiaMMO_" + System.currentTimeMillis() + ".mp4");
                if (!cleanName.endsWith(".mp4") && !cleanName.endsWith(".mp3")) {
                    cleanName += ".mp4";
                }

                request.setTitle(title != null ? title : cleanName);
                request.setDescription("Đang lưu vào thư viện Video điện thoại...");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_MOVIES, cleanName);

                // Thêm Referer phù hợp
                if (url.contains("tiktok") || url.contains("tikwm")) {
                    request.addRequestHeader("Referer", "https://www.tikwm.com/");
                } else if (url.contains("facebook")) {
                    request.addRequestHeader("Referer", "https://www.facebook.com/");
                }

                if (dm != null) {
                    dm.enqueue(request);
                    Toast.makeText(context, "🚀 Đang tải video về Album / Thư viện máy: " + cleanName, Toast.LENGTH_LONG).show();
                }
            } catch (Exception e) {
                // Fallback nếu không ghi được vào DIRECTORY_MOVIES
                try {
                    DownloadManager dm = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "NghiaMMO_" + System.currentTimeMillis() + ".mp4");
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    if (dm != null) {
                        dm.enqueue(request);
                        Toast.makeText(context, "Đang tải về mục Tải Về (Downloads)...", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception ex) {
                    Toast.makeText(context, "Lỗi tải: " + ex.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        }

        @JavascriptInterface
        public void copyToClipboard(String text) {
            ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData clip = ClipData.newPlainText("URL", text);
            if (clipboard != null) {
                clipboard.setPrimaryClip(clip);
                Toast.makeText(context, "Đã sao chép liên kết!", Toast.LENGTH_SHORT).show();
            }
        }

        @JavascriptInterface
        public void showToast(String message) {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
        }
    }
}
