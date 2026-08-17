import Foundation

enum Paths {
    static let repoRoot = URL(fileURLWithPath: "/Users/kaihoward/Dev/terrainist", isDirectory: true)
    static let node = "/opt/homebrew/bin/node"
    static let cli = "packages/cli/dist/index.js"
    static let saves =
        "/Users/kaihoward/Library/Application Support/PrismLauncher/instances/Fabulously Optimized/minecraft/saves"

    static var runsDir: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("TerrainistDev/runs", isDirectory: true)
    }
}

struct GenerateSettings {
    var prompt: String = ""
    var seed: String = ""
    var size: String = "512"
    var model: String = ""      // empty = pinned
    var effort: String = ""     // empty = pinned
    var compileRounds: Int = 4
    var bespokeBudget: String = "1.00"
    var channel: String = "dev"
    var keepDoc: Bool = true
    var autoInstall: Bool = true

    func generateArgs(outDir: String) -> [String] {
        var a = [Paths.cli, "generate", prompt]
        let seedTrimmed = seed.trimmingCharacters(in: .whitespaces)
        if !seedTrimmed.isEmpty { a += ["--seed", seedTrimmed] }
        let sizeTrimmed = size.trimmingCharacters(in: .whitespaces)
        if !sizeTrimmed.isEmpty { a += ["--size", sizeTrimmed] }
        let modelTrimmed = model.trimmingCharacters(in: .whitespaces)
        if !modelTrimmed.isEmpty { a += ["--model", modelTrimmed] }
        let effortTrimmed = effort.trimmingCharacters(in: .whitespaces)
        if !effortTrimmed.isEmpty { a += ["--effort", effortTrimmed] }
        a += ["--compile-rounds", String(compileRounds)]
        let budgetTrimmed = bespokeBudget.trimmingCharacters(in: .whitespaces)
        if !budgetTrimmed.isEmpty { a += ["--bespoke-budget", budgetTrimmed] }
        if keepDoc { a.append("--keep-doc") }
        a += ["--out", outDir]
        return a
    }
}

/// Runs `node <cli> ...` from the repo root, streaming combined stdout+stderr.
final class ProcessRunner {
    private var process: Process?

    func cancel() {
        process?.terminate()
    }

    /// Returns the exit status. `onOutput` is called off the main thread.
    func run(args: [String], onOutput: @escaping (String) -> Void) async -> Int32 {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: Paths.node)
        p.arguments = args
        p.currentDirectoryURL = Paths.repoRoot
        var env = ProcessInfo.processInfo.environment
        let path = env["PATH"] ?? ""
        env["PATH"] = "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin" + (path.isEmpty ? "" : ":" + path)
        p.environment = env

        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        process = p

        do {
            try p.run()
        } catch {
            onOutput("failed to launch \(Paths.node): \(error.localizedDescription)\n")
            process = nil
            return -1
        }

        let handle = pipe.fileHandleForReading
        return await withCheckedContinuation { (cont: CheckedContinuation<Int32, Never>) in
            handle.readabilityHandler = { h in
                let data = h.availableData
                if data.isEmpty { return }
                if let s = String(data: data, encoding: .utf8) { onOutput(s) }
            }
            p.terminationHandler = { proc in
                // Drain whatever is left.
                let rest = handle.availableData
                if !rest.isEmpty, let s = String(data: rest, encoding: .utf8) { onOutput(s) }
                handle.readabilityHandler = nil
                cont.resume(returning: proc.terminationStatus)
            }
        }
    }
}

enum LogParse {
    /// Pulls the world dir out of a `next: terrainist install <dir>` line.
    static func installedWorldDir(from log: String) -> String? {
        var found: String?
        for rawLine in log.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            guard let r = line.range(of: "next: terrainist install ") else { continue }
            let path = String(line[r.upperBound...]).trimmingCharacters(in: .whitespaces)
            if !path.isEmpty { found = path }
        }
        return found
    }
}
