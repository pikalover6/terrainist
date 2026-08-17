import SwiftUI

enum ModelChoice: String, CaseIterable, Identifiable {
    case pinned, luna, custom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .pinned: return "pinned (Gemini 3.7 Flash)"
        case .luna: return "GPT 5.6 Luna"
        case .custom: return "Custom…"
        }
    }
}

private let effortLevels = ["pinned", "low", "medium", "high", "xhigh", "max"]
private let maxLogBytes = 2_000_000

@MainActor
final class RunState: ObservableObject {
    @Published var log: String = ""
    @Published var status: String = "idle"
    @Published var running: Bool = false

    private var runner: ProcessRunner?
    private var startedAt: Date?
    private var timer: Timer?

    func append(_ s: String) {
        log += s
        if log.utf8.count > maxLogBytes {
            log = String(log.suffix(maxLogBytes / 2))
        }
    }

    func cancel() {
        runner?.cancel()
        status = "cancelling…"
    }

    func start(_ settings: GenerateSettings) {
        guard !running else { return }
        log = ""
        running = true
        startedAt = Date()
        tick(phase: "authoring + compiling")

        let stamp = Self.timestamp()
        let outDir = Paths.runsDir.appendingPathComponent(stamp, isDirectory: true)
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

        let args = settings.generateArgs(outDir: outDir.path)
        append("$ \(Paths.node) \(args.map(Self.shellQuote).joined(separator: " "))\n\n")

        Task {
            let r = ProcessRunner()
            self.runner = r
            let code = await r.run(args: args) { chunk in
                Task { @MainActor in self.append(chunk) }
            }
            await self.finishGenerate(code: code, settings: settings)
        }
    }

    private func finishGenerate(code: Int32, settings: GenerateSettings) async {
        guard code == 0 else {
            stopTimer()
            running = false
            status = "failed (exit \(code))"
            return
        }
        guard settings.autoInstall, let worldDir = LogParse.installedWorldDir(from: log) else {
            stopTimer()
            running = false
            status = code == 0 ? "done (generated, not installed)" : "failed"
            return
        }

        tick(phase: "installing")
        var args = [Paths.cli, "install", worldDir, "--saves", Paths.saves]
        let channel = settings.channel.trimmingCharacters(in: .whitespaces)
        if !channel.isEmpty { args += ["--channel", channel] }
        append("\n$ \(Paths.node) \(args.map(Self.shellQuote).joined(separator: " "))\n\n")

        let r = ProcessRunner()
        runner = r
        let icode = await r.run(args: args) { chunk in
            Task { @MainActor in self.append(chunk) }
        }
        stopTimer()
        running = false
        let name = (worldDir as NSString).lastPathComponent
        status = icode == 0 ? "done — installed \(name)" : "install failed (exit \(icode))"
    }

    private func tick(phase: String) {
        stopTimer()
        let start = startedAt ?? Date()
        status = "\(phase) — 0s"
        let t = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                guard self.running else { return }
                self.status = "\(phase) — \(Int(Date().timeIntervalSince(start)))s"
            }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func stopTimer() {
        timer?.invalidate()
        timer = nil
    }

    private static func timestamp() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd_HHmmss"
        return f.string(from: Date())
    }

    static func shellQuote(_ s: String) -> String {
        s.rangeOfCharacter(from: CharacterSet(charactersIn: " \"'$\\")) == nil
            ? s : "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}

struct ContentView: View {
    @AppStorage("prompt") private var prompt = ""
    @AppStorage("seed") private var seed = ""
    @AppStorage("size") private var size = "512"
    @AppStorage("modelChoice") private var modelChoiceRaw = ModelChoice.pinned.rawValue
    @AppStorage("customModel") private var customModel = ""
    @AppStorage("effort") private var effort = "pinned"
    @AppStorage("compileRounds") private var compileRounds = 4
    @AppStorage("bespokeBudget") private var bespokeBudget = "1.00"
    @AppStorage("channel") private var channel = "dev"
    @AppStorage("keepDoc") private var keepDoc = true
    @AppStorage("autoInstall") private var autoInstall = true

    @StateObject private var run = RunState()

    private var modelChoice: ModelChoice {
        ModelChoice(rawValue: modelChoiceRaw) ?? .pinned
    }

    private var modelID: String {
        switch modelChoice {
        case .pinned: return ""
        case .luna: return "openai/gpt-5.6-luna"
        case .custom: return customModel
        }
    }

    private var settings: GenerateSettings {
        GenerateSettings(
            prompt: prompt, seed: seed, size: size, model: modelID,
            effort: effort == "pinned" ? "" : effort,
            compileRounds: compileRounds, bespokeBudget: bespokeBudget,
            channel: channel, keepDoc: keepDoc, autoInstall: autoInstall)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Prompt").font(.headline)
            TextEditor(text: $prompt)
                .font(.system(size: 13))
                .frame(height: 80)
                .border(Color.secondary.opacity(0.3))

            Form {
                HStack {
                    TextField("Seed (optional)", text: $seed).frame(width: 160)
                    TextField("Size", text: $size).frame(width: 90)
                    Stepper("Compile rounds: \(compileRounds)", value: $compileRounds, in: 0...5)
                }
                HStack {
                    Picker("Model", selection: $modelChoiceRaw) {
                        ForEach(ModelChoice.allCases) { c in Text(c.label).tag(c.rawValue) }
                    }.frame(width: 280)
                    if modelChoice == .custom {
                        TextField("model id", text: $customModel).frame(width: 220)
                    }
                    Picker("Effort", selection: $effort) {
                        ForEach(effortLevels, id: \.self) { Text($0).tag($0) }
                    }.frame(width: 180)
                }
                HStack {
                    TextField("Bespoke budget (usd)", text: $bespokeBudget).frame(width: 200)
                    TextField("Install channel", text: $channel).frame(width: 180)
                }
                HStack {
                    Toggle("Keep doc", isOn: $keepDoc)
                    Toggle("Auto-install", isOn: $autoInstall)
                }
            }
            .formStyle(.columns)

            HStack(spacing: 12) {
                if run.running {
                    Button("Cancel") { run.cancel() }
                } else {
                    Button("Generate") { run.start(settings) }
                        .keyboardShortcut(.return, modifiers: .command)
                        .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                Text(run.status).foregroundStyle(.secondary)
                Spacer()
            }

            ScrollViewReader { proxy in
                ScrollView {
                    Text(run.log)
                        .font(.system(size: 11, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(4)
                        .id("logBottomAnchor")
                }
                .frame(maxHeight: .infinity)
                .border(Color.secondary.opacity(0.3))
                .onChange(of: run.log) {
                    proxy.scrollTo("logBottomAnchor", anchor: .bottom)
                }
            }
        }
        .padding(16)
    }
}
