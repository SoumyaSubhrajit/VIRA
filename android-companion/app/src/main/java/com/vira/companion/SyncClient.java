package com.vira.companion;

import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

final class SyncClient {
    private final Store store; SyncClient(Store s) { store=s; }
    private static String json(String value) { return "\""+value.replace("\\","\\\\").replace("\"","\\\"").replace("\n"," ")+"\""; }
    private int post(String payload) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(store.server()+"/api/finance/device").openConnection(); c.setRequestMethod("POST"); c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setDoOutput(true); c.setRequestProperty("Content-Type","application/json"); c.setRequestProperty("Authorization","Bearer "+store.token());
        try(OutputStream out=c.getOutputStream()){out.write(payload.getBytes(StandardCharsets.UTF_8));} int code=c.getResponseCode(); c.disconnect(); return code;
    }
    int testConnection() throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(store.server()+"/api/finance/device").openConnection(); c.setRequestMethod("GET"); c.setConnectTimeout(8000); c.setReadTimeout(8000); c.setRequestProperty("Authorization","Bearer "+store.token()); int code=c.getResponseCode(); c.disconnect(); return code;
    }
    void enqueue(String eventId, String packageName, PaymentParser.Payment p, long occurredAt) {
        String payload="{\"eventId\":"+json(eventId)+",\"packageName\":"+json(packageName)+",\"amount\":"+p.amount+",\"direction\":"+json(p.direction)+",\"merchant\":"+json(p.merchant)+",\"occurredAt\":"+json(new java.util.Date(occurredAt).toInstant().toString())+"}";
        new Thread(()->{ synchronized(this) { try { if(store.token().isEmpty()) { remember(payload); return; } flush(); int code=post(payload); if(code<200||code>=300) { if(code>=500||code==408) remember(payload); else Log.w("VIRA", "Capture rejected with HTTP "+code); } } catch(Exception e){ remember(payload); Log.w("VIRA", "Capture queued: "+e.getMessage()); } } },"vira-sync").start();
    }
    private void flush() throws Exception { Set<String> pending=store.pending(), remaining=new HashSet<>(); for(String item:pending) { int code=post(item); if(code<200||code>=300) { if(code>=500||code==408) remaining.add(item); } } store.pending(remaining); }
    private void remember(String payload) { Set<String> pending=store.pending(); if(pending.size()<100) { pending.add(payload); store.pending(pending); } }
}
