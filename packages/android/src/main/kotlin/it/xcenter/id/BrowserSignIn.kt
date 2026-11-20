package it.xcenter.id

import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.annotation.MainThread
import androidx.browser.auth.AuthTabIntent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class BrowserRequest(val authorization: Uri, val callback: Uri) {
    init {
        require(authorization.scheme == "https" && authorization.host == "id.xcenter.it")
        require(authorization.encodedPath == "/auth" && authorization.userInfo == null)
        require(authorization.port == -1 && authorization.fragment == null)
        require(callback.scheme == "https" && !callback.host.isNullOrBlank())
        require(callback.query == null && callback.fragment == null && callback.port == -1)
        require(callback.userInfo == null && !callback.encodedPath.isNullOrBlank())
    }

    internal fun matches(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == callback.host && uri.port == -1 &&
            uri.userInfo == null && uri.fragment == null && uri.encodedPath == callback.encodedPath
}

/** Create unconditionally before the activity starts, alongside other result launchers. */
class BrowserSignIn @MainThread constructor(activity: ComponentActivity) {
    private var pending: CompletableDeferred<AuthTabIntent.AuthResult>? = null
    private val launcher = AuthTabIntent.registerActivityResultLauncher(activity) { result ->
        pending?.complete(result)
    }

    suspend fun authorize(request: BrowserRequest): Uri? = withContext(Dispatchers.Main.immediate) {
        check(pending == null) { "A sign-in attempt is still awaiting a browser result." }
        val result = CompletableDeferred<AuthTabIntent.AuthResult>()
        pending = result
        result.invokeOnCompletion {
            if (pending === result) pending = null
        }
        try {
            AuthTabIntent.Builder().build().launch(
                launcher, request.authorization, request.callback.host!!, request.callback.encodedPath!!
            )
        } catch (error: Exception) {
            result.completeExceptionally(error)
        }
        val response = result.await()
        when (response.resultCode) {
            AuthTabIntent.RESULT_CANCELED -> null
            AuthTabIntent.RESULT_OK -> checkNotNull(response.resultUri?.takeIf(request::matches)) {
                "Unexpected X-Center ID callback URL."
            }
            else -> error("The browser could not verify the X-Center ID callback.")
        }
    }
}
