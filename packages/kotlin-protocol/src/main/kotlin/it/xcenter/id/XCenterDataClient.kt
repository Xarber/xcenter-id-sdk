package it.xcenter.id

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.io.encoding.Base64
import org.json.JSONObject

class XCenterHTTPException(val status: Int, val responseBody: ByteArray, val retryAfter: String?) :
    java.io.IOException("X-Center ID request failed (HTTP $status).")

/** Blocking API. Call on an IO dispatcher or worker thread. */
class XCenterDataClient internal constructor(private val clientId: String?, private val accessToken: (() -> String)?,
    private val transport: (DataRequest) -> ByteArray) {
    constructor(clientId:String?=null,accessToken:(()->String)?=null) : this(clientId,accessToken,::sendConnection)
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

    fun profileVisibility() = send("/v1/account/profile-visibility")
    fun updateProfileVisibility(fields: List<String>) =
        send("/v1/account/profile-visibility","PUT",JSONObject().put("fields",org.json.JSONArray(fields)))
    fun connectedApps() = send("/v1/account/apps")
    fun connectedPermissions(client: String) = send("/v1/account/apps/${segment(client,100)}/permissions")
    fun disableConnectedPermission(client: String, scope: String) =
        send("/v1/account/apps/${segment(client,100)}/permissions","PUT",JSONObject().put("scope",scope).put("enabled",false))

    fun accountOverview() = send("/v1/account/overview")

    private val appFiles get() = "/v1/apps/${segment(requireNotNull(clientId),100)}/files"
    fun listAppFiles(cursor: String? = null) = send(appFiles+query("cursor",cursor))
    fun downloadAppFile(id: String) = send("$appFiles/${segment(id,36)}")
    fun deleteAppFile(id: String) = send("$appFiles/${segment(id,36)}","DELETE")
    fun setAppFileBrowseable(id: String, browseable: Boolean) =
        setAppFileVisibility(id,browseable)
    fun setAppFileVisibility(id: String, browseable: Boolean, editable: Boolean? = null) =
        send("$appFiles/${segment(id,36)}","PUT",JSONObject().put("browseable",browseable).putOpt("editable",editable))
    fun startAppUpload(name: String, size: Long, browseable: Boolean = false, editable: Boolean = false) =
        send("$appFiles/uploads","POST",JSONObject().put("name",name).put("size",size).put("browseable",browseable).put("editable",editable))
    fun appUploadStatus(id: String) = send("$appFiles/uploads/${segment(id,36)}")
    fun appendAppUpload(id: String, position: Long, content: ByteArray) =
        send("$appFiles/uploads/${segment(id,36)}","PUT",JSONObject().put("position",position).put("content",Base64.encode(content)))
    fun completeAppUpload(id: String) = send("$appFiles/uploads/${segment(id,36)}","POST",JSONObject())
    fun cancelAppUpload(id: String) = send("$appFiles/uploads/${segment(id,36)}","DELETE")

    fun startUpload(name: String, size: Long, folder: String? = null) =
        send("/v1/files/uploads","POST",JSONObject().put("name",name).put("size",size).put("folder",folder ?: JSONObject.NULL))

    fun uploadStatus(id: String) = send("/v1/files/uploads/${segment(id,36)}")
    fun appendUpload(id: String, position: Long, content: ByteArray) =
        send("/v1/files/uploads/${segment(id,36)}","PUT",
            JSONObject().put("position",position).put("content",Base64.encode(content)))
    fun completeUpload(id: String) = send("/v1/files/uploads/${segment(id,36)}","POST",JSONObject())
    fun cancelUpload(id: String) = send("/v1/files/uploads/${segment(id,36)}","DELETE")

    fun openPeer(discoverable: Boolean = false) =
        send("/v1/peers","POST",JSONObject().put("discoverable",discoverable))
    fun listPeers(id: String, proof: String) =
        send("/v1/peers/${segment(id,24)}/directory",peerProof=proof)
    fun receivePeerMessages(id: String, proof: String) =
        send("/v1/peers/${segment(id,24)}/messages",peerProof=proof)
    fun sendPeerMessage(id: String, proof: String, to: String, type: String, data: JSONObject) =
        send("/v1/peers/${segment(id,24)}/messages","POST",
            JSONObject().put("to",to).put("type",type).put("data",data),peerProof=proof)
    fun closePeer(id: String, proof: String) =
        send("/v1/peers/${segment(id,24)}","DELETE",peerProof=proof)

    fun listFiles(folder: String? = null) = send("/v1/files" + query("folder",folder))
    fun downloadFile(id: String) = send("/v1/files/${segment(id,36)}")
    fun listSharedFiles() = send("/v1/files/shared")
    fun downloadSharedFile(id: String) = send("/v1/files/shared/${segment(id,36)}")
    fun createFolder(name: String, parent: String? = null) =
        send("/v1/files/folders","POST",JSONObject().put("name",name).put("folder",parent ?: JSONObject.NULL))

    fun uploadFile(name: String, content: ByteArray, folder: String? = null): ByteArray {
        require(content.size in 1..2*1024*1024) { "Choose a file from 1 byte to 2 MB." }
        return send("/v1/files","POST",JSONObject().put("name",name)
            .put("content",Base64.encode(content)).put("folder",folder ?: JSONObject.NULL))
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
                     revision: Long? = null, authenticated: Boolean = true, peerProof: String? = null): ByteArray {
        val headers=mutableMapOf<String,String>()
        if (authenticated) {
            val credential = requireNotNull(accessToken) { "Sign in first." }.invoke()
            require(!credential.startsWith("xid-db-") && credential.matches(Regex("[A-Za-z0-9_.~-]+"))) { "Supply an end-user access token." }
            headers["Authorization"]="Bearer $credential"
        }
        if(revision!=null){
            require(revision>=0)
            headers["If-Match"]="\"$revision\""
        }
        if(peerProof!=null){
            require(peerProof.matches(Regex("[A-Za-z0-9_-]{43}"))) { "Supply a valid peer proof." }
            headers["X-XCenter-Peer-Proof"]=peerProof
        }
        if(payload!=null)headers["Content-Type"]="application/json"
        return transport(DataRequest(ISSUER+path,method,headers,payload?.toString()?.encodeToByteArray()))
    }
}

internal data class DataRequest(val url:String,val method:String,val headers:Map<String,String>,val body:ByteArray?)

private fun sendConnection(request:DataRequest):ByteArray {
    val connection = URL(request.url).openConnection() as HttpURLConnection
    try {
        connection.instanceFollowRedirects = false
        connection.useCaches = false
        connection.requestMethod = request.method
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        request.headers.forEach { (name,value) -> connection.setRequestProperty(name,value) }
        if (request.body != null) {
            connection.doOutput = true
            connection.outputStream.use { it.write(request.body) }
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
