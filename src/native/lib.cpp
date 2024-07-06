#include <napi.h>

const int INITIAL_CUTOFF = 1600;
const int FINAL_CUTOF = 256;

#include "tagdb.hpp"

class SDSAddOn : public Napi::Addon<SDSAddOn> {
 public:
  DatabaseRepository dbRepo;
  SDSAddOn(Napi::Env env, Napi::Object exports) {
    DefineAddon(exports,
                {InstanceMethod("createDB", &SDSAddOn::createDB, napi_enumerable)});
    DefineAddon(exports,
                {InstanceMethod("search", &SDSAddOn::search, napi_enumerable)});
    DefineAddon(exports,
                {InstanceMethod("loadDB", &SDSAddOn::loadDB, napi_enumerable)});
    DefineAddon(exports,
                {InstanceMethod("releaseDB", &SDSAddOn::releaseDB, napi_enumerable)});
  }

 private:
  Napi::Value createDB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::String input = info[0].As<Napi::String>();
    std::string name = input.Utf8Value();
    dbRepo.create(name);
    return Napi::Number::New(env, dbRepo.nextId - 1);
  }

  Napi::Value search(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Number id = info[0].As<Napi::Number>();
    Napi::String input = info[1].As<Napi::String>();
    Database& db = dbRepo.get(id.Int32Value());
    std::vector<Word> result = db.search(input.Utf8Value());
    Napi::Array output = Napi::Array::New(env, result.size());
    for (size_t i = 0; i < result.size(); i++) {
      Napi::Object obj = Napi::Object::New(env);
      obj.Set("normalized", Napi::String::New(env, utf16ToUtf8(result[i].normalized)));
      obj.Set("shortened", Napi::String::New(env, utf16ToUtf8(result[i].shortened)));
      obj.Set("word", Napi::String::New(env, utf16ToUtf8(result[i].word)));
      obj.Set("redirect", Napi::String::New(env, utf16ToUtf8(result[i].redirect)));
      obj.Set("freq", Napi::Number::New(env, result[i].freq));
      obj.Set("priority", Napi::Number::New(env, result[i].priority));
      obj.Set("category", Napi::Number::New(env, result[i].category));
      output[i] = obj;
    }
    return output;
  }

  Napi::Value loadDB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Number id = info[0].As<Napi::Number>();
    Napi::String input = info[1].As<Napi::String>();
    Database& db = dbRepo.get(id.Int32Value());
    db.load(input.Utf8Value());
    return env.Undefined();
  }

  Napi::Value releaseDB(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Number id = info[0].As<Napi::Number>();
    dbRepo.release(id.Int32Value());
    return env.Undefined();
  }
};

NODE_API_ADDON(SDSAddOn)

