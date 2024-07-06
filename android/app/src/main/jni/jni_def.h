#include <jni.h>

#ifndef ANDROID_JNI_DEF_H
#define ANDROID_JNI_DEF_H
extern "C" {
JNIEXPORT jint JNICALL Java_io_sunho_SDStudio_SDSNative_createDB
        (JNIEnv *, jobject, jstring);

JNIEXPORT jobjectArray JNICALL Java_io_sunho_SDStudio_SDSNative_search
        (JNIEnv *, jobject, jint, jstring);

JNIEXPORT void JNICALL Java_io_sunho_SDStudio_SDSNative_loadDB
(JNIEnv *, jobject, jint, jstring);

JNIEXPORT void JNICALL Java_io_sunho_SDStudio_SDSNative_releaseDB
(JNIEnv *, jobject, jint);

}
#endif //ANDROID_JNI_DEF_H
