import Foundation

public struct XCenterSessionTokens: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String?
    public let expiresAt: Date

    public init(accessToken:String, refreshToken:String?, expiresAt:Date) {
        self.accessToken=accessToken
        self.refreshToken=refreshToken
        self.expiresAt=expiresAt
    }
}

/// Use one source per stored product session. Multi-process backends also need a shared lock.
public actor XCenterSessionTokenSource {
    private let load: @Sendable () async throws -> XCenterSessionTokens?
    private let save: @Sendable (XCenterSessionTokens) async throws -> Void
    private let refresh: @Sendable (String) async throws -> XCenterSessionTokens
    private var pending: Task<String, Error>?

    public init(load:@escaping @Sendable () async throws -> XCenterSessionTokens?,
                save:@escaping @Sendable (XCenterSessionTokens) async throws -> Void,
                refresh:@escaping @Sendable (String) async throws -> XCenterSessionTokens) {
        self.load=load
        self.save=save
        self.refresh=refresh
    }

    public func accessToken() async throws -> String {
        if let pending { return try await pending.value }
        let task=Task { [load,save,refresh] in
            guard let current=try await load(),!current.accessToken.isEmpty else { throw XCenterOAuthFailure.expired }
            if current.expiresAt.timeIntervalSinceNow > 30 { return current.accessToken }
            guard let token=current.refreshToken,!token.isEmpty else {
                if current.expiresAt > Date() { return current.accessToken }
                throw XCenterOAuthFailure.expired
            }
            let next=try await refresh(token)
            guard !next.accessToken.isEmpty,let rotated=next.refreshToken,!rotated.isEmpty,next.expiresAt>Date() else {
                throw XCenterOAuthFailure.invalidToken
            }
            try await save(next)
            return next.accessToken
        }
        pending=task
        defer { pending=nil }
        return try await task.value
    }
}
