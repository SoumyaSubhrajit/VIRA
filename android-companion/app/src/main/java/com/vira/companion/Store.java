package com.vira.companion;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.HashSet;
import java.util.Set;

final class Store {
    private final SharedPreferences prefs;
    Store(Context context) { prefs = context.getSharedPreferences("vira_capture", Context.MODE_PRIVATE); }
    // Default for the current VIRA development PC on the user's private LAN.
    // Physical phones cannot use 10.0.2.2; that address is emulator-only.
    String server() { return prefs.getString("server", "http://192.168.1.4:3100"); }
    String token() { return prefs.getString("token", ""); }
    String packages() { return prefs.getString("packages", "com.google.android.apps.nbu.paisa.user,com.phonepe.app,net.one97.paytm"); }
    void save(String server, String token, String packages) { prefs.edit().putString("server", server.trim().replaceAll("/+$", "")).putString("token", token.trim()).putString("packages", packages.trim()).apply(); }
    Set<String> pending() { return new HashSet<>(prefs.getStringSet("pending", new HashSet<>())); }
    void pending(Set<String> values) { prefs.edit().putStringSet("pending", values).apply(); }
}
