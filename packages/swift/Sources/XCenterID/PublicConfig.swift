import Foundation

public struct XCenterPublicConfig {
    public let clientId:String
    public let redirectUri:URL
    public let scopes:[String]

    public static func load(json:Data?=nil,environment:[String:String]=[:],clientId:String?=nil,
                            redirectUri:URL?=nil,scopes:[String]?=nil) throws -> XCenterPublicConfig {
        let values:[String:Any]
        if let json {
            guard let object=try JSONSerialization.jsonObject(with:json) as? [String:Any],
                  object["clientSecret"]==nil,object["databaseKey"]==nil else {
                throw XCenterOAuthFailure.invalidConfiguration
            }
            values=object
        } else { values=[:] }
        guard let clientId=clientId ?? environment["XCENTER_CLIENT_ID"] ?? values["clientId"] as? String,
              let uri=redirectUri ?? (environment["XCENTER_REDIRECT_URI"] ?? values["redirectUri"] as? String).flatMap(URL.init(string:)) else {
            throw XCenterOAuthFailure.invalidConfiguration
        }
        return .init(clientId:clientId,redirectUri:uri,scopes:scopes ?? values["scopes"] as? [String] ?? [])
    }

    public static func load(file:URL,environment:[String:String]=[:],clientId:String?=nil,
                            redirectUri:URL?=nil,scopes:[String]?=nil) throws -> XCenterPublicConfig {
        try load(json:Data(contentsOf:file),environment:environment,clientId:clientId,redirectUri:redirectUri,scopes:scopes)
    }

    public func identity() throws -> XCenterOAuth { try .init(clientID:clientId,redirectURI:redirectUri) }
    public func data(accessToken:@escaping () async throws -> String) -> XCenterDataClient {
        .init(clientID:clientId,accessToken:accessToken)
    }
}
