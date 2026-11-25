// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XCenterID",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "XCenterID", targets: ["XCenterID"]),
        .library(name: "XCenterIDServer", targets: ["XCenterIDServer"])
    ],
    targets: [
        .target(name: "XCenterID", path: "packages/swift/Sources/XCenterID"),
        .target(name: "XCenterIDServer", dependencies: ["XCenterID"], path: "packages/swift/Sources/XCenterIDServer")
    ]
)
