// ─── Shared: relative "time until meeting starts" formatting ────────────────
function formatTimeUntil(timeStr) {
    if (!timeStr) return '';
    var target = new Date(timeStr.replace(' ', 'T'));
    if (isNaN(target.getTime())) return timeStr;

    var diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return 'Already started';

    var totalMinutes = Math.floor(diffMs / 60000);
    var days = Math.floor(totalMinutes / (60 * 24));
    var hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    var minutes = totalMinutes % 60;

    var parts = [];
    if (days > 0) parts.push(days + (days === 1 ? ' day' : ' days'));
    if (hours > 0) parts.push(hours + 'h');
    if (days === 0 && hours === 0) parts.push(minutes + (minutes === 1 ? ' min' : ' min'));

    return parts.join(' and ') + ' left till start';
}

// A ticking clock rather than a rounded phrase: used where the point is to
// feel the time draining away (the "Next up" reminder, the call unlock).
function formatCountdown(totalSeconds) {
    totalSeconds = Math.max(0, Math.floor(totalSeconds));
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;

    if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    if (minutes > 0) return minutes + 'm ' + seconds + 's';
    return seconds + 's';
}
