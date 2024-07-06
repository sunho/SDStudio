#include "jni_def.h"

const int INITIAL_CUTOFF = 1600;
const int FINAL_CUTOF = 256;

#include "../../../../../src/native/tagdb.hpp"

DatabaseRepository dbRepo;

JNIEXPORT jint JNICALL Java_io_sunho_SDStudio_SDSNative_createDB(JNIEnv *env, jobject, jstring input) {
    const char *name = env->GetStringUTFChars(input, 0);
    dbRepo.create(std::string(name));
    env->ReleaseStringUTFChars(input, name);
    return dbRepo.nextId - 1;
}

JNIEXPORT jobjectArray JNICALL Java_io_sunho_SDStudio_SDSNative_search(JNIEnv *env, jobject, jint id, jstring input) {
    const char *searchTerm = env->GetStringUTFChars(input, 0);
    Database& db = dbRepo.get(id);
    std::vector<Word> result = db.search(searchTerm);
    env->ReleaseStringUTFChars(input, searchTerm);

    jclass wordClass = env->FindClass("io/sunho/SDStudio/Word");
    jobjectArray output = env->NewObjectArray(result.size(), wordClass, nullptr);


    jmethodID wordConstructor = env->GetMethodID(wordClass, "<init>", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;III)V");

    for (size_t i = 0; i < result.size(); i++) {
        jstring normalized = env->NewStringUTF(utf16ToUtf8(result[i].normalized).c_str());
        jstring shortened = env->NewStringUTF(utf16ToUtf8(result[i].shortened).c_str());
        jstring word = env->NewStringUTF(utf16ToUtf8(result[i].word).c_str());
        jstring redirect = env->NewStringUTF(utf16ToUtf8(result[i].redirect).c_str());

        jobject wordObj = env->NewObject(wordClass, wordConstructor, normalized, shortened, word, redirect, result[i].freq, result[i].priority, result[i].category);
        env->SetObjectArrayElement(output, i, wordObj);

        env->DeleteLocalRef(normalized);
        env->DeleteLocalRef(shortened);
        env->DeleteLocalRef(word);
        env->DeleteLocalRef(redirect);
        env->DeleteLocalRef(wordObj);
    }

    return output;
}

JNIEXPORT void JNICALL Java_io_sunho_SDStudio_SDSNative_loadDB(JNIEnv *env, jobject, jint id, jstring input) {
    const char *path = env->GetStringUTFChars(input, 0);
    Database& db = dbRepo.get(id);
    db.load(std::string(path));
    env->ReleaseStringUTFChars(input, path);
}

JNIEXPORT void JNICALL Java_io_sunho_SDStudio_SDSNative_releaseDB(JNIEnv *env, jobject, jint id) {
    dbRepo.release(id);
}
