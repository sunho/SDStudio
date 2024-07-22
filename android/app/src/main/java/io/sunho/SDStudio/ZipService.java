package io.sunho.SDStudio;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
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


import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

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

//  @PluginMethod
//  public void showDownloads(PluginCall call) {
//    Intent intent=new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS);
//    try {
//      getContext().startActivity(intent);
//      call.resolve();
//    } catch (Exception e) {
//      call.reject("Failed to donwloads folder", e);
//    }
//  }

  @PluginMethod
  public void showFileInFolder(PluginCall call) {
    String filePath = call.getString("filePath");
    if (filePath == null) {
      call.reject("File path must be provided");
      return;
    }

    File file = new File(filePath);
    if (!file.exists()) {
      call.reject("File does not exist");
      return;
    }

    Uri fileUri;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      String authority = getContext().getPackageName() + ".fileprovider";
      fileUri = FileProvider.getUriForFile(getContext(), authority, file);
    } else {
      fileUri = Uri.fromFile(file);
    }

    Intent intent = new Intent(Intent.ACTION_VIEW);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      intent.setDataAndType(fileUri, DocumentsContract.Document.MIME_TYPE_DIR);
    } else {
      intent.setDataAndType(fileUri, "resource/folder");
    }
    intent.putExtra("org.openintents.extra.ABSOLUTE_PATH", filePath);
    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);


    try {
      getContext().startActivity(intent);
      call.resolve();
    } catch (Exception e) {
      call.reject("Failed to show file in folder", e);
    }
  }
}
