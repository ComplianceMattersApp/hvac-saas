package com.compliancematters.everystep;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Persist the Supabase session across cold starts.
        // The session cookie is first-party to app.compliancemattersca.com (the WebView
        // origin), so setAcceptCookie is what keeps the user logged in. Third-party cookies
        // are enabled on the actual bridge WebView (not a throwaway instance, which would be
        // a no-op) so cross-origin flows such as QBO OAuth can round-trip cleanly.
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (getBridge() != null && getBridge().getWebView() != null) {
            cookieManager.setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Flush the in-memory cookie store to disk so the session survives process death.
        CookieManager.getInstance().flush();
    }
}
