// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TerrainistDev",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "TerrainistDev", path: "Sources/TerrainistDev")
    ]
)
