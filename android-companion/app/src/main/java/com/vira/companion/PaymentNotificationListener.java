package com.vira.companion;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.app.Notification;
import android.os.Bundle;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public final class PaymentNotificationListener extends NotificationListenerService {
    private Store store; private SyncClient sync;
    @Override public void onListenerConnected() { store=new Store(this); sync=new SyncClient(store); }
    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        if(store==null||sync==null) { store=new Store(this); sync=new SyncClient(store); }
        Set<String> allowed=new HashSet<>(); for(String item:store.packages().split(",")){String value=item.trim(); if(!value.isEmpty()) allowed.add(value);} String pkg=sbn.getPackageName(); if(!allowed.contains(pkg)) return;
        Notification n=sbn.getNotification(); Bundle extras=n.extras; if(extras==null) return; String title=String.valueOf(extras.getCharSequence(Notification.EXTRA_TITLE,"")); String text=String.valueOf(extras.getCharSequence(Notification.EXTRA_TEXT,"")); PaymentParser.Payment payment=PaymentParser.parse(title,text); if(payment==null) return;
        String event=hash(pkg+"|"+sbn.getPostTime()+"|"+title+"|"+text); sync.enqueue(event,pkg,payment,sbn.getPostTime());
    }
    private static String hash(String value) { try { byte[] bytes=MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)); StringBuilder out=new StringBuilder(); for(byte b:bytes) out.append(String.format("%02x",b)); return out.toString(); } catch(Exception e) { return value; } }
}
