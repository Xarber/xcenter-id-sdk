import Foundation

public struct XCenterHTTPError: Error {
    public let status: Int
    public let body: Data
    public let retryAfter: String?
}

public struct XCenterDataClient {
    public static let issuer = URL(string: "https://id.xcenter.it")!
    private let session: URLSession
    private let clientID: String?
    private let service: Bool
    private let token: (() async throws -> String)?

    public init(session: URLSession? = nil) {
        self.session = session ?? Self.makeSession()
        clientID = nil
        service = false
        token = nil
    }

    public init(clientID: String, session: URLSession? = nil, accessToken: @escaping () async throws -> String) {
        self.clientID = clientID
        self.session = session ?? Self.makeSession()
        service = false
        token = accessToken
    }

    @_spi(Server) public init(serviceClientID:String,key:String) {
        self.clientID = serviceClientID
        self.session = Self.makeSession()
        self.service = true
        self.token = { key }
    }

    private final class NoRedirect: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    private static func makeSession() -> URLSession {
        URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
    }

    public enum RecordSpace {
        case own
        case shared(String)
        case publiclyVisible(String)
    }

    public struct Write<Value: Encodable>: Encodable {
        public var data: Value
        public var isPublic: Bool
        public var readers: [String]?
        enum CodingKeys: String, CodingKey { case data, readers; case isPublic = "public" }
        public init(data: Value, isPublic: Bool, readers: [String]? = nil) {
            self.data = data
            self.isPublic = isPublic
            self.readers = readers
        }
    }

    public struct ItemChange: Encodable {
        public let name: String?
        private let destination: Destination
        public enum Destination { case unchanged, root, folder(String) }
        public init(name: String? = nil, destination: Destination = .unchanged) {
            self.name = name
            self.destination = destination
        }
        enum CodingKeys: String, CodingKey { case name, folder }
        public func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encodeIfPresent(name, forKey: .name)
            switch destination {
            case .unchanged: break
            case .root: try container.encodeNil(forKey: .folder)
            case .folder(let value): try container.encode(value, forKey: .folder)
            }
        }
    }

    public func discover() async throws -> Data { try await request([".well-known","openid-configuration"], authenticated: false) }
    public func userInfo() async throws -> Data { try await request(["me"]) }
    public func avatar() async throws -> Data { try await request(["v1","profile","avatar"]) }
    public func friends() async throws -> Data { try await request(["v1","profile","friends"]) }
    public func publicProfile(_ username: String) async throws -> Data {
        try await request(["public","profiles",try validUsername(username)], authenticated: false)
    }
    public func publicAvatar(_ username: String) async throws -> Data {
        try await request(["public","profiles",try validUsername(username),"avatar"], authenticated: false)
    }
    public func appIcon(_ registrationID: String) async throws -> Data {
        try await request(["public","app-icons",registrationID], authenticated: false)
    }

    public func listRecords(_ collection: String, space: RecordSpace = .own, cursor: String? = nil) async throws -> Data {
        try await record(collection, id: nil, space: space, cursor: cursor)
    }

    public func getRecord(_ collection: String, id: String, space: RecordSpace = .own) async throws -> Data {
        try await record(collection, id: id, space: space, cursor: nil)
    }

    private func record(_ collection: String, id: String?, space: RecordSpace, cursor: String?) async throws -> Data {
        let parts: [String], authenticated: Bool
        switch space {
        case .own: parts = try ownPath(collection); authenticated = true
        case .shared(let source): parts = ["v1","apps",source,"data",collection]; authenticated = true
        case .publiclyVisible(let source): parts = ["public","apps",source,"data",collection]; authenticated = false
        }
        return try await request(parts + (id.map { [$0] } ?? []), authenticated: authenticated,
                                 query: cursor.map { URLQueryItem(name: "cursor", value: $0) })
    }

    public func putRecord<Value>(_ collection: String, id: String, revision: Int, value: Write<Value>) async throws -> Data {
        try await request(ownPath(collection)+[id], method:"PUT", body:JSONEncoder().encode(value), revision:revision)
    }

    public func deleteRecord(_ collection: String, id: String, revision: Int) async throws -> Data {
        guard revision > 0 else { throw URLError(.badURL) }
        return try await request(ownPath(collection)+[id], method:"DELETE", revision:revision)
    }

    public func listFiles(folder: String? = nil) async throws -> Data {
        try await request(["v1","files"], query:folder.map { URLQueryItem(name:"folder",value:$0) })
    }
    public func downloadFile(_ id: String) async throws -> Data { try await request(["v1","files",id]) }
    public func listSharedFiles() async throws -> Data { try await request(["v1","files","shared"]) }
    public func downloadSharedFile(_ id: String) async throws -> Data { try await request(["v1","files","shared",id]) }
    public func createFolder(name: String, parent: String? = nil) async throws -> Data {
        try await request(["v1","files","folders"], method:"POST",
                          body:JSONEncoder().encode(ItemChange(name:name,destination:parent.map(ItemChange.Destination.folder) ?? .root)))
    }
    public func uploadFile(name: String, content: Data, folder: String? = nil) async throws -> Data {
        var body = ["name":name,"content":content.base64EncodedString()]
        body["folder"] = folder
        return try await request(["v1","files"], method:"POST", body:JSONEncoder().encode(body))
    }
    public func updateFile(_ id: String, change: ItemChange) async throws -> Data {
        try await request(["v1","files",id], method:"PATCH", body:JSONEncoder().encode(change))
    }
    public func updateFolder(_ id: String, change: ItemChange) async throws -> Data {
        try await request(["v1","files","folders",id], method:"PATCH", body:JSONEncoder().encode(change))
    }
    public func deleteFile(_ id: String) async throws -> Data { try await request(["v1","files",id], method:"DELETE") }
    public func deleteFolder(_ id: String) async throws -> Data { try await request(["v1","files","folders",id], method:"DELETE") }

    @_spi(Server) public func savedPlace(_ id:String?=nil, method:String="GET", body:Data?=nil, revision:Int?=nil,
                                       source:String?=nil, after:String?=nil) async throws -> Data {
        if let id {
            guard UUID(uuidString:id) != nil else { throw URLError(.badURL) }
        }
        let query=[source.map{URLQueryItem(name:"source",value:$0)},after.map{URLQueryItem(name:"after",value:$0)}].compactMap{$0}
        return try await request(["v1","records","saved-place"]+(id.map{[$0]} ?? []),method:method,
                                 body:body,revision:revision,queryItems:query)
    }

    private func ownPath(_ collection: String) throws -> [String] {
        guard let clientID else { throw URLError(.userAuthenticationRequired) }
        return ["v1","apps",clientID,"data",collection]
    }

    private func validUsername(_ value: String) throws -> String {
        guard value.range(of:"^[a-z0-9._-]{3,24}$",options:.regularExpression) != nil,
              !value.hasPrefix("."), !value.hasSuffix("."), !value.contains("..") else { throw URLError(.badURL) }
        return value
    }

    private func request(_ parts: [String], method: String = "GET", body: Data? = nil, revision: Int? = nil,
                         authenticated: Bool = true, query: URLQueryItem? = nil, queryItems: [URLQueryItem] = []) async throws -> Data {
        guard parts.allSatisfy({ $0 != "." && $0 != ".." && $0.range(of:"^[A-Za-z0-9._-]{1,120}$",options:.regularExpression) != nil }),
              revision.map({$0 >= 0}) ?? true else { throw URLError(.badURL) }
        var url = URLComponents(url:Self.issuer,resolvingAgainstBaseURL:false)!
        url.path = "/" + parts.joined(separator:"/")
        url.queryItems = queryItems.isEmpty ? query.map { [$0] } : queryItems
        var request = URLRequest(url:url.url!)
        request.httpMethod = method
        request.httpShouldHandleCookies = false
        if authenticated {
            guard let accessToken = try await token?(), accessToken.hasPrefix("xid-db-") == service,
                  !accessToken.isEmpty, accessToken.range(of:"[^A-Za-z0-9_.~-]",options:.regularExpression) == nil else {
                throw URLError(.userAuthenticationRequired)
            }
            request.setValue("Bearer "+accessToken,forHTTPHeaderField:"Authorization")
        }
        if let revision { request.setValue("\"\(revision)\"",forHTTPHeaderField:"If-Match") }
        if let body {
            request.httpBody = body
            request.setValue("application/json",forHTTPHeaderField:"Content-Type")
        }
        let (data,response) = try await session.data(for:request,delegate:NoRedirect())
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            throw XCenterHTTPError(status:http.statusCode,body:data,retryAfter:http.value(forHTTPHeaderField:"Retry-After"))
        }
        return data
    }
}
