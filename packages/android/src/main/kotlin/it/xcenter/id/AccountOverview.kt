package it.xcenter.id

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

data class OverviewProfile(
    val name: String,
    val username: String,
    val picture: Uri? = null,
    val email: String? = null,
    val verified: Boolean = false,
    val administrator: Boolean = false,
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AccountOverview(
    profile: OverviewProfile?,
    clientId: String,
    signIn: suspend () -> Unit,
    signOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
    settings: @Composable ColumnScope.() -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    var details by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun perform(operation: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                operation()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                error = "X-Center ID could not complete this action."
            } finally {
                busy = false
            }
        }
    }

    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("X-Center ID", style = MaterialTheme.typography.titleMedium)
            if (profile == null) {
                Text("Sign in or create an account")
                Button(onClick = { perform(signIn) }, enabled = !busy) { Text("Continue with X-Center ID") }
            } else {
                Identity(profile)
                OutlinedButton(onClick = { details = true }, enabled = !busy) { Text("Manage account & data →") }
            }
            if (!details || profile == null) error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }

    LaunchedEffect(profile == null) {
        if (profile == null) details = false
    }
    if (details && profile != null) {
        ModalBottomSheet(onDismissRequest = { if (!busy) details = false }) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                TextButton(onClick = { details = false }, enabled = !busy) { Text("Back to settings") }
                Identity(profile)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { perform { uriHandler.openUri("https://id.xcenter.it/dashboard") } }, enabled = !busy) {
                        Text("Open dashboard")
                    }
                    if (clientId.isNotBlank()) OutlinedButton(onClick = {
                        perform { uriHandler.openUri("https://id.xcenter.it/permissions/" + Uri.encode(clientId)) }
                    }, enabled = !busy) { Text("Manage app") }
                    TextButton(onClick = { perform { signOut(); details = false } }, enabled = !busy) {
                        Text("Sign out", color = MaterialTheme.colorScheme.error)
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                HorizontalDivider()
                settings()
            }
        }
    }
}

@Composable
private fun Identity(profile: OverviewProfile) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        val photo = profile.picture?.takeIf { it.scheme == "https" && it.userInfo == null }
        SubcomposeAsyncImage(
            model = photo, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(52.dp).clip(CircleShape),
            loading = { Avatar(profile) }, error = { Avatar(profile) },
        )
        Column(Modifier.weight(1f)) {
            Text(profile.name, style = MaterialTheme.typography.titleMedium)
            Text("@" + profile.username)
            profile.email?.let { Text(it) }
            if (profile.verified) Text("✓ Verified profile", style = MaterialTheme.typography.labelMedium)
            if (profile.administrator) Text("◆ Administrator", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun Avatar(profile: OverviewProfile) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.secondaryContainer),
        contentAlignment = Alignment.Center) {
        Text(profile.name.take(1), style = MaterialTheme.typography.titleMedium)
    }
}
