package com.compliancematters.everystep;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Set window background so area behind transparent
        // system bars matches app header color
        getWindow().setBackgroundDrawable(
            new ColorDrawable(Color.parseColor("#0f1f35"))
        );

        // Pad content view away from system bars (Android 15+ fix)
        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content,
            (view, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                );
                view.setPadding(
                    insets.left,
                    insets.top,
                    insets.right,
                    insets.bottom
                );
                return windowInsets;
            }
        );

        // Enable persistent cookies for Supabase session
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(
            getBridge().getWebView(), true
        );
    }

    @Override
    public void onStart() {
        super.onStart();
        // Extend bridge WebChromeClient to add geolocation
        // support without replacing Capacitor's own client
        android.webkit.WebView webView = getBridge().getWebView();
        android.webkit.WebChromeClient existing =
            webView.getWebChromeClient();
        webView.setWebChromeClient(
            new android.webkit.WebChromeClient() {
                @Override
                public void onGeolocationPermissionsShowPrompt(
                    String origin,
                    android.webkit.GeolocationPermissions.Callback callback
                ) {
                    callback.invoke(origin, true, false);
                }

                // Delegate everything else to existing client
                @Override
                public boolean onShowFileChooser(
                    android.webkit.WebView wv,
                    android.webkit.ValueCallback<android.net.Uri[]> filePathCallback,
                    android.webkit.WebChromeClient.FileChooserParams params
                ) {
                    if (existing != null) {
                        return existing.onShowFileChooser(
                            wv, filePathCallback, params
                        );
                    }
                    return false;
                }

                @Override
                public void onPermissionRequest(
                    android.webkit.PermissionRequest request
                ) {
                    if (existing != null) {
                        existing.onPermissionRequest(request);
                    } else {
                        super.onPermissionRequest(request);
                    }
                }

                @Override
                public boolean onConsoleMessage(
                    android.webkit.ConsoleMessage msg
                ) {
                    if (existing != null) {
                        return existing.onConsoleMessage(msg);
                    }
                    return false;
                }
            }
        );
    }

    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
