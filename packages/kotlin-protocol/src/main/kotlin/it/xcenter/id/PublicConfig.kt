package it.xcenter.id

import java.net.URI
import org.json.JSONObject

data class XCenterPublicConfig(val clientId:String,val redirectUri:URI,val scopes:List<String> = emptyList()) {
    fun identity() = XCenterOAuth(clientId,redirectUri)
    companion object {
        fun load(json:String?=null,environment:Map<String,String> = emptyMap(),
                 clientId:String?=null,redirectUri:URI?=null,scopes:List<String>?=null):XCenterPublicConfig {
            val config=json?.let(::JSONObject) ?: JSONObject()
            require(!config.has("clientSecret") && !config.has("databaseKey")) { "Keep confidential credentials on a server." }
            val id=clientId ?: environment["XCENTER_CLIENT_ID"] ?: config.opt("clientId") as? String
            val callback=redirectUri ?: (environment["XCENTER_REDIRECT_URI"] ?: config.opt("redirectUri") as? String)?.let(URI::create)
            val defaults=scopes ?: config.optJSONArray("scopes")?.let { list -> (0 until list.length()).map(list::getString) }
            return XCenterPublicConfig(requireNotNull(id),requireNotNull(callback),defaults.orEmpty())
        }
    }
}
