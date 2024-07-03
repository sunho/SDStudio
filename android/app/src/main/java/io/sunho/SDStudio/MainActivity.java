package io.sunho.SDStudio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import io.sunho.SDStudio.FetchService;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(FetchService.class);
    super.onCreate(savedInstanceState);
  }
}
