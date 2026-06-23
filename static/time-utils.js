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
