package io.sunho.SDStudio;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;

import io.sunho.SDStudio.FetchService;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(FetchService.class);
    registerPlugin(ImageResizer.class);
    if (Build.VERSION.SDK_INT >= 30) {
      if (!Environment.isExternalStorageManager()) {
        try {
          Uri uri = Uri.parse("package:" + BuildConfig.APPLICATION_ID);
          Intent getpermission = new Intent();
          getpermission.setAction(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
          getpermission.setData(uri);
          startActivity(getpermission);
        } catch (Exception ex) {
          Logger.error(ex.getMessage());
          Intent intent = new Intent();
          intent.setAction(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
          startActivity(intent);
        }
      }
    }
    super.onCreate(savedInstanceState);
  }
}
