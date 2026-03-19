package com.browseris.ui;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.text.InputType;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.CookieManager;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.browseris.R;
import com.browseris.data.LocalStore;
import com.browseris.model.UserScript;
import com.browseris.util.UrlMatch;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends AppCompatActivity {
    private LocalStore store;
    private WebView web;
    private EditText etUrl;
    private TextView tvHint;

    private String lastUrl = "https://example.com";
    private String domReadyPromptedForUrl = null;

    private static final String[] DEFAULT_AD_HOSTS = new String[]{
            "doubleclick.net",
            "googlesyndication.com",
            "googleadservices.com",
            "adservice.google.com",
            "adsystem.com",
            "adnxs.com",
            "taboola.com",
            "outbrain.com",
            "scorecardresearch.com",
            "facebook.net",
            "amazon-adsystem.com"
    };

    private static String defaultHideAdsCss() {
        return "/* generic ad containers */\n" +
                "[id*=\"ad\" i],[class*=\"ad\" i],\n" +
                "[id*=\"ads\" i],[class*=\"ads\" i],\n" +
                "[id*=\"sponsor\" i],[class*=\"sponsor\" i],\n" +
                "[id*=\"promoted\" i],[class*=\"promoted\" i],\n" +
                "[id*=\"promo\" i],[class*=\"promo\" i],\n" +
                "[aria-label*=\"ad\" i],[aria-label*=\"sponsored\" i],\n" +
                "iframe[src*=\"ads\" i],iframe[id*=\"ad\" i],iframe[class*=\"ad\" i],\n" +
                "div[data-ad],section[data-ad],.adsbygoogle{display:none !important;}\n";
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        store = new LocalStore(this);
        lastUrl = store.getLastUrl();
        web = findViewById(R.id.web);
        etUrl = findViewById(R.id.etUrl);
        tvHint = findViewById(R.id.tvHint);

        ImageButton btnBack = findViewById(R.id.btnBack);
        ImageButton btnGo = findViewById(R.id.btnGo);
        ImageButton btnScripts = findViewById(R.id.btnScripts);

        btnBack.setOnClickListener(v -> {
            if (web.canGoBack()) web.goBack();
        });
        btnGo.setOnClickListener(v -> goFromInput());
        btnScripts.setOnClickListener(v -> startActivity(new Intent(this, ScriptsActivity.class)));
        btnScripts.setOnLongClickListener(v -> {
            openAdblockSettings();
            return true;
        });

        etUrl.setText(lastUrl);
        etUrl.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId == EditorInfo.IME_ACTION_GO || enter) {
                goFromInput();
                return true;
            }
            return false;
        });

        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.setWebChromeClient(new WebChromeClient());

        // Anti-trace: cookies
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, !store.getBlockThirdPartyCookiesEnabled());

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    if (!store.getAdblockEnabled()) return super.shouldInterceptRequest(view, request);
                    String u = request.getUrl() == null ? "" : request.getUrl().toString();
                    String host = UrlMatch.hostFromUrl(u).toLowerCase(Locale.US);
                    if (host.isEmpty()) return super.shouldInterceptRequest(view, request);

                    if (isBlockedHost(host)) {
                        // Return empty response to cancel. MVP: generic.
                        return new WebResourceResponse("text/plain", "utf-8", 204, "No Content", null,
                                new ByteArrayInputStream(new byte[0]));
                    }
                } catch (Throwable ignored) {
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                try {
                    String url = request.getUrl() == null ? "" : request.getUrl().toString();
                    if (store.getAntiHijackEnabled() && isDangerousScheme(url)) {
                        // block by default
                        return true;
                    }
                } catch (Throwable ignored) {
                }
                return false;
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                lastUrl = url;
                store.setLastUrl(url);
                etUrl.setText(url);
                domReadyPromptedForUrl = null;
                updateHint(url);
                maybeRunScripts(url, "dom-ready");
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                maybeRunScripts(url, "did-finish-load");
            }
        });

        web.loadUrl(lastUrl);
    }

    private void goFromInput() {
        String url = UrlMatch.normalizeUrl(etUrl.getText() == null ? "" : etUrl.getText().toString());
        lastUrl = url;
        web.loadUrl(url);
    }

    private void updateHint(String url) {
        String host = UrlMatch.hostFromUrl(url);
        boolean alwaysAllow = !host.isEmpty() && store.getAlwaysAllow(host);
        boolean ad = store.getAdblockEnabled();
        boolean hijack = store.getAntiHijackEnabled();
        boolean tpc = store.getBlockThirdPartyCookiesEnabled();
        tvHint.setText("站点：" + (host.isEmpty() ? "—" : host) + "  |  " +
                (alwaysAllow ? "脚本：总是允许" : "脚本：询问") +
                "  |  AdBlock：" + (ad ? "开" : "关") +
                "  |  反劫持：" + (hijack ? "开" : "关") +
                "  |  3P Cookie：" + (tpc ? "关" : "开"));
    }

    private void maybeRunScripts(String url, String runAt) {
        if ("dom-ready".equals(runAt)) {
            if (url != null && url.equals(domReadyPromptedForUrl)) return;
            domReadyPromptedForUrl = url;
        }

        if (url == null) return;
        String host = UrlMatch.hostFromUrl(url);
        if (host.isEmpty()) return;

        List<UserScript> matched = new ArrayList<>();
        for (UserScript s : store.getScripts()) {
            if (!s.enabled) continue;
            if (!runAt.equals(s.runAt)) continue;
            if (!UrlMatch.matchPattern(url, s.match)) continue;
            matched.add(s);
        }

        // Hide ads (cosmetic): inject CSS early to remove ad containers.
        if ("dom-ready".equals(runAt) && store.getHideAdsEnabled()) {
            injectHideAdsCss();
        }
        // Auto skip ad countdown/skip buttons when ad filtering is enabled.
        if ("dom-ready".equals(runAt) && store.getAutoSkipAdsEnabled() && (store.getAdblockEnabled() || store.getHideAdsEnabled())) {
            injectAutoSkipAds();
        }

        if (matched.isEmpty()) return;
        if (store.getAlwaysAllow(host)) {
            injectAll(matched);
            return;
        }
        promptForScripts(url, host, matched);
    }

    private void promptForScripts(String url, String host, List<UserScript> scripts) {
        StringBuilder names = new StringBuilder();
        for (UserScript s : scripts) {
            names.append("• ").append(s.name).append(" (").append(s.match).append(")").append("\n");
        }

        new AlertDialog.Builder(this)
                .setTitle("此网站请求运行脚本")
                .setMessage("站点：" + host + "\nURL：" + url + "\n\n将要运行：\n" + names + "\n安全提示：脚本可读取/修改网页内容。")
                .setNegativeButton("阻止", (d, w) -> d.dismiss())
                .setNeutralButton("允许一次", (d, w) -> {
                    d.dismiss();
                    injectAll(scripts);
                })
                .setPositiveButton("总是允许", (d, w) -> {
                    d.dismiss();
                    store.setAlwaysAllow(host, true);
                    updateHint(url);
                    injectAll(scripts);
                })
                .show();
    }

    private void injectAll(List<UserScript> scripts) {
        for (UserScript s : scripts) {
            String wrapped = "(function(){\n" + s.code + "\n})();";
            web.evaluateJavascript(wrapped, null);
        }
    }

    private void injectHideAdsCss() {
        String css = defaultHideAdsCss() + "\n" + store.getHideAdsCss();
        // Inject <style> to hide containers.
        String js = "(function(){try{var css=" + toJsString(css) + ";" +
                "var id='__browser_is_hide_ads';" +
                "var el=document.getElementById(id);" +
                "if(!el){el=document.createElement('style');el.id=id;document.documentElement.appendChild(el);}"+
                "el.textContent=css;}catch(e){}})();";
        web.evaluateJavascript(js, null);
    }

    private void injectAutoSkipAds() {
        String js = "(function(){try{" +
                "if(window.__browser_is_autoskip_installed)return;window.__browser_is_autoskip_installed=true;" +
                "var KEY=['跳过','跳過','跳过广告','跳過廣告','Skip','Skip Ad','Skip Ads','关闭','關閉','关闭广告','關閉廣告','Close','Dismiss'];" +
                "function vis(el){if(!el||!el.getBoundingClientRect)return false;var r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;" +
                "var s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0';}" +
                "function txt(el){return ((el.innerText||el.getAttribute('aria-label')||el.title||el.getAttribute('title')||'')+'').trim();}" +
                "function match(t){t=(t||'').toLowerCase();for(var i=0;i<KEY.length;i++){if(t.indexOf(KEY[i].toLowerCase())>=0)return true;}return false;}" +
                "function tryClick(el){if(!vis(el))return false;var t=txt(el);if(!t||!match(t))return false;try{el.click();return true;}catch(e){return false;}}" +
                "var hard=['.ytp-ad-skip-button','.ytp-ad-skip-button-modern','[class*=\"skip\" i][class*=\"ad\" i]','[aria-label*=\"skip\" i]','[class*=\"close\" i][class*=\"ad\" i]','[aria-label*=\"close\" i]'];" +
                "function hide(){var sel=['[class*=\"ad\" i][class*=\"overlay\" i]','[class*=\"ad\" i][class*=\"layer\" i]','[class*=\"ad\" i][class*=\"modal\" i]','[id*=\"ad\" i][id*=\"overlay\" i]','[class*=\"countdown\" i][class*=\"ad\" i]','[id*=\"countdown\" i][id*=\"ad\" i]'];" +
                "document.querySelectorAll(sel.join(',')).forEach(function(el){if(vis(el))el.style.setProperty('display','none','important');});}" +
                "function scan(){" +
                "for(var i=0;i<hard.length;i++){document.querySelectorAll(hard[i]).forEach(function(el){tryClick(el);});}" +
                "document.querySelectorAll('button,[role=\"button\"],a').forEach(function(el){tryClick(el);});" +
                "hide();" +
                "}" +
                "scan();new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true,attributes:true});setInterval(scan,900);" +
                "}catch(e){}})();";
        web.evaluateJavascript(js, null);
    }

    private static String toJsString(String s) {
        if (s == null) return "\"\"";
        String out = s
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n");
        return "\"" + out + "\"";
    }

    private boolean isBlockedHost(String host) {
        // 1) custom hosts (one per line); supports suffix match
        String raw = store.getAdblockHostsRaw();
        if (raw != null && !raw.trim().isEmpty()) {
            String[] lines = raw.split("\n");
            for (String line : lines) {
                String h = line.trim().toLowerCase(Locale.US);
                if (h.isEmpty() || h.startsWith("#")) continue;
                if (host.equals(h) || host.endsWith("." + h)) return true;
            }
        }
        // 2) built-in defaults
        for (String h : DEFAULT_AD_HOSTS) {
            if (host.equals(h) || host.endsWith("." + h)) return true;
        }
        return false;
    }

    private boolean isDangerousScheme(String url) {
        if (url == null) return false;
        String u = url.toLowerCase(Locale.US);
        return u.startsWith("intent:") ||
                u.startsWith("market:") ||
                u.startsWith("tel:") ||
                u.startsWith("sms:") ||
                u.startsWith("mailto:") ||
                u.startsWith("file:");
    }

    private void openAdblockSettings() {
        // MVP: AdBlock + anti-hijack/anti-trace toggles + custom host list editor
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24, 16, 24, 0);

        CheckBox cb = new CheckBox(this);
        cb.setText("启用广告拦截（按域名拦请求）");
        cb.setChecked(store.getAdblockEnabled());

        CheckBox cbHijack = new CheckBox(this);
        cbHijack.setText("启用反劫持（阻止 intent/tel/market/file 等跳转）");
        cbHijack.setChecked(store.getAntiHijackEnabled());

        CheckBox cb3p = new CheckBox(this);
        cb3p.setText("阻止第三方 Cookie（反追踪）");
        cb3p.setChecked(store.getBlockThirdPartyCookiesEnabled());

        CheckBox cbHide = new CheckBox(this);
        cbHide.setText("隐藏广告元素（CSS 注入，去掉整块广告位）");
        cbHide.setChecked(store.getHideAdsEnabled());

        CheckBox cbAuto = new CheckBox(this);
        cbAuto.setText("自动跳过广告（点“跳过/关闭/倒计时层”）");
        cbAuto.setChecked(store.getAutoSkipAdsEnabled());

        EditText etCss = new EditText(this);
        etCss.setHint("自定义隐藏 CSS（可选）\n例如：#banner-ad{display:none!important;}");
        etCss.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        etCss.setMinLines(4);
        etCss.setText(store.getHideAdsCss());

        EditText et = new EditText(this);
        et.setHint("自定义拦截域名（每行一个），支持后缀匹配\n例如：ads.example.com 或 example-ads.com");
        et.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        et.setMinLines(6);
        et.setText(store.getAdblockHostsRaw());

        root.addView(cb);
        root.addView(cbHijack);
        root.addView(cb3p);
        root.addView(cbHide);
        root.addView(cbAuto);
        root.addView(etCss);
        root.addView(et);

        new AlertDialog.Builder(this)
                .setTitle("隐私与安全设置")
                .setView(root)
                .setNegativeButton("取消", null)
                .setPositiveButton("保存", (d, w) -> {
                    store.setAdblockEnabled(cb.isChecked());
                    store.setAntiHijackEnabled(cbHijack.isChecked());
                    store.setBlockThirdPartyCookiesEnabled(cb3p.isChecked());
                    store.setHideAdsEnabled(cbHide.isChecked());
                    store.setAutoSkipAdsEnabled(cbAuto.isChecked());
                    store.setHideAdsCss(etCss.getText() == null ? "" : etCss.getText().toString());
                    store.setAdblockHostsRaw(et.getText() == null ? "" : et.getText().toString());
                    CookieManager.getInstance().setAcceptThirdPartyCookies(web, !store.getBlockThirdPartyCookiesEnabled());
                    updateHint(lastUrl);
                })
                .show();
    }
}

