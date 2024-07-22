package io.sunho.SDStudio;

import android.app.Application;
import android.content.Context;

import org.acra.ACRA;
import org.acra.config.CoreConfigurationBuilder;
import org.acra.config.DialogConfigurationBuilder;
import org.acra.config.HttpSenderConfiguration;
import org.acra.config.HttpSenderConfigurationBuilder;
import org.acra.data.StringFormat;
import org.acra.sender.HttpSender;

public class MyApplication extends Application {
  @Override
  public void onCreate() {
    super.onCreate();

  }

  @Override
  protected void attachBaseContext(Context base) {
    super.attachBaseContext(base);

    ACRA.init(this, new CoreConfigurationBuilder()
      //core configuration:
      .withBuildConfigClass(BuildConfig.class)
      .withReportFormat(StringFormat.JSON)
      .withPluginConfigurations(
        //each plugin you chose above can be configured with its builder like this:
        new DialogConfigurationBuilder()
          .withText("크래시가 발생했습니다. 디버깅용 리포트를 전송합니까?")
          .build(),
        new HttpSenderConfigurationBuilder()
          .withHttpMethod(HttpSender.Method.POST)
          .withUri("https://ip.sunho.kim/stacktrace")
          .build
            ()
      )
    );
  }
}
