# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.micromax.sugar.**$$serializer { *; }
-keepclassmembers class com.micromax.sugar.** { *** Companion; }
-keepclasseswithmembers class com.micromax.sugar.** { kotlinx.serialization.KSerializer serializer(...); }
# Retrofit
-keepattributes Signature, Exceptions
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keep interface com.micromax.sugar.eagleeye.data.EagleEyeApi { *; }
-dontwarn org.osmdroid.**
