import SwiftUI

public struct OverviewProfile: Sendable {
    public var name: String
    public var username: String
    public var picture: URL?
    public var email: String?
    public var verified: Bool
    public var administrator: Bool

    public init(name: String, username: String, picture: URL? = nil, email: String? = nil,
                verified: Bool = false, administrator: Bool = false) {
        self.name = name
        self.username = username
        self.picture = picture
        self.email = email
        self.verified = verified
        self.administrator = administrator
    }
}

public struct AccountOverview<Settings: View>: View {
    let profile: OverviewProfile?
    let clientID: String
    let signIn: @MainActor () async throws -> Void
    let signOut: @MainActor () async throws -> Void
    let settings: Settings

    @State private var details = false
    @State private var busy = false
    @State private var error: String?

    public init(profile: OverviewProfile?, clientID: String,
                signIn: @escaping @MainActor () async throws -> Void,
                signOut: @escaping @MainActor () async throws -> Void,
                @ViewBuilder settings: () -> Settings) {
        self.profile = profile
        self.clientID = clientID
        self.signIn = signIn
        self.signOut = signOut
        self.settings = settings()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("X-Center ID", systemImage: "person.crop.square")
                .font(.headline).foregroundStyle(.tint)
            if let profile {
                identity(profile)
                Button("Manage account & data →") { details = true }.buttonStyle(.bordered)
            } else {
                Text("Sign in or create an account").foregroundStyle(.secondary)
                Button("Continue with X-Center ID") { perform(signIn) }.buttonStyle(.borderedProminent)
            }
            if !details, let error { Text(error).foregroundStyle(.red) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 20))
        .disabled(busy)
        .sheet(isPresented: $details) {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Button("Back to settings") { details = false }
                    if let profile { identity(profile) }
                    if let dashboard = URL(string: "https://id.xcenter.it/dashboard") {
                        Link("Open dashboard", destination: dashboard)
                    }
                    if !clientID.isEmpty, let app = appURL {
                        Link("Manage app", destination: app)
                    }
                    Button("Sign out", role: .destructive) {
                        perform {
                            try await signOut()
                            details = false
                        }
                    }
                    if let error { Text(error).foregroundStyle(.red) }
                    Divider()
                    settings
                }
                .frame(maxWidth: 560, alignment: .leading)
                .padding(20)
            }
            .disabled(busy)
        }
        .onChange(of: profile == nil) { signedOut in
            if signedOut { details = false }
        }
    }

    private var appURL: URL? {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        guard let segment = clientID.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "https://id.xcenter.it/permissions/" + segment)
    }

    private func identity(_ profile: OverviewProfile) -> some View {
        HStack(alignment: .top, spacing: 12) {
            AsyncImage(url: profile.picture?.scheme == "https" ? profile.picture : nil) { image in
                image.resizable().scaledToFill()
            } placeholder: {
                Image(systemName: "person.crop.circle.fill").font(.largeTitle).foregroundStyle(.tint)
            }
            .frame(width: 52, height: 52)
            .clipShape(Circle())
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(profile.name).font(.headline)
                Text("@" + profile.username).foregroundStyle(.secondary)
                if let email = profile.email { Text(email).foregroundStyle(.secondary) }
                if profile.verified { Label("Verified profile", systemImage: "checkmark.seal.fill").font(.caption) }
                if profile.administrator { Label("Administrator", systemImage: "shield.fill").font(.caption) }
            }
        }
    }

    @MainActor
    private func perform(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do { try await operation() }
            catch is CancellationError { }
            catch { self.error = "X-Center ID could not complete this action." }
        }
    }
}
