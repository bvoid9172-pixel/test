import Foundation
import SwiftUI

// MARK: - Where the Class Timer app saves your timetable for the widget
enum SharedData {
    /// ~/Library/Application Support/Atlantis Class Timer/widget-timetable.json
    /// (The widget is sandboxed, so it asks for the real home folder instead of its own.)
    static var fileURL: URL? {
        guard let entry = getpwuid(getuid()) else { return nil }
        let home = String(cString: entry.pointee.pw_dir)
        return URL(fileURLWithPath: home)
            .appendingPathComponent("Library/Application Support/Atlantis Class Timer/widget-timetable.json")
    }
}

// MARK: - File format written by the Class Timer app
struct ClassEntry: Codable, Hashable {
    let day: Int          // 0 = Sunday … 6 = Saturday
    let start: String     // "HH:mm"
    let end: String       // "HH:mm"
    let subject: String
    let room: String?
    let teacher: String?
    let week: String?     // "A" / "B" / nil when the timetable doesn't alternate
}

struct WeekAnchor: Codable {
    let letter: String    // which week the Monday below belongs to
    let monday: String    // "yyyy-MM-dd"
}

/// A layout you built in the app's designer for one widget size.
struct LayoutConfig: Codable {
    let items: [String]
    let size: Double?
    let align: String?
    let font: String?
    let opacity: Double?
    let own: Bool?
    let bg: String?
    let fg: String?
    let acc: String?
}

struct LayoutSet: Codable {
    let small: LayoutConfig?
    let medium: LayoutConfig?
    let large: LayoutConfig?
}

struct TimetableFile: Codable {
    let entries: [ClassEntry]
    let weekAnchor: WeekAnchor?
    let theme: String?
    let layouts: LayoutSet?
}

struct Occurrence: Hashable {
    let subject: String
    let room: String
    let teacher: String
    let start: Date
    let end: Date
}

func loadTimetable() -> TimetableFile? {
    guard let url = SharedData.fileURL,
          let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(TimetableFile.self, from: data)
}

// MARK: - Turning the weekly timetable into real dates
private func timeOn(_ hhmm: String, day: Date, calendar: Calendar) -> Date? {
    let parts = hhmm.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return nil }
    return calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day)
}

private func weekLetter(for day: Date, anchor: WeekAnchor?) -> String? {
    guard let anchor = anchor else { return nil }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    guard let anchorMonday = formatter.date(from: anchor.monday) else { return nil }
    let calendar = Calendar(identifier: .gregorian)
    let daysFromMonday = (calendar.component(.weekday, from: day) + 5) % 7   // Monday = 0
    guard let monday = calendar.date(byAdding: .day, value: -daysFromMonday,
                                     to: calendar.startOfDay(for: day)) else { return nil }
    let dayCount = calendar.dateComponents([.day], from: anchorMonday, to: monday).day ?? 0
    let weeks = Int((Double(dayCount) / 7.0).rounded())
    let sameWeek = ((weeks % 2) + 2) % 2 == 0
    if sameWeek { return anchor.letter }
    return anchor.letter == "A" ? "B" : "A"
}

/// Every class from today for the next `days` days, soonest first.
func occurrences(from now: Date, days: Int = 9, file: TimetableFile) -> [Occurrence] {
    let calendar = Calendar.current
    let startOfToday = calendar.startOfDay(for: now)
    var result: [Occurrence] = []
    for offset in 0..<days {
        guard let day = calendar.date(byAdding: .day, value: offset, to: startOfToday) else { continue }
        let weekday = calendar.component(.weekday, from: day) - 1      // Sunday = 0
        let letter = weekLetter(for: day, anchor: file.weekAnchor)
        for entry in file.entries where entry.day == weekday {
            if let w = entry.week, let l = letter, w != l { continue }
            guard let s = timeOn(entry.start, day: day, calendar: calendar),
                  let e = timeOn(entry.end, day: day, calendar: calendar) else { continue }
            result.append(Occurrence(subject: entry.subject,
                                     room: entry.room ?? "",
                                     teacher: entry.teacher ?? "",
                                     start: s, end: e))
        }
    }
    return result.sorted { $0.start < $1.start }
}

// MARK: - Colour schemes (same names as the app)
struct Theme {
    let bg: Color
    let fg: Color
    let fg3: Color
    let acc: Color

    static func named(_ name: String?) -> Theme {
        switch name {
        case "ocean":  return Theme(bg: Color(hex: 0x0f1b2a), fg: Color(hex: 0xe6f1fb), fg3: Color(hex: 0x7f9bb8), acc: Color(hex: 0x8fd0f7))
        case "forest": return Theme(bg: Color(hex: 0x111a14), fg: Color(hex: 0xe6f3ea), fg3: Color(hex: 0x82a08a), acc: Color(hex: 0x9ae0b5))
        case "sunset": return Theme(bg: Color(hex: 0x1e1416), fg: Color(hex: 0xfbeaea), fg3: Color(hex: 0xb08f92), acc: Color(hex: 0xffb08c))
        case "violet": return Theme(bg: Color(hex: 0x181426), fg: Color(hex: 0xefeaff), fg3: Color(hex: 0x9388bd), acc: Color(hex: 0xc9b8ff))
        case "mono":   return Theme(bg: Color(hex: 0x1a1a1a), fg: Color(hex: 0xf2f2f2), fg3: Color(hex: 0x8c8c8c), acc: Color(hex: 0xc8c8c8))
        case "light":  return Theme(bg: Color(hex: 0xffffff), fg: Color(hex: 0x1b1f2a), fg3: Color(hex: 0x6b7186), acc: Color(hex: 0x3743c4))
        default:       return Theme(bg: Color(hex: 0x14161f), fg: Color(hex: 0xe8eaf2), fg3: Color(hex: 0x8b90a8), acc: Color(hex: 0x9fb0ff))
        }
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255.0,
                  green: Double((hex >> 8) & 0xFF) / 255.0,
                  blue: Double(hex & 0xFF) / 255.0)
    }
}

extension Color {
    /// "#rrggbb" text from the app → Color
    init(hexString: String) {
        var s = hexString.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s = String(s.dropFirst()) }
        let value = UInt32(s, radix: 16) ?? 0x14161f
        self.init(hex: value)
    }
}
