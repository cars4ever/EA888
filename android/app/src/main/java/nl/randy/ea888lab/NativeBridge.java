package nl.randy.ea888lab;

import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;

/**
 * Small, explicit API for the web app (window.EA888Native). Only the app's own origin is ever loaded in
 * the WebView, so no third-party page can reach it. Every method validates its input.
 */
public class NativeBridge {
    private final MainActivity activity;
    private String pendingSave;

    NativeBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public int apiVersion() { return 1; }

    @JavascriptInterface
    public String appVersion() { return BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")"; }

    /** Opens the system "save as" dialog; the result arrives in window.__ea888OnFileSaved(ok). */
    @JavascriptInterface
    public void saveFile(String suggestedName, String content) {
        if (content == null || content.length() > 5_000_000) return;
        String name = suggestedName == null ? "ea888-lab-backup.json" : suggestedName.replaceAll("[^A-Za-z0-9._-]", "_");
        synchronized (this) { pendingSave = content; }
        activity.runOnUiThread(() -> activity.createDocument.launch(name));
    }

    synchronized String takePendingSave() {
        String s = pendingSave;
        pendingSave = null;
        return s;
    }

    /** Opens the system file picker; the text arrives in window.__ea888OnFileOpened(textOrNull). */
    @JavascriptInterface
    public void openFile() {
        activity.runOnUiThread(() -> activity.openDocument.launch(new String[] {"application/json", "text/plain", "application/octet-stream"}));
    }

    @JavascriptInterface
    public void keepScreenOn(boolean on) { activity.setKeepScreenOn(on); }

    /** Short haptic tick with the platform's effect; falls back to navigator.vibrate in the page. */
    @JavascriptInterface
    public void haptic(int ms) {
        Vibrator v = activity.getSystemService(Vibrator.class);
        if (v == null || !v.hasVibrator()) return;
        int dur = Math.max(1, Math.min(ms, 400));
        if (Build.VERSION.SDK_INT >= 29 && dur <= 12) v.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK));
        else v.vibrate(VibrationEffect.createOneShot(dur, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
