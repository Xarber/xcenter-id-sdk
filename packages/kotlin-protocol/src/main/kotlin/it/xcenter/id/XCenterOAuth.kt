package it.xcenter.id

import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.RSAPublicKeySpec
import kotlin.io.encoding.Base64
import org.json.JSONArray
import org.json.JSONObject

class XCenterOAuthException(val status: Int, val code: String?) :
    java.io.IOException("X-Center ID OAuth request failed (HTTP $status).")

/** Network methods are blocking. Use an IO dispatcher on Android. */
class XCenterOAuth internal constructor(
    val clientId: String, val callback: URI, private val secret: String?, allowLoopback: Boolean
) {
    constructor(clientId: String, callback: URI) : this(clientId, callback, null, false)

    companion object {
        const val ISSUER = "https://id.xcenter.it"
        val scopes = setOf("openid","profile","email","age_range","app_data","friends","offline_access",
            "files_read","files_write","shared_files_read","account_overview","account_manage")
        private val secureRandom = SecureRandom()
        private val base64 = Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT_OPTIONAL)
        private val proof = Regex("[A-Za-z0-9_-]{22,128}")
        private val bearer = Regex("[A-Za-z0-9_.~-]+")
        private fun now() = System.currentTimeMillis()/1000
        private fun random() = base64.encode(ByteArray(32).also(secureRandom::nextBytes))
        private fun encode(value:String) = URLEncoder.encode(value,"UTF-8")
        private fun form(values:Map<String,String>) = values.entries.joinToString("&"){encode(it.key)+"="+encode(it.value)}
        private fun scope(requested:Collection<String>):String {
            require(requested.all(scopes::contains)) { "Unsupported OAuth scope." }
            return (listOf("openid")+requested).distinct().joinToString(" ")
        }
    }

    init {
        val loopback = allowLoopback && secret != null && callback.scheme == "http" &&
            callback.host in setOf("127.0.0.1","[::1]","::1") && callback.port > 0
        require(clientId.isNotEmpty() && secret?.isEmpty()!=true && (callback.scheme=="https"||loopback) &&
            callback.host!=null && callback.userInfo==null && callback.fragment==null && callback.query==null &&
            !callback.rawPath.isNullOrEmpty() && callback.rawPath!="/") { "Configure an exact registered callback." }
    }

    data class Transaction(val state:String,val nonce:String,val verifier:String,val expiresAt:Long)
    data class Login(val url:URI,val transaction:Transaction)
    data class Identity(val tokens:JSONObject,val profile:JSONObject)
    class DeviceTransaction internal constructor(val nonce:String,val deviceCode:String,val expiresAt:Long,val interval:Long)
    data class Device(val userCode:String,val verificationUrl:URI,val transaction:DeviceTransaction)

    val issuerSignOutUrl: URI get() = URI.create("$ISSUER/session/end")

    fun begin(scopes:Collection<String> = emptyList(), promptConsent:Boolean=false):Login {
        val transaction=Transaction(random(),random(),random(),now()+600)
        val challenge=base64.encode(MessageDigest.getInstance("SHA-256").digest(transaction.verifier.encodeToByteArray()))
        val values=mutableMapOf("client_id" to clientId,"redirect_uri" to callback.toASCIIString(),"response_type" to "code",
            "scope" to scope(scopes),"state" to transaction.state,"nonce" to transaction.nonce,
            "code_challenge" to challenge,"code_challenge_method" to "S256")
        if(promptConsent || "offline_access" in scopes) values["prompt"]="consent"
        return Login(URI.create("$ISSUER/auth?"+form(values)), transaction)
    }

    fun complete(returned:URI,transaction:Transaction):Identity {
        require(transaction.expiresAt>now() && listOf(transaction.state,transaction.nonce,transaction.verifier).all(proof::matches) &&
            returned.scheme==callback.scheme && returned.host==callback.host && returned.port==callback.port &&
            returned.rawPath==callback.rawPath && returned.userInfo==null && returned.fragment==null) {
            "Invalid or expired authorization response."
        }
        val params=returned.rawQuery.orEmpty().split('&').map { entry ->
            val split=entry.split('=',limit=2)
            java.net.URLDecoder.decode(split[0],"UTF-8") to java.net.URLDecoder.decode(split.getOrElse(1){""},"UTF-8")
        }.groupBy({it.first},{it.second})
        val code=params["code"]?.singleOrNull()
        require(!code.isNullOrEmpty() && params["state"]?.singleOrNull()==transaction.state && "error" !in params) {
            "Invalid authorization response."
        }
        return identity(request("/token",mapOf("grant_type" to "authorization_code","code" to code,
            "redirect_uri" to callback.toASCIIString(),"code_verifier" to transaction.verifier)),nonce=transaction.nonce)
    }

    fun refresh(refreshToken:String,subject:String):Identity {
        require(refreshToken.isNotEmpty() && subject.isNotEmpty())
        val tokens=request("/token",mapOf("grant_type" to "refresh_token","refresh_token" to refreshToken))
        check(tokens.optString("refresh_token").isNotEmpty()) { "Missing rotated refresh token." }
        return identity(tokens,subject=subject)
    }

    internal fun startDevice(scopes:Collection<String>):Device {
        check(secret!=null) { "Device authorization requires a confidential client." }
        val nonce=random()
        val response=request("/device/auth",mapOf("client_id" to clientId,"nonce" to nonce,"scope" to scope(scopes)))
        val url=URI.create(response.optString("verification_uri_complete",response.optString("verification_uri")))
        val expires=response.getLong("expires_in")
        require(url.scheme=="https" && url.host=="id.xcenter.it" && url.port==-1 &&
            url.userInfo==null && url.fragment==null && url.path=="/device" && expires>0)
        return Device(response.getString("user_code"),url,DeviceTransaction(nonce,response.getString("device_code"),
            now()+expires,response.optLong("interval",5).coerceAtLeast(1)))
    }

    internal fun finishDevice(transaction:DeviceTransaction,cancelled:()->Boolean):Identity {
        check(secret!=null)
        var interval=transaction.interval.coerceAtLeast(1)
        while (!cancelled()) {
            val remaining=transaction.expiresAt-now()
            if(remaining<=0) break
            Thread.sleep(minOf(interval,remaining)*1000)
            if(cancelled()||transaction.expiresAt<=now())break
            try {
                val tokens=request("/token",mapOf("grant_type" to "urn:ietf:params:oauth:grant-type:device_code",
                    "device_code" to transaction.deviceCode))
                return identity(tokens,nonce=transaction.nonce)
            } catch(error:XCenterOAuthException) {
                when(error.code) {
                    "authorization_pending" -> continue
                    "slow_down" -> interval+=5
                    else -> throw error
                }
            }
        }
        error("Device authorization expired or was cancelled.")
    }

    private fun request(path:String,body:Map<String,String>?=null,access:String?=null):JSONObject {
        val connection=URI.create(ISSUER+path).toURL().openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects=false
            connection.connectTimeout=15_000
            connection.readTimeout=25_000
            if(access!=null) connection.setRequestProperty("Authorization","Bearer $access")
            if(body!=null) {
                connection.requestMethod="POST"
                connection.doOutput=true
                connection.setRequestProperty("Content-Type","application/x-www-form-urlencoded")
                if(secret!=null) {
                    val basic=Base64.encode((encode(clientId)+":"+encode(secret)).encodeToByteArray())
                    connection.setRequestProperty("Authorization","Basic $basic")
                }
                val fields=if(secret==null)body+("client_id" to clientId) else body
                connection.outputStream.use { it.write(form(fields).encodeToByteArray()) }
            }
            val status=connection.responseCode
            if(status !in 200..299) {
                val payload=connection.errorStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                throw XCenterOAuthException(status,payload?.let { runCatching { JSONObject(it).optString("error") }.getOrNull() })
            }
            return JSONObject(connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() })
        } finally {connection.disconnect()}
    }

    private fun identity(tokens:JSONObject,nonce:String?=null,subject:String?=null):Identity {
        val access=tokens.optString("access_token")
        require(bearer.matches(access) && tokens.optString("token_type").equals("Bearer",ignoreCase=true))
        val jwt=tokens.optString("id_token")
        val expected=if(jwt.isNotEmpty())verify(jwt,nonce,subject) else {
            check(nonce==null && subject!=null) { "ID token missing." }
            subject
        }
        val profile=request("/me",access=access)
        check(profile.optString("sub")==expected) { "Unexpected X-Center ID subject." }
        return Identity(tokens,profile)
    }

    private fun verify(jwt:String,nonce:String?,subject:String?):String {
        val components=jwt.split('.')
        require(jwt.length<=16384 && components.size==3) { "Invalid token." }
        val header=JSONObject(base64.decode(components[0]).decodeToString())
        val kid=header.optString("kid")
        require(header.optString("alg")=="RS256" && kid.isNotEmpty()) { "Unsupported signing key." }
        val keys=request("/jwks").getJSONArray("keys")
        val jwk=(0 until keys.length()).map(keys::getJSONObject).singleOrNull {
            it.optString("kid")==kid && it.optString("kty")=="RSA" && it.optString("use","sig")=="sig" &&
                it.optString("alg","RS256")=="RS256"
        } ?: error("Issuer signing key unavailable.")
        val publicKey=KeyFactory.getInstance("RSA").generatePublic(RSAPublicKeySpec(
            BigInteger(1,base64.decode(jwk.getString("n"))),BigInteger(1,base64.decode(jwk.getString("e")))))
        val signature=Signature.getInstance("SHA256withRSA")
        signature.initVerify(publicKey)
        signature.update((components[0]+"."+components[1]).encodeToByteArray())
        check(signature.verify(base64.decode(components[2]))) { "Invalid ID token signature." }
        val claims=JSONObject(base64.decode(components[1]).decodeToString())
        val audiences=when(val claim=claims.opt("aud")){
            is JSONArray -> (0 until claim.length()).map(claim::getString)
            is String -> listOf(claim)
            else -> emptyList()
        }
        val now=now()
        val sub=claims.optString("sub")
        check(claims.optString("iss")==ISSUER && clientId in audiences &&
            ((audiences.size==1 && !claims.has("azp")) || claims.optString("azp")==clientId) &&
            (claims.opt("exp") as? Number)?.toDouble()?.let { it>now }==true &&
            (claims.opt("iat") as? Number)?.toDouble()?.let { it<=now+60 }==true &&
            (!claims.has("nbf") || (claims.opt("nbf") as? Number)?.toDouble()?.let { it<=now }==true) &&
            sub.isNotEmpty() && (nonce==null||claims.optString("nonce")==nonce) && (subject==null||sub==subject)) {
            "Invalid ID token claims."
        }
        return sub
    }
}
