import Foundation
import CryptoKit
import Security

public enum XCenterOAuthFailure: Error {
    case invalidConfiguration, invalidCallback, invalidToken, expired, unsupported
    case http(Int, String?)
}

public struct XCenterOAuthTransaction: Codable {
    public let state: String
    public let nonce: String
    public let verifier: String
    public let expiresAt: Date
}

public final class XCenterOAuth {
    public static let supportedScopes: Set<String> = ["openid","profile","email","age_range","app_data","friends",
        "offline_access","files_read","files_write","shared_files_read","account_overview","account_manage"]

    public let clientID: String
    public let redirectURI: URL
    private let secret: String?
    private let session: URLSession

    private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    }

    public convenience init(clientID: String, redirectURI: URL, session: URLSession? = nil) throws {
        try self.init(clientID:clientID,redirectURI:redirectURI,secret:nil,allowLoopback:false,session:session)
    }

    @_spi(Server) public init(clientID: String, redirectURI: URL, secret: String?, allowLoopback: Bool, session: URLSession? = nil) throws {
        let loopback = allowLoopback && secret != nil && redirectURI.scheme == "http" &&
            ["127.0.0.1","[::1]","::1"].contains(redirectURI.host ?? "") && redirectURI.port != nil
        guard !clientID.isEmpty, secret?.isEmpty != true, redirectURI.scheme == "https" || loopback,
              redirectURI.host != nil, redirectURI.user == nil, redirectURI.password == nil,
              redirectURI.query == nil, redirectURI.fragment == nil,
              !redirectURI.path.isEmpty, redirectURI.path != "/" else { throw XCenterOAuthFailure.invalidConfiguration }
        self.clientID = clientID
        self.redirectURI = redirectURI
        self.secret = secret
        self.session = session ?? URLSession(configuration:.ephemeral,delegate:RejectRedirects(),delegateQueue:nil)
    }

    public var issuerSignOutURL: URL { XCenterDataClient.issuer.appendingPathComponent("session/end") }

    private func rng() throws -> String {
        var bytes = Data(count:32)
        let result = bytes.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault,32,$0.baseAddress!) }
        guard result == errSecSuccess else { throw XCenterOAuthFailure.unsupported }
        return base64URL(bytes)
    }

    private func base64URL(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of:"+",with:"-")
            .replacingOccurrences(of:"/",with:"_").replacingOccurrences(of:"=",with:"")
    }

    private func decode(_ text: String) throws -> Data {
        let raw = text.replacingOccurrences(of:"-",with:"+").replacingOccurrences(of:"_",with:"/")
        guard let data = Data(base64Encoded:raw+String(repeating:"=",count:(4-raw.count%4)%4)) else {
            throw XCenterOAuthFailure.invalidToken
        }
        return data
    }

    private func scope(_ values: [String]) throws -> String {
        guard values.allSatisfy(Self.supportedScopes.contains) else { throw XCenterOAuthFailure.invalidConfiguration }
        var seen: Set<String> = []
        return (["openid"]+values).filter { seen.insert($0).inserted }.joined(separator:" ")
    }

    public func begin(scopes: [String] = [], promptConsent: Bool = false) throws -> (url: URL, transaction: XCenterOAuthTransaction) {
        let transaction = try XCenterOAuthTransaction(state:rng(),nonce:rng(),verifier:rng(),expiresAt:Date().addingTimeInterval(600))
        let challenge = base64URL(Data(SHA256.hash(data:Data(transaction.verifier.utf8))))
        var url = URLComponents(url:XCenterDataClient.issuer.appendingPathComponent("auth"),resolvingAgainstBaseURL:false)!
        var values = ["client_id":clientID,"response_type":"code","redirect_uri":redirectURI.absoluteString,
            "scope":try scope(scopes),"state":transaction.state,"nonce":transaction.nonce,
            "code_challenge":challenge,"code_challenge_method":"S256"]
        if promptConsent || scopes.contains("offline_access") { values["prompt"] = "consent" }
        url.queryItems = values.map { URLQueryItem(name:$0.key,value:$0.value) }
        return (url.url!,transaction)
    }

    public func complete(_ returned: URL, transaction: XCenterOAuthTransaction) async throws -> (tokens: [String:Any], identity: [String:Any]) {
        guard returned.scheme == redirectURI.scheme, returned.host == redirectURI.host,
              returned.port == redirectURI.port,
              URLComponents(url:returned,resolvingAgainstBaseURL:false)?.percentEncodedPath ==
                URLComponents(url:redirectURI,resolvingAgainstBaseURL:false)?.percentEncodedPath,
              returned.user == nil, returned.password == nil, returned.fragment == nil,
              transaction.expiresAt > Date(),
              [transaction.state,transaction.verifier,transaction.nonce].allSatisfy(validProof) else {
            throw XCenterOAuthFailure.invalidCallback
        }
        let values = URLComponents(url:returned,resolvingAgainstBaseURL:false)?.queryItems ?? []
        let codes = values.filter { $0.name == "code" }, states = values.filter { $0.name == "state" }
        guard codes.count == 1, let code = codes[0].value, !code.isEmpty, states.count == 1,
              states[0].value == transaction.state, !values.contains(where:{$0.name == "error"}) else {
            throw XCenterOAuthFailure.invalidCallback
        }
        let tokens = try await request("/token",form:["grant_type":"authorization_code","code":code,
            "redirect_uri":redirectURI.absoluteString,"code_verifier":transaction.verifier])
        return try await verify(tokens,nonce:transaction.nonce)
    }

    public func refresh(_ refreshToken: String, subject: String) async throws -> (tokens: [String:Any], identity: [String:Any]) {
        guard !refreshToken.isEmpty,!subject.isEmpty else { throw XCenterOAuthFailure.invalidToken }
        let tokens = try await request("/token",form:["grant_type":"refresh_token","refresh_token":refreshToken])
        guard let next = tokens["refresh_token"] as? String, !next.isEmpty else { throw XCenterOAuthFailure.invalidToken }
        return try await verify(tokens,subject:subject)
    }

    @_spi(Server) public func beginDevice(scopes: [String] = []) async throws -> (userCode:String,verificationURL:URL,transaction:XCenterDeviceTransaction) {
        guard secret != nil else { throw XCenterOAuthFailure.unsupported }
        let nonce = try rng()
        let response = try await request("/device/auth",form:["client_id":clientID,"scope":try scope(scopes),"nonce":nonce])
        guard let code = response["user_code"] as? String, !code.isEmpty,
              let device = response["device_code"] as? String, !device.isEmpty,
              let expires = response["expires_in"] as? Int, expires > 0,
              let location = (response["verification_uri_complete"] ?? response["verification_uri"]) as? String,
              let url = URL(string:location), url.scheme == "https", url.host == "id.xcenter.it",
              url.port == nil,url.user == nil,url.password == nil,url.fragment == nil,url.path == "/device" else {
            throw XCenterOAuthFailure.invalidToken
        }
        return (code,url,XCenterDeviceTransaction(nonce:nonce,deviceCode:device,
            expiresAt:Date().addingTimeInterval(Double(expires)),interval:max(1,response["interval"] as? Int ?? 5)))
    }

    @_spi(Server) public func completeDevice(_ transaction: XCenterDeviceTransaction) async throws -> (tokens:[String:Any],identity:[String:Any]) {
        guard secret != nil,validProof(transaction.nonce),!transaction.deviceCode.isEmpty else { throw XCenterOAuthFailure.unsupported }
        var interval = max(1,transaction.interval)
        while transaction.expiresAt > Date() {
            try Task.checkCancellation()
            let delay = min(Double(interval),max(0,transaction.expiresAt.timeIntervalSinceNow))
            try await Task.sleep(nanoseconds:UInt64(delay * 1_000_000_000))
            guard transaction.expiresAt > Date() else { break }
            do {
                let tokens = try await request("/token",form:["grant_type":"urn:ietf:params:oauth:grant-type:device_code",
                    "device_code":transaction.deviceCode])
                return try await verify(tokens,nonce:transaction.nonce)
            } catch XCenterOAuthFailure.http(_, "slow_down") { interval += 5 }
            catch XCenterOAuthFailure.http(_, "authorization_pending") { continue }
        }
        throw XCenterOAuthFailure.expired
    }

    private func validProof(_ value:String) -> Bool {
        (22...128).contains(value.utf8.count) && value.range(of:"[^A-Za-z0-9_-]",options:.regularExpression) == nil
    }

    private func request(_ path:String,form:[String:String]?=nil,token:String?=nil) async throws -> [String:Any] {
        var request=URLRequest(url:URL(string:XCenterDataClient.issuer.absoluteString+path)!,timeoutInterval:25)
        request.httpShouldHandleCookies=false
        if let token { request.setValue("Bearer "+token,forHTTPHeaderField:"Authorization") }
        if var form {
            request.httpMethod="POST"
            request.setValue("application/x-www-form-urlencoded",forHTTPHeaderField:"Content-Type")
            if let secret {
                let auth=Self.escape(clientID)+":"+Self.escape(secret)
                request.setValue("Basic "+Data(auth.utf8).base64EncodedString(),forHTTPHeaderField:"Authorization")
            } else { form["client_id"]=clientID }
            request.httpBody=Data(form.map { Self.escape($0.key)+"="+Self.escape($0.value) }.joined(separator:"&").utf8)
        }
        let (body,response)=try await session.data(for:request,delegate:RejectRedirects())
        guard let http=response as? HTTPURLResponse else { throw XCenterOAuthFailure.invalidToken }
        let json=(try? JSONSerialization.jsonObject(with:body)) as? [String:Any]
        guard (200..<300).contains(http.statusCode) else { throw XCenterOAuthFailure.http(http.statusCode,json?["error"] as? String) }
        guard let json else { throw XCenterOAuthFailure.invalidToken }
        return json
    }

    private static func escape(_ value:String) -> String {
        value.addingPercentEncoding(withAllowedCharacters:CharacterSet(charactersIn:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"))!
    }

    private func verify(_ tokens: [String:Any],nonce:String?=nil,subject:String?=nil) async throws -> (tokens:[String:Any],identity:[String:Any]) {
        guard let access=tokens["access_token"] as? String,!access.isEmpty,
              access.range(of:"[^A-Za-z0-9_.~-]",options:.regularExpression)==nil,
              (tokens["token_type"] as? String)?.lowercased()=="bearer" else { throw XCenterOAuthFailure.invalidToken }
        var expected=subject
        if let jwt=tokens["id_token"] as? String {
            let pieces=jwt.components(separatedBy:".")
            guard jwt.utf8.count<=16384,pieces.count==3,
                  let header=try JSONSerialization.jsonObject(with:decode(pieces[0])) as? [String:Any],
                  header["alg"] as? String=="RS256",let kid=header["kid"] as? String,!kid.isEmpty else { throw XCenterOAuthFailure.invalidToken }
            let keys=try await request("/jwks")
            let match=(keys["keys"] as? [[String:Any]] ?? []).filter{
                $0["kid"] as? String==kid && $0["kty"] as? String=="RSA" &&
                ($0["alg"]==nil || $0["alg"] as? String=="RS256") && ($0["use"]==nil || $0["use"] as? String=="sig")
            }
            guard match.count==1,let modulus=match[0]["n"] as? String,let exponent=match[0]["e"] as? String else {
                throw XCenterOAuthFailure.invalidToken
            }
            let der=asn(0x30,try integer(decode(modulus))+integer(decode(exponent)))
            let attrs=[kSecAttrKeyType:kSecAttrKeyTypeRSA,kSecAttrKeyClass:kSecAttrKeyClassPublic] as CFDictionary
            guard let key=SecKeyCreateWithData(der as CFData,attrs,nil),
                  SecKeyVerifySignature(key,.rsaSignatureMessagePKCS1v15SHA256,Data((pieces[0]+"."+pieces[1]).utf8) as CFData,
                    try decode(pieces[2]) as CFData,nil),
                  let claims=try JSONSerialization.jsonObject(with:decode(pieces[1])) as? [String:Any] else {
                throw XCenterOAuthFailure.invalidToken
            }
            let audiences=claims["aud"] as? [String] ?? (claims["aud"] as? String).map{[$0]} ?? []
            let now=Date().timeIntervalSince1970
            guard claims["iss"] as? String==XCenterDataClient.issuer.absoluteString,audiences.contains(clientID),
                  (audiences.count==1 && claims["azp"]==nil) || claims["azp"] as? String==clientID,
                  let exp=claims["exp"] as? Double,exp>now,let iat=claims["iat"] as? Double,iat<=now+60,
                  claims["nbf"]==nil || (claims["nbf"] as? Double).map({$0<=now})==true,
                  let sub=claims["sub"] as? String,!sub.isEmpty,
                  nonce==nil || claims["nonce"] as? String==nonce,subject==nil || sub==subject else {
                throw XCenterOAuthFailure.invalidToken
            }
            expected=sub
        } else if nonce != nil { throw XCenterOAuthFailure.invalidToken }
        let profile=try await request("/me",token:access)
        guard let expected,profile["sub"] as? String==expected else { throw XCenterOAuthFailure.invalidToken }
        return (tokens,profile)
    }

    private func integer(_ data: Data) -> Data {
        let bytes=Data(data.drop(while:{$0==0}))
        let first=bytes.first ?? 0
        return asn(0x02,bytes.isEmpty || first>=128 ? Data([0])+bytes : bytes)
    }

    private func asn(_ tag:UInt8,_ data:Data) -> Data {
        if data.count<128 { return Data([tag,UInt8(data.count)])+data }
        var length=data.count, bytes=[UInt8]()
        while length>0 { bytes.insert(UInt8(length&255),at:0); length >>= 8 }
        return Data([tag,0x80|UInt8(bytes.count)]+bytes)+data
    }
}

@_spi(Server) public struct XCenterDeviceTransaction: Codable {
    public let nonce: String
    public let deviceCode: String
    public let expiresAt: Date
    public let interval: Int
}
