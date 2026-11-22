package io.github.abdelrahmansherifmedhat1134.barandtrack;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * Lock-screen controls for a run or a rest: one silent, ongoing notification with a live countdown
 * (Android draws the countdown itself, so nothing has to update it every second) and up to three
 * buttons. Buttons are broadcasts, so they work from the lock screen without unlocking or opening
 * the app; the web app receives them as an "action" event and does the same thing as its own buttons.
 */
@CapacitorPlugin(name = "RunControls")
public class RunControlsPlugin extends Plugin {

    private static final String CHANNEL = "run_controls";
    private static final int NOTIFICATION_ID = 4242;
    private BroadcastReceiver receiver;

    private String actionName() { return getContext().getPackageName() + ".RUN_CONTROL"; }

    @Override
    public void load() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Workout controls", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Countdown and pause/skip buttons on the lock screen during runs and rests");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            ch.enableVibration(false);
            ch.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                JSObject o = new JSObject();
                o.put("action", intent.getStringExtra("action"));
                notifyListeners("action", o, true);
            }
        };
        ContextCompat.registerReceiver(ctx, receiver, new IntentFilter(actionName()), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @PluginMethod
    public void show(PluginCall call) {
        Context ctx = getContext();
        String title = call.getString("title", "Bar & Track");
        String text = call.getString("text", "");
        Long endsAt = call.getLong("endsAt", 0L);
        JSArray actions = call.getArray("actions", new JSArray());

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open != null) open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent content = open == null ? null : PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_bt)
            .setColor(0xFF17876F)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (content != null) b.setContentIntent(content);
        if (endsAt != null && endsAt > System.currentTimeMillis()) {
            b.setWhen(endsAt).setShowWhen(true).setUsesChronometer(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setChronometerCountDown(true);
        } else {
            b.setShowWhen(false);
        }
        int n = 0;
        try {
            for (int i = 0; i < actions.length() && n < 3; i++) {
                JSONObject a = actions.getJSONObject(i);
                Intent it = new Intent(actionName()).setPackage(ctx.getPackageName()).putExtra("action", a.getString("id"));
                PendingIntent pi = PendingIntent.getBroadcast(ctx, 100 + i, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                b.addAction(0, a.getString("label"), pi);
                n++;
            }
        } catch (Exception e) {
            call.reject("Bad actions: " + e.getMessage());
            return;
        }
        if (n > 0) {
            int[] compact = new int[n];
            for (int i = 0; i < n; i++) compact[i] = i;
            b.setStyle(new androidx.media.app.NotificationCompat.MediaStyle().setShowActionsInCompactView(compact));
        }
        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, b.build());
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Notifications are not allowed");
        }
    }

    @PluginMethod
    public void hide(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) { }
    }
}
