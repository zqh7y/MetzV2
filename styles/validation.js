// ─── Algorithm 3: Client-Side Input Validation (Stage 1) ─────────────────────
function validateMeetingForm(form) {
    var title = form.querySelector('[name="title"]');
    var description = form.querySelector('[name="description"]');
    var time = form.querySelector('[name="time"]');
    var meetingType = form.querySelector('[name="type"]:checked');
    if (!title || !title.value.trim()) { alert("Title is required."); return false; }
    if (title.value.length > 100) { alert("Title must be at most 100 characters."); return false; }
    if (!description || !description.value.trim()) { alert("Description is required."); return false; }
    if (description.value.length > 500) { alert("Description must be at most 500 characters."); return false; }
    if (!time || !time.value.trim()) { alert("Time is required."); return false; }
    if (!meetingType) { alert("Please select a meeting type."); return false; }
    if (meetingType.value === "online") {
        var link = form.querySelector('[name="link"]');
        if (!link || !link.value.trim()) { alert("Link is required for online meetings."); return false; }
        if (!link.value.startsWith("http://") && !link.value.startsWith("https://")) {
            alert("Link must start with http:// or https://"); return false;
        }
    }
    return true;
}
