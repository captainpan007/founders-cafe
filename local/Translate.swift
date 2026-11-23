import Foundation
import Translation

// Only already installed, on-device languages are used. Never request a download.
struct Request: Decodable {
    let source: String
    let target: String
    let text: String
}

@main struct LocalTranslation {
    static func main() async {
        guard #available(macOS 26.0, *) else { return }
        var sessions: [String: TranslationSession] = [:]
        while let line = readLine() {
            do {
                let req = try JSONDecoder().decode(Request.self, from: Data(line.utf8))
                let from = Locale.Language(identifier: req.source == "zh" ? "zh-Hans" : "en")
                let to = Locale.Language(identifier: req.target == "zh" ? "zh-Hans" : "en")
                let key = req.source + "-" + req.target
                if sessions[key] == nil {
                    guard await LanguageAvailability().status(from: from, to: to) == .installed else {
                        throw CocoaError(.featureUnsupported)
                    }
                    sessions[key] = TranslationSession(installedSource: from, target: to)
                }
                guard let session = sessions[key] else { throw CocoaError(.featureUnsupported) }
                let result = try await session.translate(req.text)
                emit(["text": result.targetText])
            } catch {
                emit(["error": "unavailable"])
            }
        }
    }
    static func emit(_ result: [String: String]) {
        if let data = try? JSONEncoder().encode(result) {
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data([10]))
        }
    }
}
