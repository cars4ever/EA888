# The JavaScript bridge is called by name from the WebView.
-keepclassmembers class nl.randy.ea888lab.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
