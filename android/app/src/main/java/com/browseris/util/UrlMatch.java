package com.browseris.util;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

public final class UrlMatch {
    private UrlMatch() {}

    public static String normalizeUrl(String input) {
        String trimmed = input == null ? "" : input.trim();
        if (trimmed.isEmpty()) return "https://example.com";
        if (trimmed.regionMatches(true, 0, "http://", 0, 7) || trimmed.regionMatches(true, 0, "https://", 0, 8)) {
            return trimmed;
        }
        boolean looksLikeDomain = trimmed.matches("^[\\w-]+\\.[\\w.-]+.*$");
        if (looksLikeDomain) return "https://" + trimmed;
        return "https://www.google.com/search?q=" + URLEncoder.encode(trimmed, StandardCharsets.UTF_8);
    }

    public static String hostFromUrl(String url) {
        try {
            String host = URI.create(url).getHost();
            return host == null ? "" : host;
        } catch (Throwable ignored) {
            return "";
        }
    }

    public static boolean matchPattern(String url, String pattern) {
        if (pattern == null || pattern.isEmpty() || "*".equals(pattern)) return true;
        StringBuilder escaped = new StringBuilder();
        for (int i = 0; i < pattern.length(); i++) {
            char ch = pattern.charAt(i);
            if (ch == '*') escaped.append(".*");
            else if (".+?^${}()|[]\\".indexOf(ch) >= 0) escaped.append("\\").append(ch);
            else escaped.append(ch);
        }
        Pattern re = Pattern.compile("^" + escaped + "$", Pattern.CASE_INSENSITIVE);
        return re.matcher(url).matches();
    }
}

