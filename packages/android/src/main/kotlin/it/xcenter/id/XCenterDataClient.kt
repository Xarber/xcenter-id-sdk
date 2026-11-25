package it.xcenter.id

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import android.util.Base64
import org.json.JSONObject

class XCenterHTTPException(val status: Int, val responseBody: ByteArray, val retryAfter: String?) :
    java.io.IOException("X-Center ID request failed (HTTP $status).")

/** Blocking API. Call on an IO dispatcher or worker thread. */
class XCenterDataClient(private val clientId: String? = null, private val accessToken: (() -> String)? = null) {
    companion object { const val ISSUER = "https://id.xcenter.it" }

    sealed interface RecordSpace {
        data object Own : RecordSpace
        data class Shared(val client: String) : RecordSpace
        data class Public(val client: String) : RecordSpace
    }

    fun discover() = send("/.well-known/openid-configuration", authenticated = false)
    fun userInfo() = send("/me")
    fun avatar() = send("/v1/profile/avatar")
    fun friends() = send("/v1/profile/friends")
    fun publicProfile(username: String) = send("/public/profiles/${handle(username)}", authenticated = false)
    fun publicAvatar(username: String) = send("/public/profiles/${handle(username)}/avatar", authenticated = false)
    fun appIcon(registrationId: String) = send("/public/app-icons/${segment(registrationId, 36)}", authenticated = false)

    fun listRecords(collection: String, space: RecordSpace = RecordSpace.Own, cursor: String? = null) =
        send(recordPath(collection, space) + query("cursor", cursor), authenticated = space !is RecordSpace.Public)

    fun getRecord(collection: String, id: String, space: RecordSpace = RecordSpace.Own) =
        send(recordPath(collection, space) + "/" + segment(id), authenticated = space !is RecordSpace.Public)

    fun putRecord(collection: String, id: String, revision: Long, data: Any?, isPublic: Boolean, readers: List<String>? = null): ByteArray {
        val payload = JSONObject().put("data", data ?: JSONObject.NULL).put("public", isPublic)
        if (readers != null) payload.put("readers", org.json.JSONArray(readers))
        return send(recordPath(collection, RecordSpace.Own) + "/" + segment(id), "PUT", payload, revision)
    }

    fun deleteRecord(collection: String, id: String, revision: Long): ByteArray {
        require(revision > 0) { "Supply the current revision." }
        return send(recordPath(collection, RecordSpace.Own) + "/" + segment(id), "DELETE", revision = revision)
    }

    fun listFiles(folder: String? = null) = send("/v1/files" + query("folder",folder))
    fun downloadFile(id: String) = send("/v1/files/${segment(id,36)}")
    fun listSharedFiles() = send("/v1/files/shared")
    fun downloadSharedFile(id: String) = send("/v1/files/shared/${segment(id,36)}")
    fun createFolder(name: String, parent: String? = null) =
        send("/v1/files/folders","POST",JSONObject().put("name",name).put("folder",parent ?: JSONObject.NULL))

    fun uploadFile(name: String, content: ByteArray, folder: String? = null): ByteArray {
        require(content.size in 1..2*1024*1024) { "Choose a file from 1 byte to 2 MB." }
        return send("/v1/files","POST",JSONObject().put("name",name)
            .put("content",Base64.encodeToString(content,Base64.NO_WRAP)).put("folder",folder ?: JSONObject.NULL))
    }

    /** Include {"folder":null} to move to the root. Supply {"name":"..."} to rename. */
    fun updateFile(id: String, change: JSONObject) = send("/v1/files/${segment(id,36)}","PATCH",change)
    fun updateFolder(id: String, change: JSONObject) = send("/v1/files/folders/${segment(id,36)}","PATCH",change)
    fun deleteFile(id: String) = send("/v1/files/${segment(id,36)}","DELETE")
    fun deleteFolder(id: String) = send("/v1/files/folders/${segment(id,36)}","DELETE")

    private fun handle(value: String): String {
        require(value.matches(Regex("[a-z0-9._-]{3,24}")) && !value.startsWith('.') &&
            !value.endsWith('.') && ".." !in value) { "Invalid X-Center ID username." }
        return value
    }

    private fun segment(value: String, limit: Int = 120): String {
        require(value.length <= limit && value.matches(Regex("[A-Za-z0-9_-]+"))) { "Invalid resource identifier." }
        return value
    }

    private fun query(key: String, value: String?) = value?.let { "?$key=" + URLEncoder.encode(it, "UTF-8") } ?: ""

    private fun recordPath(collection: String, space: RecordSpace): String {
        val (prefix, id) = when (space) {
            RecordSpace.Own -> "v1" to requireNotNull(clientId)
            is RecordSpace.Shared -> "v1" to space.client
            is RecordSpace.Public -> "public" to space.client
        }
        return "/$prefix/apps/${segment(id,100)}/data/${segment(collection,80)}"
    }

    private fun send(path: String, method: String = "GET", payload: JSONObject? = null,
                     revision: Long? = null, authenticated: Boolean = true): ByteArray {
        // Android's HttpURLConnection supports PATCH on the target runtime.
        val connection = URL(ISSUER + path).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.useCaches = false
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            if (authenticated) {
                val credential = requireNotNull(accessToken) { "Sign in first." }.invoke()
                require(!credential.startsWith("xid-db-") && credential.matches(Regex("[A-Za-z0-9_.~-]+"))) { "Supply an end-user access token." }
                connection.setRequestProperty("Authorization","Bearer $credential")
            }
            if (revision != null) {
                require(revision >= 0)
                connection.setRequestProperty("If-Match","\"$revision\"")
            }
            if (payload != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type","application/json")
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            if (status !in 200..299) {
                throw XCenterHTTPException(status,connection.errorStream?.use { it.readBytes() } ?: ByteArray(0),
                    connection.getHeaderField("Retry-After"))
            }
            return connection.inputStream.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }
}
