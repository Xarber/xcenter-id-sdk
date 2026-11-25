package it.xcenter.id.server

import it.xcenter.id.XCenterOAuth
import it.xcenter.id.XCenterOAuthException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.nio.file.Files
import java.nio.file.Path
import org.json.JSONObject

data class XCenterConfig(
    val clientId:String?=null,val clientSecret:String?=null,val redirectUri:String?=null,
    val databaseKey:String?=null,val allowLoopback:Boolean?=null,val scopes:List<String>?=null
) {
    override fun toString() = "XCenterConfig(clientId=$clientId)"

    companion object {
        fun load(explicit:XCenterConfig=XCenterConfig(),environment:Map<String,String> = System.getenv(),file:Path?=null):XCenterConfig {
            val path=file?:Path.of("xid.json")
            val json=if(file!=null||Files.exists(path))JSONObject(Files.readString(path)) else JSONObject()
            fun value(name:String)=json.opt(name) as? String
            return XCenterConfig(explicit.clientId?:environment["XCENTER_CLIENT_ID"]?:value("clientId"),
                explicit.clientSecret?:environment["XCENTER_CLIENT_SECRET"]?:value("clientSecret"),
                explicit.redirectUri?:environment["XCENTER_REDIRECT_URI"]?:value("redirectUri"),
                explicit.databaseKey?:environment["XCENTER_DATABASE_KEY"]?:value("databaseKey"),
                explicit.allowLoopback?:json.optBoolean("allowLoopback"),
                explicit.scopes?:json.optJSONArray("scopes")?.let { list -> (0 until list.length()).map(list::getString) })
        }
    }

    fun identity() = XCenterServerOAuth(
        XCenterOAuth(requireNotNull(clientId), URI.create(requireNotNull(redirectUri)),requireNotNull(clientSecret),allowLoopback==true),
        scopes.orEmpty()
    )

    fun records()=XCenterServiceRecords(requireNotNull(clientId),requireNotNull(databaseKey))
}

class XCenterServerOAuth internal constructor(private val client:XCenterOAuth,private val scopes:Collection<String>) {
    fun begin()=client.begin(scopes)
    fun complete(callback:URI,transaction:XCenterOAuth.Transaction)=client.complete(callback,transaction)
    fun refresh(token:String,subject:String)=client.refresh(token,subject)
    fun beginDevice()=client.startDevice(scopes)
    fun completeDevice(transaction:XCenterOAuth.DeviceTransaction,cancelled:()->Boolean={false})=client.finishDevice(transaction,cancelled)
    val issuerSignOutUrl get()=client.issuerSignOutUrl
}

class XCenterServiceRecords(private val clientId:String,private val databaseKey:String) {
    init {
        validate(clientId,100)
        require(databaseKey.matches(Regex("xid-db-[A-Za-z0-9_-]{43}"))) { "Invalid app database key." }
    }
    fun list(collection:String,cursor:String?=null)=send("GET",collection,suffix=cursor?.let{"?cursor="+URLEncoder.encode(it,"UTF-8")}.orEmpty())
    fun get(collection:String,id:String)=send("GET",collection,id)
    fun put(collection:String,id:String,revision:Long,data:Any?,isPublic:Boolean)=
        send("PUT",collection,id,revision,JSONObject().put("data",data?:JSONObject.NULL).put("public",isPublic))
    fun delete(collection:String,id:String,revision:Long):JSONObject {
        require(revision>0)
        return send("DELETE",collection,id,revision)
    }
    private fun validate(value:String,limit:Int):String {
        require(value.length in 1..limit && value.matches(Regex("[A-Za-z0-9_-]+"))) { "Invalid resource identifier." }
        return value
    }
    private fun send(method:String,collection:String,id:String?=null,revision:Long?=null,body:JSONObject?=null,suffix:String=""):JSONObject {
        val path="/v1/apps/$clientId/data/${validate(collection,80)}"+(id?.let { "/"+validate(it,120) } ?: "")+suffix
        val connection=URI.create(XCenterOAuth.ISSUER+path).toURL().openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects=false
            connection.connectTimeout=15_000
            connection.readTimeout=25_000
            connection.requestMethod=method
            connection.setRequestProperty("Authorization","Bearer $databaseKey")
            if(revision!=null) {
                require(revision>=0)
                connection.setRequestProperty("If-Match","\"$revision\"")
            }
            if(body!=null) {
                connection.doOutput=true
                connection.setRequestProperty("Content-Type","application/json")
                connection.outputStream.use { it.write(body.toString().encodeToByteArray()) }
            }
            val status=connection.responseCode
            if(status !in 200..299) throw XCenterOAuthException(status,null)
            return JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
        } finally { connection.disconnect() }
    }
}

class XCenterSavedPlaces(private val accessToken:()->String) {
    fun list(source:String?=null,after:String?=null):JSONObject {
        val query=mapOf("source" to source,"after" to after).mapNotNull { (key,value) ->
            value?.let { "$key="+URLEncoder.encode(it,"UTF-8") }
        }
        return send("GET",suffix=if(query.isEmpty())"" else "?"+query.joinToString("&"))
    }
    fun create(place:JSONObject)=send("POST",body=place)
    fun update(id:String,revision:Long,place:JSONObject):JSONObject {
        require(revision>0)
        return send("PUT",id,revision,place)
    }
    fun delete(id:String)=send("DELETE",id)
    private fun send(method:String,id:String?=null,revision:Long?=null,body:JSONObject?=null,suffix:String=""):JSONObject {
        require(id==null||id.matches(Regex("[a-f0-9-]{36}"))) { "Invalid saved-place ID." }
        val token=accessToken()
        require(token.matches(Regex("[A-Za-z0-9_.~-]+"))&&!token.startsWith("xid-db-")) { "Supply a user access token." }
        val path="/v1/records/saved-place"+(id?.let{"/$it"}?:"")+suffix
        val connection=URI.create(XCenterOAuth.ISSUER+path).toURL().openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects=false
            connection.connectTimeout=15_000
            connection.readTimeout=25_000
            connection.requestMethod=method
            connection.setRequestProperty("Authorization","Bearer $token")
            if(revision!=null)connection.setRequestProperty("If-Match","\"$revision\"")
            if(body!=null) {
                connection.doOutput=true
                connection.setRequestProperty("Content-Type","application/json")
                connection.outputStream.use { it.write(body.toString().encodeToByteArray()) }
            }
            val status=connection.responseCode
            if(status !in 200..299) throw XCenterOAuthException(status,null)
            return JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
        } finally { connection.disconnect() }
    }
}

/** Creates the public or delegated data client with the JVM HTTP transport, including PATCH. */
fun createDataClient(clientId:String?=null,accessToken:(()->String)?=null):it.xcenter.id.XCenterDataClient {
    val client=java.net.http.HttpClient.newBuilder()
        .followRedirects(java.net.http.HttpClient.Redirect.NEVER)
        .connectTimeout(java.time.Duration.ofSeconds(15)).build()
    return it.xcenter.id.XCenterDataClient(clientId,accessToken) { message ->
        val request=java.net.http.HttpRequest.newBuilder(URI.create(message.url))
            .timeout(java.time.Duration.ofSeconds(30))
            .method(message.method,message.body?.let(java.net.http.HttpRequest.BodyPublishers::ofByteArray)
                ?: java.net.http.HttpRequest.BodyPublishers.noBody())
        message.headers.forEach { (name,value) -> request.header(name,value) }
        val response=client.send(request.build(),java.net.http.HttpResponse.BodyHandlers.ofByteArray())
        if(response.statusCode() !in 200..299)throw it.xcenter.id.XCenterHTTPException(
            response.statusCode(),response.body(),response.headers().firstValue("Retry-After").orElse(null))
        response.body()
    }
}
