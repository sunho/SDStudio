package io.sunho.SDStudio;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.*;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream;
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.*;
import java.util.List;

@CapacitorPlugin(name = "ZipService")
public class ZipService extends Plugin {

  @PluginMethod
  public void zipFiles(PluginCall call) {
    try {
      String outPath = call.getString("outPath");
      List<JSONObject> files = call.getArray("files").toList();
      FileOutputStream fos = new FileOutputStream(outPath);
      BufferedOutputStream bos = new BufferedOutputStream(fos);
      //GzipCompressorOutputStream gzipOut = new GzipCompressorOutputStream(bos);
      TarArchiveOutputStream tarOut = new TarArchiveOutputStream(bos);

      for (JSONObject file : files) {
        String fileName = file.getString("name");
        String filePath = file.getString("path");
        addFileToTar(tarOut, filePath, fileName);
      }

      tarOut.finish();
      tarOut.close();
      call.resolve();
    } catch (IOException | JSONException e) {
      call.reject("Failed to zip files", e);
    }
  }

  private void addFileToTar(TarArchiveOutputStream tarOut, String filePath, String entryName) throws IOException {
    File file = new File(filePath);
    TarArchiveEntry tarEntry = new TarArchiveEntry(file, entryName);
    tarEntry.setSize(file.length());
    tarOut.putArchiveEntry(tarEntry);

    BufferedInputStream bis = new BufferedInputStream(new FileInputStream(file));
    byte[] buffer = new byte[1024];
    int read;
    while ((read = bis.read(buffer)) != -1) {
      tarOut.write(buffer, 0, read);
    }
    bis.close();
    tarOut.closeArchiveEntry();
  }

  private InputStream openInputStreamFromUri(Context context, Uri uri) throws IOException {
    if ("file".equalsIgnoreCase(uri.getScheme())) {
      return new FileInputStream(uri.getPath());
    } else if ("content".equalsIgnoreCase(uri.getScheme())) {
      return context.getContentResolver().openInputStream(uri);
    }
    throw new IllegalArgumentException("Unsupported URI scheme: " + uri.getScheme());
  }


  @PluginMethod
  public void unzipFiles(PluginCall call) {

    try {
      String outPath = call.getString("outPath");

      InputStream fis = openInputStreamFromUri(getContext(), Uri.parse(call.getString("zipPath")));
      BufferedInputStream bis = new BufferedInputStream(fis);
      TarArchiveInputStream tarIn = new TarArchiveInputStream(bis);

      TarArchiveEntry entry;
      while ((entry = (TarArchiveEntry) tarIn.getNextEntry()) != null) {
        File destPath = new File(outPath, entry.getName());
        if (entry.isDirectory()) {
          destPath.mkdirs();
        } else {
          destPath.getParentFile().mkdirs();
          OutputStream out = new FileOutputStream(destPath);
          byte[] buffer = new byte[1024];
          int length;
          while ((length = tarIn.read(buffer)) != -1) {
            out.write(buffer, 0, length);
          }
          out.close();
        }
      }
      tarIn.close();
      call.resolve();
    } catch (IOException e) {
      call.reject("Failed to unzip files", e);
    }
  }
}
