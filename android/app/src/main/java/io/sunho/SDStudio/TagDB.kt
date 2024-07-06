package io.sunho.SDStudio

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(name = "TagDB")
class TagDB : Plugin() {
  private val sdsNative = SDSNative()

  @PluginMethod
  fun createDB(call: PluginCall) {
    val name = call.getString("name")
    if (name == null) {
      call.reject("Must provide a name")
      return
    }
    val id = sdsNative.createDB(name)
    val ret = JSObject()
    ret.put("id", id)
    call.resolve(ret)
  }

  @PluginMethod
  fun search(call: PluginCall) {
    val id = call.getInt("id")
    val query = call.getString("query")
    if (id == null || query == null) {
      call.reject("Must provide id and query")
      return
    }
    val results = sdsNative.search(id, query)
    val resultArray = JSArray()
    for (result in results) {
      val obj = JSObject()
      obj.put("normalized", result.normalized)
      obj.put("shortened", result.shortened)
      obj.put("word", result.word)
      obj.put("redirect", result.redirect)
      obj.put("freq", result.freq)
      obj.put("priority", result.priority)
      obj.put("category", result.category)
      resultArray.put(obj)
    }
    val ret = JSObject()
    ret.put("results", resultArray)
    call.resolve(ret)
  }

  @PluginMethod
  fun loadDB(call: PluginCall) {
    val id = call.getInt("id")
    val path = call.getString("path")
    if (id == null || path == null) {
      call.reject("Must provide id and path")
      return
    }
    sdsNative.loadDB(id, path)
    call.resolve()
  }

  @PluginMethod
  fun releaseDB(call: PluginCall) {
    val id = call.getInt("id")
    if (id == null) {
      call.reject("Must provide id")
      return
    }
    sdsNative.releaseDB(id)
    call.resolve()
  }
}
