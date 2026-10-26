import WidgetKit
import SwiftUI

// MARK: - Timeline
struct TimerEntry: TimelineEntry {
    let date: Date
    let current: Occurrence?
    let next: Occurrence?
    let agenda: [Occurrence]   // current + upcoming classes, used by the large widget
    let today: [Occurrence]    // every class today, used by the day timeline piece
    let layouts: LayoutSet?    // layouts built in the app's designer
    let theme: Theme
    let hasData: Bool
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> TimerEntry {
        let now = Date()
        let current = Occurrence(subject: "Maths", room: "H3", teacher: "L Turner",
                                 start: now.addingTimeInterval(-1200), end: now.addingTimeInterval(2400))
        let next = Occurrence(subject: "PE", room: "H2", teacher: "P Griffiths",
                              start: now.addingTimeInterval(3600), end: now.addingTimeInterval(7200))
        let later1 = Occurrence(subject: "English", room: "A2.2", teacher: "F Van Bentum",
                                start: now.addingTimeInterval(9000), end: now.addingTimeInterval(12000))
        let later2 = Occurrence(subject: "Science", room: "MPC4", teacher: "O Glass",
                                start: now.addingTimeInterval(13000), end: now.addingTimeInterval(16000))
        return TimerEntry(date: now, current: current, next: next,
                          agenda: [current, next, later1, later2],
                          today: [current, next, later1, later2],
                          layouts: nil,
                          theme: Theme.named(nil), hasData: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (TimerEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
        } else {
            completion(makeEntries(now: Date())[0])
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TimerEntry>) -> Void) {
        let now = Date()
        // One entry per class start/end, so the card flips at the right moment.
        // The countdown itself ticks live without needing new entries.
        completion(Timeline(entries: makeEntries(now: now), policy: .after(now.addingTimeInterval(300))))
    }

    private func makeEntries(now: Date) -> [TimerEntry] {
        guard let file = loadTimetable() else {
            return [TimerEntry(date: now, current: nil, next: nil, agenda: [], today: [], layouts: nil, theme: Theme.named(nil), hasData: false)]
        }
        let all = occurrences(from: now, file: file)
        let theme = Theme.named(file.theme)
        var moments: Set<Date> = [now]
        for o in all {
            if o.start > now { moments.insert(o.start) }
            if o.end > now { moments.insert(o.end) }
        }
        return moments.sorted().prefix(24).map { moment in
            TimerEntry(date: moment,
                       current: all.first(where: { $0.start <= moment && moment < $0.end }),
                       next: all.first(where: { $0.start > moment }),
                       agenda: Array(all.filter { $0.end > moment }.prefix(8)),
                       today: all.filter { Calendar.current.isDate($0.start, inSameDayAs: moment) },
                       layouts: file.layouts,
                       theme: theme,
                       hasData: true)
        }
    }
}

// MARK: - View
struct ClassTimerWidgetView: View {
    let entry: TimerEntry
    @Environment(\.widgetFamily) private var family

    private static let timeFormat: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .short
        return f
    }()

    /// The layout you designed for this widget size, if you made one.
    private var layout: LayoutConfig? {
        guard entry.hasData else { return nil }
        var found: LayoutConfig? = nil
        switch family {
        case .systemSmall: found = entry.layouts?.small
        case .systemMedium: found = entry.layouts?.medium
        case .systemLarge: found = entry.layouts?.large
        default: found = nil
        }
        if let f = found, !f.items.isEmpty { return f }
        return nil
    }

    private var backgroundColor: Color {
        guard let l = layout else { return entry.theme.bg }
        var base: Color = entry.theme.bg
        if l.own == true, let hex = l.bg { base = Color(hexString: hex) }
        return base.opacity((l.opacity ?? 100) / 100.0)
    }

    var body: some View {
        Group {
            if let l = layout {
                CustomLayoutView(entry: entry, cfg: l)
            } else {
                defaultBody
            }
        }
        .containerBackground(backgroundColor, for: .widget)
    }

    @ViewBuilder
    private var defaultBody: some View {
        let theme = entry.theme
        let large = family == .systemLarge
        VStack(alignment: .leading, spacing: large ? 6 : 3) {
            if !entry.hasData {
                Text("No timetable yet")
                    .font(.headline)
                    .foregroundStyle(theme.fg)
                Text("Open the Class Timer app once so it can share your timetable.")
                    .font(.caption)
                    .foregroundStyle(theme.fg3)
            } else if let current = entry.current {
                caption("TIME LEFT", theme)
                countdown(until: current.end, theme: theme)
                details(current, theme)
                if large {
                    progressBar(current, theme)
                } else if family != .systemSmall, let next = entry.next {
                    nextLine(next, theme)
                }
            } else if let next = entry.next {
                caption("NEXT CLASS IN", theme)
                countdown(until: next.start, theme: theme)
                details(next, theme)
            } else {
                Text("No more classes")
                    .font(.headline)
                    .foregroundStyle(theme.fg)
            }
            if large && entry.hasData {
                agendaList(theme)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: Large widget pieces
    private func progressBar(_ o: Occurrence, _ theme: Theme) -> some View {
        ProgressView(timerInterval: o.start...o.end, countsDown: false,
                     label: { EmptyView() }, currentValueLabel: { EmptyView() })
            .progressViewStyle(.linear)
            .tint(theme.acc)
            .padding(.top, 2)
    }

    /// The classes shown in the list: everything coming up except the one already in the header.
    private func listItems() -> [Occurrence] {
        let shown = entry.current ?? entry.next
        return entry.agenda.filter { $0 != shown }
    }

    private func whenLabel(_ o: Occurrence) -> String {
        let time = Self.timeFormat.string(from: o.start)
        let cal = Calendar.current
        if cal.isDateInToday(o.start) { return time }
        if cal.isDateInTomorrow(o.start) { return "Tmrw " + time }
        let f = DateFormatter()
        f.dateFormat = "EEE"
        return f.string(from: o.start) + " " + time
    }

    private func agendaList(_ theme: Theme) -> some View {
        let items = Array(listItems().prefix(5))
        return VStack(alignment: .leading, spacing: 6) {
            Rectangle()
                .fill(theme.fg3.opacity(0.3))
                .frame(height: 1)
                .padding(.top, 4)
            caption("COMING UP", theme)
            if items.isEmpty {
                Text("Nothing else scheduled")
                    .font(.system(size: 12))
                    .foregroundStyle(theme.fg3)
            } else {
                ForEach(Array(items.enumerated()), id: \.offset) { _, o in
                    agendaRow(o, theme)
                }
            }
        }
    }

    private func agendaRow(_ o: Occurrence, _ theme: Theme) -> some View {
        HStack(spacing: 8) {
            Text(whenLabel(o))
                .font(.system(size: 12, weight: .medium))
                .monospacedDigit()
                .foregroundStyle(theme.fg3)
                .frame(width: 70, alignment: .leading)
            Text(o.subject)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
                .foregroundStyle(theme.fg)
            Spacer(minLength: 4)
            if !o.room.isEmpty {
                Text(o.room)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(theme.acc)
            }
            if !o.teacher.isEmpty {
                Text(o.teacher)
                    .font(.system(size: 11))
                    .lineLimit(1)
                    .foregroundStyle(theme.fg3)
            }
        }
    }

    private func caption(_ text: String, _ theme: Theme) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold))
            .tracking(0.8)
            .foregroundStyle(theme.fg3)
    }

    private func countdown(until end: Date, theme: Theme) -> some View {
        let start = min(entry.date, end)
        return Text(timerInterval: start...end, countsDown: true)
            .font(.system(size: family == .systemSmall ? 32 : (family == .systemLarge ? 52 : 40), weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(theme.fg)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func details(_ o: Occurrence, _ theme: Theme) -> some View {
        var second = ""
        if !o.room.isEmpty { second = "📍 " + o.room }
        if !o.teacher.isEmpty { second += (second.isEmpty ? "" : " · ") + o.teacher }
        return VStack(alignment: .leading, spacing: 2) {
            Text(o.subject)
                .font(.system(size: 14, weight: .semibold))
                .lineLimit(1)
                .foregroundStyle(theme.fg)
            if !second.isEmpty {
                Text(second)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
                    .foregroundStyle(theme.acc)
            }
        }
    }

    private func nextLine(_ o: Occurrence, _ theme: Theme) -> some View {
        let room = o.room.isEmpty ? "room not set" : o.room
        let time = Self.timeFormat.string(from: o.start)
        return Text("Next: \(o.subject) · \(room) · \(time)")
            .font(.system(size: 11))
            .lineLimit(1)
            .foregroundStyle(theme.fg3)
    }
}

// MARK: - Widget
@main
struct ClassTimerWidgetBundle: WidgetBundle {
    var body: some Widget {
        ClassTimerWidget()
    }
}

struct ClassTimerWidget: Widget {
    let kind = "ClassTimerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            ClassTimerWidgetView(entry: entry)
        }
        .configurationDisplayName("Class Timer")
        .description("Time left in class, your next class and its room. Large also lists the rest of your day. Customise each size in the app.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
