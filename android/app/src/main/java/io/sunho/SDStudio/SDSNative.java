package io.sunho.SDStudio;

public class SDSNative {
  static {
    System.loadLibrary("native");
  }

  public native int createDB(String name);
  public native Word[] search(int id, String input);
  public native void loadDB(int id, String path);
  public native void releaseDB(int id);
}
