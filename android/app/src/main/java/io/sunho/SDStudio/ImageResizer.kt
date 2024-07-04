package io.sunho.SDStudio

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.os.Environment
import android.util.Base64
import android.util.Log
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import com.bumptech.glide.Glide
import com.bumptech.glide.request.FutureTarget
import com.bumptech.glide.request.target.Target
import java.util.concurrent.ExecutionException

@CapacitorPlugin(name = "ImageResizer")
class ImageResizer : Plugin() {

  @PluginMethod
  fun resizeImage(call: PluginCall) {
    val base64Input = call.getString("base64Input")
    val maxWidth = call.getInt("maxWidth")
    val maxHeight = call.getInt("maxHeight")

    if (base64Input == null || maxWidth == null || maxHeight == null) {
      call.reject("Invalid input")
      return
    }

    try {
      // Decode base64 input to Bitmap
      val decodedBytes = Base64.decode(base64Input, Base64.DEFAULT)
      val originalBitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)

      // Resize the bitmap while maintaining aspect ratio using better filtering
      val resizedBitmap = resizeBitmapWithAspectRatio(originalBitmap, maxWidth, maxHeight)

      // Convert the resized bitmap to base64
      val outputStream = ByteArrayOutputStream()
      resizedBitmap.compress(Bitmap.CompressFormat.PNG, 90, outputStream)
      val byteArray = outputStream.toByteArray()
      val base64Output = Base64.encodeToString(byteArray, Base64.DEFAULT)

      // Return the base64 output
      val result = JSObject()
      result.put("base64Output", base64Output)
      call.resolve(result)
    } catch (e: Exception) {
      call.reject("Failed to resize image", e)
    }
  }

  private fun resizeBitmapWithAspectRatio(bitmap: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
    val width = bitmap.width
    val height = bitmap.height

    // Calculate the aspect ratio
    val aspectRatio = width.toFloat() / height.toFloat()

    var newWidth = targetWidth
    var newHeight = targetHeight

    // Adjust the width and height to maintain aspect ratio
    if (width > height) {
      newHeight = (targetWidth / aspectRatio).toInt()
    } else {
      newWidth = (targetHeight * aspectRatio).toInt()
    }

    return resizeBitmap(bitmap, newWidth, newHeight)
  }

  private fun resizeBitmap(bitmap: Bitmap, width: Int, height: Int): Bitmap {
    return try {
      val futureTarget: FutureTarget<Bitmap> = Glide.with(context)
        .asBitmap()
        .load(bitmap)
        .submit(width, height)
      futureTarget.get()
    } catch (e: ExecutionException) {
      throw RuntimeException("Failed to resize image", e)
    } catch (e: InterruptedException) {
      throw RuntimeException("Failed to resize image", e)
    }
  }
}
