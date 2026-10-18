pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "MicroMaxSugar"
// shared code for the three field apps; vehicle-tracking and depot-purchase join in Phase 4
include(":core", ":eagleeye", ":elp")
