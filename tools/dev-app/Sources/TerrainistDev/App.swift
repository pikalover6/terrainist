import SwiftUI

struct TerrainistDevApp: App {
    var body: some Scene {
        WindowGroup("Terrainist Dev") {
            ContentView()
                .frame(minWidth: 720, minHeight: 640)
        }
        .windowResizability(.contentMinSize)
    }
}

@main
enum Main {
    static func main() {
        if CommandLine.arguments.contains("--selftest") {
            SelfTest.run()
            return
        }
        TerrainistDevApp.main()
    }
}

/// `--selftest` runs the CLI with no args (prints usage) through exactly the
/// same Process plumbing the Generate button uses: node path, cwd, PATH.
enum SelfTest {
    static func run() {
        let runner = ProcessRunner()
        let sem = DispatchSemaphore(value: 0)
        var status: Int32 = -1
        Task {
            status = await runner.run(args: [Paths.cli]) { chunk in
                FileHandle.standardOutput.write(Data(chunk.utf8))
            }
            sem.signal()
        }
        sem.wait()
        FileHandle.standardError.write(
            Data("\n[selftest] node+cwd+PATH plumbing exit status: \(status)\n".utf8))
        // The CLI exits non-zero on a bare usage print; only a launch failure
        // (-1) means the plumbing itself is broken.
        exit(status == -1 ? 1 : 0)
    }
}
