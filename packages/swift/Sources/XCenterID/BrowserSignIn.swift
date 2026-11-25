import Foundation
import AuthenticationServices

public enum SignInFailure: Error {
    case invalidURL, unsupportedCallback, browserUnavailable, invalidCallback, alreadyRunning
}

public struct RegisteredBrowserRequest {
    public let authorizationURL: URL
    public let callbackURL: URL

    public init(authorizationURL: URL, callbackURL: URL) throws {
        guard authorizationURL.scheme == "https", authorizationURL.host == "id.xcenter.it",
              authorizationURL.port == nil, authorizationURL.path == "/auth",
              authorizationURL.user == nil, authorizationURL.password == nil, authorizationURL.fragment == nil,
              callbackURL.scheme == "https", callbackURL.host != nil, callbackURL.port == nil,
              callbackURL.user == nil, callbackURL.password == nil, callbackURL.query == nil,
              callbackURL.fragment == nil, !callbackURL.path.isEmpty
        else { throw SignInFailure.invalidURL }
        self.authorizationURL = authorizationURL
        self.callbackURL = callbackURL
    }

    func matches(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == callbackURL.host && url.port == nil &&
        url.path == callbackURL.path && url.user == nil && url.password == nil && url.fragment == nil
    }
}

@MainActor
public final class BrowserSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let anchor: ASPresentationAnchor
    private var session: ASWebAuthenticationSession?
    private var pickup: Task<Void, Never>?
    private var completion: ((Result<URL?, Error>) -> Void)?

    public init(anchor: ASPresentationAnchor) { self.anchor = anchor }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor
    }

    /// The host completes the code exchange and persists its validated product session.
    public func authorize(_ request: RegisteredBrowserRequest) async throws -> URL? {
        guard #available(iOS 17.4, macOS 14.4, *) else { throw SignInFailure.unsupportedCallback }
        let result = try await run(makeSession: { handler in
            ASWebAuthenticationSession(url: request.authorizationURL,
                callback: .https(host: request.callbackURL.host!, path: request.callbackURL.path),
                completionHandler: handler)
        })
        return try result.map { url in
            guard request.matches(url) else { throw SignInFailure.invalidCallback }
            return url
        }
    }

    public func signIn(using client:XCenterOAuth,scopes:[String]=[]) async throws -> (tokens:[String:Any],identity:[String:Any])? {
        let attempt=try client.begin(scopes:scopes)
        let request=try RegisteredBrowserRequest(authorizationURL:attempt.url,callbackURL:client.redirectURI)
        guard let callback=try await authorize(request) else { return nil }
        return try await client.complete(callback,transaction:attempt.transaction)
    }

    public func signIn(config:XCenterPublicConfig) async throws -> (tokens:[String:Any],identity:[String:Any])? {
        try await signIn(using:config.identity(),scopes:config.scopes)
    }

    /// Use a backend browser handoff when an HTTPS app callback is unavailable.
    /// The completion closure must poll and redeem a short-lived, proof-bound product session.
    public func authorizeWithPickup(browserURL: URL, backendOrigin: URL,
                                    complete: @escaping @MainActor () async throws -> Void) async throws {
        guard browserURL.scheme == "https", backendOrigin.scheme == "https",
              browserURL.host != nil, browserURL.host == backendOrigin.host,
              browserURL.port == backendOrigin.port, browserURL.user == nil,
              browserURL.password == nil, browserURL.fragment == nil
        else { throw SignInFailure.invalidURL }
        _ = try await run(makeSession: { handler in
            ASWebAuthenticationSession(url: browserURL, callbackURLScheme: nil, completionHandler: handler)
        }, poll: complete)
    }

    private func run(
        makeSession: (@escaping ASWebAuthenticationSession.CompletionHandler) -> ASWebAuthenticationSession,
        poll: (@MainActor () async throws -> Void)? = nil
    ) async throws -> URL? {
        guard session == nil else { throw SignInFailure.alreadyRunning }
        try Task.checkCancellation()
        let attempt = UUID()
        return try await withTaskCancellationHandler(operation: {
            try await withCheckedThrowingContinuation { continuation in
                completion = { continuation.resume(with: $0) }
                let browser = makeSession { [weak self] url, error in
                    Task { @MainActor in
                        guard let self, self.attempt == attempt else { return }
                        if let error, (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin {
                            self.finish(.failure(error))
                        } else {
                            self.finish(.success(poll == nil ? url : nil))
                        }
                    }
                }
                self.attempt = attempt
                browser.presentationContextProvider = self
                session = browser
                guard browser.start() else {
                    finish(.failure(SignInFailure.browserUnavailable))
                    return
                }
                if let poll {
                    pickup = Task { @MainActor [weak self] in
                        do {
                            try await poll()
                            guard let self, self.attempt == attempt, !Task.isCancelled else { return }
                            self.finish(.success(nil))
                        } catch {
                            guard let self, self.attempt == attempt, !Task.isCancelled else { return }
                            self.finish(.failure(error))
                        }
                    }
                }
            }
        }, onCancel: {
            Task { @MainActor in
                if self.attempt == attempt { self.finish(.failure(CancellationError())) }
            }
        })
    }

    private var attempt: UUID?

    private func finish(_ result: Result<URL?, Error>) {
        guard let completion else { return }
        self.completion = nil
        attempt = nil
        pickup?.cancel()
        pickup = nil
        session?.cancel()
        session = nil
        completion(result)
    }
}
