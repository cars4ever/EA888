package nl.randy.ea888lab;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Hosts the EA888 LAB web app. Assets are served from the APK by WebViewAssetLoader on a fixed https origin
 * (no file:// access); navigation never leaves that origin inside the app. Edge-to-edge: the system-bar and
 * cutout insets are passed to CSS as --native-safe-* so the HUD and bottom navigation clear them.
 */
public class MainActivity extends ComponentActivity {
    static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START_URL = ORIGIN + "/assets/index.html";

    private WebView web;
    private NativeBridge bridge;
    private Insets lastInsets = Insets.NONE;

    final ActivityResultLauncher<String> createDocument =
            registerForActivityResult(new ActivityResultContracts.CreateDocument("application/json"), this::onDocumentCreated);
    final ActivityResultLauncher<String[]> openDocument =
            registerForActivityResult(new ActivityResultContracts.OpenDocument(), this::onDocumentOpened);

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        web = new WebView(this);
        web.setBackgroundColor(0xFF07090D);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if (url.toString().startsWith(ORIGIN + "/")) return false;
                // Links to the outside world (vendor pages, sources) open in the browser, not in the app.
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                pushInsets();
            }
        });

        bridge = new NativeBridge(this);
        web.addJavascriptInterface(bridge, "EA888Native");

        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            lastInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            pushInsets();
            return WindowInsetsCompat.CONSUMED;
        });

        // Back: let the game close its own layers first (modal, race, sub-page); leave the app only when it
        // reports that nothing is left to close.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("(window.__ea888HandleBack && window.__ea888HandleBack()) ? 'handled' : 'exit'", result -> {
                    if (result == null || !result.contains("handled")) finish();
                });
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    private void pushInsets() {
        if (web == null) return;
        float d = getResources().getDisplayMetrics().density;
        String js = String.format(java.util.Locale.ROOT,
                "(function(s){s.setProperty('--native-safe-top','%.1fpx');s.setProperty('--native-safe-bottom','%.1fpx');" +
                "s.setProperty('--native-safe-left','%.1fpx');s.setProperty('--native-safe-right','%.1fpx');})(document.documentElement.style)",
                lastInsets.top / d, lastInsets.bottom / d, lastInsets.left / d, lastInsets.right / d);
        web.evaluateJavascript(js, null);
    }

    void setKeepScreenOn(boolean on) {
        runOnUiThread(() -> {
            if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    private void onDocumentCreated(Uri uri) {
        String content = bridge.takePendingSave();
        boolean ok = false;
        if (uri != null && content != null) {
            try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                if (out != null) { out.write(content.getBytes(StandardCharsets.UTF_8)); ok = true; }
            } catch (Exception ignored) { }
        }
        deliver("__ea888OnFileSaved", ok ? "true" : "false");
    }

    private void onDocumentOpened(Uri uri) {
        String text = null;
        if (uri != null) {
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                if (in != null) {
                    StringBuilder sb = new StringBuilder();
                    BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                    char[] buf = new char[8192];
                    int n;
                    while ((n = r.read(buf)) > 0 && sb.length() < 5_000_000) sb.append(buf, 0, n);
                    text = sb.toString();
                }
            } catch (Exception ignored) { }
        }
        deliver("__ea888OnFileOpened", text == null ? "null" : JSONObject.quote(text));
    }

    private void deliver(String fn, String jsonArg) {
        web.post(() -> web.evaluateJavascript("window." + fn + " && window." + fn + "(" + jsonArg + ")", null));
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.evaluateJavascript("window.__ea888OnNativePause && window.__ea888OnNativePause()", null);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
