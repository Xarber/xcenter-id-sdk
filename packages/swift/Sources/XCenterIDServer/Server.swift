import Foundation
@_spi(Server) import XCenterID

public struct XCenterServerConfig: Decodable {
    public var clientId: String?
    public var clientSecret: String?
    public var redirectUri: String?
    public var databaseKey: String?
    public var scopes: [String]?
    public var allowLoopback: Bool?

    public init(clientId:String?=nil, clientSecret:String?=nil, redirectUri:String?=nil,
                databaseKey:String?=nil, scopes:[String]?=nil, allowLoopback:Bool?=nil) {
        self.clientId=clientId
        self.clientSecret=clientSecret
        self.redirectUri=redirectUri
        self.databaseKey=databaseKey
        self.scopes=scopes
        self.allowLoopback=allowLoopback
    }

    public static func load(file:URL?=nil, environment:[String:String]=ProcessInfo.processInfo.environment,
                            explicit:XCenterServerConfig = .init()) throws -> XCenterServerConfig {
        let path=file ?? URL(fileURLWithPath:"xid.json")
        let disk=file != nil || FileManager.default.fileExists(atPath:path.path)
            ? try JSONDecoder().decode(XCenterServerConfig.self,from:Data(contentsOf:path)) : .init()
        return .init(clientId:explicit.clientId ?? environment["XCENTER_CLIENT_ID"] ?? disk.clientId,
            clientSecret:explicit.clientSecret ?? environment["XCENTER_CLIENT_SECRET"] ?? disk.clientSecret,
            redirectUri:explicit.redirectUri ?? environment["XCENTER_REDIRECT_URI"] ?? disk.redirectUri,
            databaseKey:explicit.databaseKey ?? environment["XCENTER_DATABASE_KEY"] ?? disk.databaseKey,
            scopes:explicit.scopes ?? disk.scopes,allowLoopback:explicit.allowLoopback ?? disk.allowLoopback)
    }

    public func identity() throws -> XCenterServerOAuth {
        guard let clientId,let clientSecret,let redirectUri,let url=URL(string:redirectUri) else {
            throw XCenterOAuthFailure.invalidConfiguration
        }
        return try .init(clientId:clientId,secret:clientSecret,redirect:url,scopes:scopes ?? [],allowLoopback:allowLoopback ?? false)
    }

    public func records() throws -> XCenterServiceRecords {
        guard let clientId,let databaseKey else { throw XCenterOAuthFailure.invalidConfiguration }
        return try .init(clientId:clientId,key:databaseKey)
    }
}

public final class XCenterServerOAuth {
    private let client: XCenterOAuth
    private let scopes: [String]

    public init(clientId:String,secret:String,redirect:URL,scopes:[String]=[],allowLoopback:Bool=false) throws {
        client=try XCenterOAuth(clientID:clientId,redirectURI:redirect,secret:secret,allowLoopback:allowLoopback)
        self.scopes=scopes
    }

    public struct DeviceTransaction: Codable {
        fileprivate let data: Data
    }

    public func begin() throws -> (url:URL,transaction:XCenterOAuthTransaction) { try client.begin(scopes:scopes) }
    public func complete(_ url:URL,transaction:XCenterOAuthTransaction) async throws -> (tokens:[String:Any],identity:[String:Any]) {
        try await client.complete(url,transaction:transaction)
    }
    public func refresh(_ token:String,subject:String) async throws -> (tokens:[String:Any],identity:[String:Any]) {
        try await client.refresh(token,subject:subject)
    }
    public func beginDevice() async throws -> (userCode:String,verificationURL:URL,transaction:DeviceTransaction) {
        let response=try await client.beginDevice(scopes:scopes)
        return (response.userCode,response.verificationURL,DeviceTransaction(data:try JSONEncoder().encode(response.transaction)))
    }
    public func completeDevice(_ transaction:DeviceTransaction) async throws -> (tokens:[String:Any],identity:[String:Any]) {
        try await client.completeDevice(JSONDecoder().decode(XCenterDeviceTransaction.self,from:transaction.data))
    }
    public var issuerSignOutURL:URL { client.issuerSignOutURL }
}

public struct XCenterServiceRecords {
    private let client: XCenterDataClient

    public init(clientId:String,key:String) throws {
        guard key.range(of:"^xid-db-[A-Za-z0-9_-]{43}$",options:.regularExpression) != nil,key.count==50 else {
            throw XCenterOAuthFailure.invalidConfiguration
        }
        client = XCenterDataClient(serviceClientID:clientId,key:key)
    }

    public func list(_ collection:String,cursor:String?=nil) async throws -> Data {
        try await client.listRecords(collection,cursor:cursor)
    }
    public func get(_ collection:String,id:String) async throws -> Data {
        try await client.getRecord(collection,id:id)
    }
    public func put<Value:Encodable>(_ collection:String,id:String,revision:Int,data:Value,isPublic:Bool) async throws -> Data {
        try await client.putRecord(collection,id:id,revision:revision,value:.init(data:data,isPublic:isPublic))
    }
    public func delete(_ collection:String,id:String,revision:Int) async throws -> Data {
        try await client.deleteRecord(collection,id:id,revision:revision)
    }
}


public struct XCenterSavedPlaces {
    private let data: XCenterDataClient
    public init(clientId:String,accessToken:@escaping () async throws -> String) {
        data = XCenterDataClient(clientID:clientId,accessToken:accessToken)
    }
    public struct Place: Encodable {
        public let label:String
        public let latitude:Double
        public let longitude:Double
        public init(label:String,latitude:Double,longitude:Double) {
            self.label=label
            self.latitude=latitude
            self.longitude=longitude
        }
    }
    public func list(source:String?=nil,after:String?=nil) async throws -> Data { try await data.savedPlace(source:source,after:after) }
    public func create(_ place:Place) async throws -> Data { try await data.savedPlace(method:"POST",body:JSONEncoder().encode(place)) }
    public func update(_ id:String,revision:Int,place:Place) async throws -> Data {
        guard revision>0 else { throw XCenterOAuthFailure.invalidConfiguration }
        return try await data.savedPlace(id,method:"PUT",body:JSONEncoder().encode(place),revision:revision)
    }
    public func delete(_ id:String) async throws -> Data { try await data.savedPlace(id,method:"DELETE") }
}
