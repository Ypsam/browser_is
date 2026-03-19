package com.browseris.data;

import android.content.Context;
import android.content.SharedPreferences;

import com.browseris.model.UserScript;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class LocalStore {
    private final SharedPreferences prefs;

    public LocalStore(Context context) {
        prefs = context.getSharedPreferences("browser_is", Context.MODE_PRIVATE);
    }

    public List<UserScript> getScripts() {
        String raw = prefs.getString("scripts_json", "[]");
        if (raw == null) raw = "[]";
        ArrayList<UserScript> out = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                out.add(new UserScript(
                        o.getString("id"),
                        o.optString("name", "Untitled Script"),
                        o.optString("match", "*://*/*"),
                        o.optString("runAt", "dom-ready"),
                        o.optBoolean("enabled", true),
                        o.optString("code", "")
                ));
            }
        } catch (Throwable ignored) {
        }
        return out;
    }

    public void upsertScript(UserScript script) {
        List<UserScript> current = new ArrayList<>(getScripts());
        int idx = -1;
        for (int i = 0; i < current.size(); i++) {
            if (current.get(i).id.equals(script.id)) {
                idx = i;
                break;
            }
        }
        if (idx >= 0) current.set(idx, script);
        else current.add(0, script);
        saveScripts(current);
    }

    public void removeScript(String id) {
        List<UserScript> next = new ArrayList<>();
        for (UserScript s : getScripts()) {
            if (!s.id.equals(id)) next.add(s);
        }
        saveScripts(next);
    }

    public void setScriptEnabled(String id, boolean enabled) {
        List<UserScript> next = new ArrayList<>();
        for (UserScript s : getScripts()) {
            if (s.id.equals(id)) next.add(new UserScript(s.id, s.name, s.match, s.runAt, enabled, s.code));
            else next.add(s);
        }
        saveScripts(next);
    }

    public boolean getAlwaysAllow(String host) {
        String raw = prefs.getString("perms_json", "{}");
        if (raw == null) raw = "{}";
        try {
            JSONObject o = new JSONObject(raw);
            JSONObject entry = o.optJSONObject(host);
            return entry != null && entry.optBoolean("alwaysAllow", false);
        } catch (Throwable ignored) {
            return false;
        }
    }

    public void setAlwaysAllow(String host, boolean alwaysAllow) {
        String raw = prefs.getString("perms_json", "{}");
        if (raw == null) raw = "{}";
        try {
            JSONObject o = new JSONObject(raw);
            JSONObject entry = o.optJSONObject(host);
            if (entry == null) entry = new JSONObject();
            entry.put("alwaysAllow", alwaysAllow);
            o.put(host, entry);
            prefs.edit().putString("perms_json", o.toString()).apply();
        } catch (Throwable ignored) {
        }
    }

    public boolean getAdblockEnabled() {
        return prefs.getBoolean("adblock_enabled", true);
    }

    public void setAdblockEnabled(boolean enabled) {
        prefs.edit().putBoolean("adblock_enabled", enabled).apply();
    }

    public String getAdblockHostsRaw() {
        // one host per line
        String raw = prefs.getString("adblock_hosts", "");
        return raw == null ? "" : raw;
    }

    public void setAdblockHostsRaw(String raw) {
        prefs.edit().putString("adblock_hosts", raw == null ? "" : raw).apply();
    }

    public boolean getAntiHijackEnabled() {
        return prefs.getBoolean("anti_hijack_enabled", true);
    }

    public void setAntiHijackEnabled(boolean enabled) {
        prefs.edit().putBoolean("anti_hijack_enabled", enabled).apply();
    }

    public boolean getStripRefererEnabled() {
        return prefs.getBoolean("strip_referer_enabled", true);
    }

    public void setStripRefererEnabled(boolean enabled) {
        prefs.edit().putBoolean("strip_referer_enabled", enabled).apply();
    }

    public boolean getBlockThirdPartyCookiesEnabled() {
        return prefs.getBoolean("block_third_party_cookies", true);
    }

    public void setBlockThirdPartyCookiesEnabled(boolean enabled) {
        prefs.edit().putBoolean("block_third_party_cookies", enabled).apply();
    }

    public boolean getHideAdsEnabled() {
        return prefs.getBoolean("hide_ads_enabled", true);
    }

    public void setHideAdsEnabled(boolean enabled) {
        prefs.edit().putBoolean("hide_ads_enabled", enabled).apply();
    }

    public String getHideAdsCss() {
        String raw = prefs.getString("hide_ads_css", "");
        return raw == null ? "" : raw;
    }

    public void setHideAdsCss(String css) {
        prefs.edit().putString("hide_ads_css", css == null ? "" : css).apply();
    }

    public boolean getAutoSkipAdsEnabled() {
        return prefs.getBoolean("auto_skip_ads_enabled", true);
    }

    public void setAutoSkipAdsEnabled(boolean enabled) {
        prefs.edit().putBoolean("auto_skip_ads_enabled", enabled).apply();
    }

    public boolean getProxyEnabled() {
        return prefs.getBoolean("proxy_enabled", false);
    }

    public void setProxyEnabled(boolean enabled) {
        prefs.edit().putBoolean("proxy_enabled", enabled).apply();
    }

    public String getProxyUrl() {
        String raw = prefs.getString("proxy_url", "");
        return raw == null ? "" : raw;
    }

    public void setProxyUrl(String url) {
        prefs.edit().putString("proxy_url", url == null ? "" : url).apply();
    }

    public String getLastUrl() {
        String raw = prefs.getString("last_url", "https://example.com");
        return raw == null ? "https://example.com" : raw;
    }

    public void setLastUrl(String url) {
        if (url == null || url.trim().isEmpty()) return;
        prefs.edit().putString("last_url", url).apply();
    }

    private void saveScripts(List<UserScript> scripts) {
        JSONArray arr = new JSONArray();
        try {
            for (UserScript s : scripts) {
                JSONObject o = new JSONObject();
                o.put("id", s.id);
                o.put("name", s.name);
                o.put("match", s.match);
                o.put("runAt", s.runAt);
                o.put("enabled", s.enabled);
                o.put("code", s.code);
                arr.put(o);
            }
        } catch (Throwable ignored) {
        }
        prefs.edit().putString("scripts_json", arr.toString()).apply();
    }
}

