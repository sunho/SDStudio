package io.sunho.SDStudio

import android.util.Base64
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

@CapacitorPlugin(name = "FetchService")
class FetchService : Plugin() {
  private val client = OkHttpClient.
    Builder()
    .connectTimeout(60, TimeUnit.SECONDS)
    .readTimeout(60, TimeUnit.SECONDS)
    .writeTimeout(60, TimeUnit.SECONDS)
    .build()

  @PluginMethod
  fun fetchData(call: PluginCall) {
    val url = call.getString("url") ?: return call.reject("Must provide URL")
    val jsonBody = call.getString("body") ?: "{}"
    val headers = call.getString("headers") ?: "{}"

    val mediaType = "application/json; charset=utf-8".toMediaType()
    val body = RequestBody.create(mediaType, jsonBody)

    val requestBuilder = Request.Builder().url(url).post(body)

    // Add headers to the request
    val headersMap = JSONObject(headers)
    headersMap.keys().forEach {
      requestBuilder.addHeader(it, headersMap.getString(it))
    }

    val request = requestBuilder.build()

    client.newCall(request).enqueue(object : Callback {
      override fun onFailure(httpcall: Call, e: IOException) {
        call.reject("Network request failed: ${e.message}")
      }

      override fun onResponse(httpcall: Call, response: Response) {
        if (!response.isSuccessful) {
          call.reject("Network request failed: ${response.code}")
        } else {
          val responseData = response.body?.bytes()
          val blobData = responseData?.let { Base64.encodeToString(it, Base64.DEFAULT) }
          val result = JSObject()
          result.put("data", blobData)
          call.resolve(result)
        }
      }
    })
  }
}
