package com.vira.companion;

import android.app.Activity; import android.os.Bundle; import android.provider.Settings; import android.content.Intent; import android.graphics.Color; import android.net.Uri; import android.view.View; import android.widget.*;

public final class SetupActivity extends Activity {
    private EditText server,token,packages; private Store store;
    private TextView status;
    private int dp(float n){return (int)(n*getResources().getDisplayMetrics().density+.5f);}
    @Override public void onCreate(Bundle state){super.onCreate(state); store=new Store(this); LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(24),dp(26),dp(24),dp(24)); root.setBackgroundColor(Color.rgb(11,13,10));
        TextView title=new TextView(this); title.setText("VIRA CAPTURE"); title.setTextColor(Color.rgb(171,195,55)); title.setTextSize(25); root.addView(title,new LinearLayout.LayoutParams(-1,dp(45)));
        TextView intro=new TextView(this); intro.setText("Background payment capture for your own VIRA ledger. This app reads only selected app notifications and ignores OTP/password messages. It stores no full notification text."); intro.setTextColor(Color.LTGRAY); intro.setTextSize(15); root.addView(intro,new LinearLayout.LayoutParams(-1,dp(95)));
        server=field("VIRA server URL",store.server()); token=field("Device token (set VIRA_DEVICE_TOKEN on server)",store.token()); packages=field("Allowed package IDs (comma separated)",store.packages()); root.addView(server);root.addView(token);root.addView(packages);
        Button save=new Button(this); save.setText("SAVE SETTINGS"); save.setOnClickListener(v->{store.save(server.getText().toString(),token.getText().toString(),packages.getText().toString()); status.setText("Saved. Enable notification access below, then close this screen.");}); root.addView(save,new LinearLayout.LayoutParams(-1,dp(55)));
        Button test=new Button(this); test.setText("TEST CONNECTION"); test.setOnClickListener(v->{store.save(server.getText().toString(),token.getText().toString(),packages.getText().toString()); status.setText("Testing VIRA server…"); new Thread(()->{try{int code=new SyncClient(store).testConnection(); runOnUiThread(()->status.setText(code==200?"Connected. Token accepted. No transaction was created.":"Server rejected the token (HTTP "+code+"). Check the URL and token."));}catch(Exception e){runOnUiThread(()->status.setText("Could not reach VIRA server. Check Wi‑Fi, URL, and Windows Firewall."));}},"vira-test").start();}); root.addView(test,new LinearLayout.LayoutParams(-1,dp(55)));
        Button permission=new Button(this); permission.setText("ENABLE NOTIFICATION ACCESS"); permission.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))); root.addView(permission,new LinearLayout.LayoutParams(-1,dp(55)));
        status=new TextView(this); status.setText("After enabling access, VIRA Capture runs in the background. Android may pause network delivery when offline; queued captures retry on the next payment notification."); status.setTextColor(Color.rgb(171,195,55)); status.setTextSize(13); root.addView(status,new LinearLayout.LayoutParams(-1,dp(95)));
        setContentView(root);
    }
    private EditText field(String hint,String value){ EditText e=new EditText(this);e.setHint(hint);e.setText(value);e.setSingleLine(true);e.setTextColor(Color.WHITE);e.setHintTextColor(Color.GRAY);e.setPadding(dp(12),0,dp(12),0); LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(58));p.setMargins(0,0,0,dp(10));e.setLayoutParams(p);return e; }
}
