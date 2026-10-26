import WidgetKit
import SwiftUI

/// Draws a widget from the layout you built in the Class Timer app's designer.
struct CustomLayoutView: View {
    let entry: TimerEntry
    let cfg: LayoutConfig

    // MARK: Colours and fonts
    private var fg: Color {
        if cfg.own == true, let hex = cfg.fg { return Color(hexString: hex) }
        return entry.theme.fg
    }

    private var fg3: Color {
        if cfg.own == true, let hex = cfg.fg { return Color(hexString: hex).opacity(0.62) }
        return entry.theme.fg3
    }

    private var acc: Color {
        if cfg.own == true, let hex = cfg.acc { return Color(hexString: hex) }
        return entry.theme.acc
    }

    private var design: Font.Design {
        switch cfg.font {
        case "rounded": return .rounded
        case "serif": return .serif
        case "mono": return .monospaced
        default: return .default
        }
    }

    private var centred: Bool { cfg.align == "center" }

    private var hAlign: HorizontalAlignment { centred ? .center : .leading }

    private var frameAlign: Alignment { centred ? .top : .topLeading }

    private var rowAlign: Alignment { centred ? .center : .leading }

    // MARK: Data
    private var shown: Occurrence? { entry.current ?? entry.next }

    private var following: Occurrence? {
        if entry.current != nil { return entry.next }
        if entry.agenda.count > 1 { return entry.agenda[1] }
        return nil
    }

    private var lines: [[String]] {
        var result: [[String]] = [[]]
        for item in cfg.items {
            if item == "br" {
                result.append([])
            } else {
                result[result.count - 1].append(item)
            }
        }
        return result
    }

    private static let timeFormat: DateFormatter = {
        let f = DateFormatter()
        f.timeStyle = .short
        return f
    }()

    private static let dateFormat: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "EEE d MMM"
        return f
    }()

    private func clockText(_ d: Date) -> String {
        return Self.timeFormat.string(from: d)
    }

    private func whenLabel(_ o: Occurrence) -> String {
        let time = clockText(o.start)
        let cal = Calendar.current
        if cal.isDateInToday(o.start) { return time }
        if cal.isDateInTomorrow(o.start) { return "Tmrw " + time }
        let f = DateFormatter()
        f.dateFormat = "EEE"
        return f.string(from: o.start) + " " + time
    }

    private func captionText() -> String {
        if entry.current != nil { return "TIME LEFT" }
        if entry.next != nil { return "NEXT CLASS IN" }
        return "NO CLASSES"
    }

    private func followingText(_ f: Occurrence) -> String {
        let label = entry.current != nil ? "Next" : "Then"
        let room = f.room.isEmpty ? "room not set" : f.room
        return label + ": " + f.subject + " · " + room + " · " + clockText(f.start)
    }

    private func subjectColor(_ name: String) -> Color {
        var h = 0
        for u in name.unicodeScalars {
            h = (h &* 31 &+ Int(u.value)) % 100000
        }
        let hue = Double(abs(h) % 360) / 360.0
        return Color(hue: hue, saturation: 0.65, brightness: 0.9)
    }

    // MARK: Body
    var body: some View {
        VStack(alignment: hAlign, spacing: 4) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                lineView(line)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: frameAlign)
    }

    private func lineView(_ line: [String]) -> some View {
        HStack(alignment: .center, spacing: 8) {
            ForEach(Array(line.enumerated()), id: \.offset) { _, t in
                piece(t)
            }
        }
        .frame(maxWidth: .infinity, alignment: rowAlign)
    }

    @ViewBuilder
    private func piece(_ t: String) -> some View {
        switch t {
        case "label": labelView
        case "count", "flip": countView
        case "subject": subjectView
        case "room": roomView
        case "teacher": teacherView
        case "times": timesView
        case "next": nextView
        case "clock": clockView
        case "date": dateView
        case "dot": dotView
        case "bar": barView
        case "ring": ringView
        case "timeline": timelineView
        case "agenda": agendaView
        case "space": Spacer(minLength: 0)
        default: EmptyView()
        }
    }

    // MARK: Pieces
    private var labelView: some View {
        Text(captionText())
            .font(.system(size: 10, weight: .semibold, design: design))
            .tracking(0.8)
            .foregroundStyle(fg3)
            .lineLimit(1)
    }

    @ViewBuilder
    private var countView: some View {
        let size = CGFloat(cfg.size ?? 34)
        if let end = entry.current?.end ?? entry.next?.start {
            Text(timerInterval: min(entry.date, end)...end, countsDown: true)
                .font(.system(size: size, weight: .bold, design: design))
                .monospacedDigit()
                .foregroundStyle(fg)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
        } else {
            Text("--:--")
                .font(.system(size: size, weight: .bold, design: design))
                .foregroundStyle(fg)
                .lineLimit(1)
        }
    }

    private var subjectView: some View {
        Text(shown?.subject ?? "No more classes")
            .font(.system(size: 14, weight: .semibold, design: design))
            .lineLimit(1)
            .foregroundStyle(fg)
    }

    @ViewBuilder
    private var roomView: some View {
        if let r = shown?.room, !r.isEmpty {
            Text("📍 " + r)
                .font(.system(size: 12, weight: .semibold, design: design))
                .lineLimit(1)
                .foregroundStyle(acc)
        }
    }

    @ViewBuilder
    private var teacherView: some View {
        if let t = shown?.teacher, !t.isEmpty {
            Text(t)
                .font(.system(size: 12, weight: .semibold, design: design))
                .lineLimit(1)
                .foregroundStyle(acc)
        }
    }

    @ViewBuilder
    private var timesView: some View {
        if let o = shown {
            Text(clockText(o.start) + "–" + clockText(o.end))
                .font(.system(size: 12, design: design))
                .monospacedDigit()
                .lineLimit(1)
                .foregroundStyle(fg3)
        }
    }

    @ViewBuilder
    private var nextView: some View {
        if let f = following {
            Text(followingText(f))
                .font(.system(size: 11, design: design))
                .lineLimit(1)
                .foregroundStyle(fg3)
        }
    }

    private var clockView: some View {
        Text(clockText(Date()))
            .font(.system(size: 12, design: design))
            .monospacedDigit()
            .foregroundStyle(fg3)
    }

    private var dateView: some View {
        Text(Self.dateFormat.string(from: Date()))
            .font(.system(size: 12, design: design))
            .lineLimit(1)
            .foregroundStyle(fg3)
    }

    private var dotView: some View {
        Circle()
            .fill(subjectColor(shown?.subject ?? ""))
            .frame(width: 10, height: 10)
    }

    @ViewBuilder
    private var barView: some View {
        if let c = entry.current {
            ProgressView(timerInterval: c.start...c.end, countsDown: false,
                         label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.linear)
                .tint(acc)
                .frame(minWidth: 40)
        } else {
            Capsule()
                .fill(fg3.opacity(0.3))
                .frame(minWidth: 40, maxWidth: .infinity, minHeight: 6, maxHeight: 6)
        }
    }

    @ViewBuilder
    private var ringView: some View {
        if let c = entry.current {
            ProgressView(timerInterval: c.start...c.end, countsDown: true,
                         label: { EmptyView() }, currentValueLabel: { EmptyView() })
                .progressViewStyle(.circular)
                .tint(acc)
                .frame(width: 52, height: 52)
        } else {
            Circle()
                .stroke(fg3.opacity(0.3), lineWidth: 5)
                .frame(width: 52, height: 52)
        }
    }

    private var dayStart: Date { entry.today.first?.start ?? entry.date }

    private var dayEnd: Date { entry.today.map { $0.end }.max() ?? entry.date }

    private func segment(_ o: Occurrence, width: CGFloat) -> some View {
        let span = max(1.0, dayEnd.timeIntervalSince(dayStart))
        let x = CGFloat(o.start.timeIntervalSince(dayStart) / span) * width
        let w = max(2.0, CGFloat(o.end.timeIntervalSince(o.start) / span) * width - 1.0)
        let isPast = o.end <= entry.date
        let isNow = o.start <= entry.date && entry.date < o.end
        var color: Color = fg3.opacity(0.35)
        if isPast { color = Color.green }
        if isNow { color = acc }
        return RoundedRectangle(cornerRadius: 2)
            .fill(color)
            .frame(width: w, height: 8)
            .offset(x: x)
    }

    @ViewBuilder
    private var timelineView: some View {
        if entry.today.isEmpty {
            EmptyView()
        } else {
            VStack(spacing: 2) {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(fg3.opacity(0.15))
                        ForEach(Array(entry.today.enumerated()), id: \.offset) { _, o in
                            segment(o, width: geo.size.width)
                        }
                    }
                }
                .frame(height: 8)
                HStack {
                    Text(clockText(dayStart))
                    Spacer(minLength: 0)
                    Text(clockText(dayEnd))
                }
                .font(.system(size: 10, design: design))
                .foregroundStyle(fg3)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var agendaView: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(entry.agenda.prefix(4).enumerated()), id: \.offset) { index, o in
                agendaRow(o, highlight: index == 0 && entry.current != nil)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func agendaRow(_ o: Occurrence, highlight: Bool) -> some View {
        let weight: Font.Weight = highlight ? .semibold : .regular
        let textColor: Color = highlight ? acc : fg
        return HStack(spacing: 8) {
            Text(whenLabel(o))
                .monospacedDigit()
                .foregroundStyle(highlight ? acc : fg3)
                .frame(width: 70, alignment: .leading)
            Text(o.subject)
                .lineLimit(1)
                .foregroundStyle(textColor)
            Spacer(minLength: 4)
            if !o.room.isEmpty {
                Text(o.room)
                    .foregroundStyle(acc)
            }
        }
        .font(.system(size: 12, weight: weight, design: design))
    }
}
