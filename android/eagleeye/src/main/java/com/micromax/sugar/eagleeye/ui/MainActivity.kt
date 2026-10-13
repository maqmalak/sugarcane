package com.micromax.sugar.eagleeye.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

class MainActivity : ComponentActivity() {
    private val vm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) = vm.onBackground()
            override fun onStart(owner: LifecycleOwner) = vm.onForeground()
        })
        vm.resumeTracking()
        setContent { EagleEyeTheme { Root(vm) } }
    }
}

@Composable
fun Root(vm: AppViewModel) {
    val locked by vm.locked.collectAsState()
    val nav = rememberNavController()
    val start = when {
        !vm.repo.session.isSignedIn -> "login"
        vm.repo.session.pinHash == null -> "pin"
        else -> "home"
    }
    if (locked && vm.repo.session.isSignedIn) {
        LockScreen(vm)
        return
    }
    NavHost(navController = nav, startDestination = start) {
        composable("login") { LoginScreen(vm) { nav.navigate(if (vm.repo.session.pinHash == null) "pin" else "home") { popUpTo("login") { inclusive = true } } } }
        composable("pin") { SetPinScreen(vm) { nav.navigate("home") { popUpTo("pin") { inclusive = true } } } }
        composable("home") {
            HomeScreen(vm,
                openSurvey = { uuid -> nav.navigate("survey/$uuid") },
                openSettings = { nav.navigate("settings") })
        }
        composable("survey/{uuid}", arguments = listOf(navArgument("uuid") { type = NavType.StringType })) { entry ->
            SurveyScreen(vm, entry.arguments?.getString("uuid")!!) { nav.popBackStack() }
        }
        composable("settings") {
            SettingsScreen(vm, back = { nav.popBackStack() }, signedOut = {
                nav.navigate("login") { popUpTo(0) { inclusive = true } }
            })
        }
    }
}
