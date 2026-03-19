package com.browseris.model;

public class UserScript {
    public final String id;
    public final String name;
    public final String match;
    public final String runAt; // "dom-ready" | "did-finish-load"
    public final boolean enabled;
    public final String code;

    public UserScript(String id, String name, String match, String runAt, boolean enabled, String code) {
        this.id = id;
        this.name = name;
        this.match = match;
        this.runAt = runAt;
        this.enabled = enabled;
        this.code = code;
    }
}

