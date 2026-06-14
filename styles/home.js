// ─── Joined avatars stack ────────────────────────────────────────────────────
function buildJoinedAvatarsHtml(meeting) {
    var preview = meeting.joined_preview || [];
    var count = meeting.joined_count || 0;
    if (count === 0) return '';
    var html = '<div class="joined-avatars">';
    preview.forEach(function (u) {
        var style = !u.profile_picture ? ' style="background: ' + u.color + ';"' : '';
        var inner = u.profile_picture ? '<img src="' + u.profile_picture + '" alt="">' : '<span>' + u.initial + '</span>';
        html += '<div class="joined-avatar"' + style + ' title="' + u.uid + '">' + inner + '</div>';
    });
    if (count > 4) {
        html += '<div class="joined-avatar joined-avatar-more">+' + (count - 4) + '</div>';
    }
    html += '</div>';
    return html;
}

// ─── Algorithm 1: Haversine Distance (Client-Side) ───────────────────────────
function haversineDistance(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var toRad = function(deg) { return deg * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
          * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sortMeetingsByDistance(meetings, userLat, userLng) {
    return meetings.slice().sort(function(a, b) {
        var distA = (a.lat && a.lng) ? haversineDistance(userLat, userLng, a.lat, a.lng) : Infinity;
        var distB = (b.lat && b.lng) ? haversineDistance(userLat, userLng, b.lat, b.lng) : Infinity;
        return distA - distB;
    });
}

document.addEventListener("DOMContentLoaded", function () {
    var meetings = MEETINGS_DATA || [];

    // Format the server-rendered "time" labels into relative countdowns
    document.querySelectorAll('.meeting-card-time[data-time]').forEach(function (el) {
        el.title = el.getAttribute('data-time');
        el.textContent = formatTimeUntil(el.getAttribute('data-time'));
    });
    var map = L.map('map').setView([31.7683, 35.2137], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);
    setTimeout(function () { map.invalidateSize(); }, 100);

    var markers = [];
    var markerById = {};

    // ─── Info panel (right 50% of map container) ─────────────────────────
    var infoPanel = document.getElementById('map-info-panel');
    var infoPanelContent = document.getElementById('info-panel-content');

    // Fade the hero image away and reveal the pinned title as the user scrolls down
    infoPanelContent.addEventListener('scroll', function () {
        var hero = infoPanelContent.querySelector('.info-hero');
        var sticky = infoPanelContent.querySelector('.info-sticky-title');
        if (!hero || !sticky) return;
        var heroHeight = hero.offsetHeight || 160;
        var ratio = Math.min(infoPanelContent.scrollTop / heroHeight, 1);
        hero.style.opacity = String(1 - ratio);
        sticky.style.opacity = String(ratio);
        sticky.style.transform = 'translateY(' + (-14 * (1 - ratio)) + 'px)';
        sticky.style.pointerEvents = ratio > 0.5 ? 'auto' : 'none';
    });

    // ─── Navigation route to a meeting ────────────────────────────────────
    var routeLayer = null;

    function clearRoute() {
        if (routeLayer) {
            map.removeLayer(routeLayer);
            routeLayer = null;
        }
    }

    function showRoute(meeting) {
        if (!userLatLng) {
            locateUser();
            return;
        }
        clearRoute();

        var resultEl = document.getElementById('info-route-result');
        if (resultEl) resultEl.textContent = 'Finding route…';

        var url = 'https://router.project-osrm.org/route/v1/driving/'
            + userLatLng.lng + ',' + userLatLng.lat + ';'
            + meeting.lng + ',' + meeting.lat
            + '?overview=full&geometries=geojson';

        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.routes || !data.routes.length) {
                    if (resultEl) resultEl.textContent = 'No route found.';
                    return;
                }
                var route = data.routes[0];
                var coords = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
                routeLayer = L.polyline(coords, { color: '#667eea', weight: 5, opacity: 0.85 }).addTo(map);
                map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });

                var km = (route.distance / 1000).toFixed(1);
                var mins = Math.round(route.duration / 60);
                if (resultEl) resultEl.textContent = '🧭 ' + km + ' km · ~' + mins + ' min';
            })
            .catch(function () {
                if (resultEl) resultEl.textContent = 'Could not load route.';
            });
    }

    function showInfoPanel(meeting) {
        var isOnline = meeting.type === 'OnlineMeeting';
        var badgeClass = isOnline ? 'badge-type-online' : 'badge-type-inperson';
        var badge = isOnline ? '🌐 Online' : '📍 In-Person';

        var extraRow = '';
        if (meeting.location) {
            extraRow = '<div class="info-detail-row"><span class="info-detail-icon">📍</span><span>' + meeting.location + '</span></div>';
        } else if (meeting.link) {
            extraRow = '<div class="info-detail-row"><span class="info-detail-icon">🔗</span>'
                     + '<a href="' + meeting.link + '" target="_blank" class="info-join-link">Join meeting →</a></div>';
        }

        clearRoute();

        var creatorHtml = meeting.creator_username
            ? '<div class="info-detail-row"><span class="info-detail-icon">👤</span><span>' + meeting.creator_username + '</span></div>'
            : '';

        var navRowHtml = (!isOnline && meeting.lat && meeting.lng)
            ? '<div class="info-nav-row">'
            +   '<button class="info-nav-btn" id="info-nav-btn" type="button">'
            +     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>'
            +     '<span>Navigate</span>'
            +   '</button>'
            +   '<span class="info-route-result" id="info-route-result"></span>'
            + '</div>'
            : '';

        infoPanelContent.innerHTML =
            '<div class="info-sticky-title"><span>' + meeting.title + '</span></div>'
            + '<div class="info-hero">'
            +   '<span class="info-badge ' + badgeClass + '">' + badge + '</span>'
            +   '<h3 class="info-hero-title">' + meeting.title + '</h3>'
            + '</div>'
            + '<div class="info-body">'
            +   '<p class="info-desc">' + meeting.description + '</p>'
            +   '<div class="info-details">'
            +     '<div class="info-detail-row"><span class="info-detail-icon">🕐</span><span title="' + meeting.time + '">' + formatTimeUntil(meeting.time) + '</span></div>'
            +     creatorHtml
            +     extraRow
            +   '</div>'
            +   navRowHtml
            +   '<div class="info-actions">'
            +   (function () {
                    var joined = (meeting.joined_uids || []).indexOf(CURRENT_UID) !== -1;
                    var html = buildJoinedAvatarsHtml(meeting)
                         + '<button class="join-btn info-join-btn' + (joined ? ' joined' : '') + '" onclick="toggleJoin(this, ' + meeting.id + ')">'
                         +   '<span class="join-btn-text">' + (joined ? 'Joined' : 'Join') + '</span>'
                         + '</button>';
                    var canDelete = CURRENT_IS_ADMIN || meeting.creator_uid === CURRENT_UID;
                    if (canDelete) {
                        html += '<button class="delete-btn" title="Delete meeting" onclick="deleteMeeting(' + meeting.id + ', null); hideInfoPanel();">'
                              + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
                              + '</button>';
                    }
                    return html;
                })()
            +   '</div>'
            + '</div>';

        var navBtn = document.getElementById('info-nav-btn');
        if (navBtn) {
            navBtn.addEventListener('click', function () { showRoute(meeting); });
        }

        infoPanel.classList.add('open');
        infoPanelContent.scrollTop = 0;

        // After the panel slides in, resize the map and pan the marker to left-centre
        setTimeout(function () {
            map.invalidateSize();
            if (meeting.lat && meeting.lng) {
                map.panTo([meeting.lat, meeting.lng]);
            }
        }, 420);
    }

    // ─── Auto-navigation for in-person meetings ────────────────────────────
    var userCountry = null;

    function getCountryFromLocation(loc) {
        if (!loc) return null;
        var parts = loc.split(',');
        return parts[parts.length - 1].trim();
    }

    function maybeAutoNavigate(meeting) {
        if (meeting.type === 'OnlineMeeting' || !meeting.lat || !meeting.lng) return;
        var meetingCountry = getCountryFromLocation(meeting.location);

        function go() {
            if (userCountry && meetingCountry && userCountry.toLowerCase() !== meetingCountry.toLowerCase()) return;
            setTimeout(function () { showRoute(meeting); }, 450);
        }

        if (userCountry || !userLatLng) {
            go();
            return;
        }
        fetch('https://nominatim.openstreetmap.org/reverse?format=json&accept-language=en&lat=' + userLatLng.lat + '&lon=' + userLatLng.lng + '&zoom=3')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                userCountry = (data && data.address && data.address.country) || null;
                go();
            })
            .catch(go);
    }

    function hideInfoPanel() {
        infoPanel.classList.remove('open');
        clearRoute();
        setTimeout(function () { map.invalidateSize(); }, 420);
    }

    document.getElementById('info-panel-close').addEventListener('click', hideInfoPanel);
    // Click anywhere on the map background closes the panel
    map.on('click', hideInfoPanel);

    // ─── Markers ─────────────────────────────────────────────────────────
    function meetingIcon(meeting) {
        return L.divIcon({
            className: 'meeting-marker',
            html: '<div class="meeting-marker-circle">' + (meeting.emoji || '📍') + '</div>',
            iconSize: [34, 34],
            iconAnchor: [17, 34],
            popupAnchor: [0, -34]
        });
    }

    function addMeetingMarker(meeting) {
        if (!meeting.lat || !meeting.lng) return;
        var marker = L.marker([meeting.lat, meeting.lng], { icon: meetingIcon(meeting) }).addTo(map);
        marker.on('click', function (e) {
            L.DomEvent.stopPropagation(e); // don't trigger map click (close)
            showInfoPanel(meeting);
            maybeAutoNavigate(meeting);
        });
        marker.meeting = meeting;
        markers.push(marker);
        markerById[meeting.id] = marker;
    }

    meetings.forEach(addMeetingMarker);

    // ─── Meeting list item clicks ─────────────────────────────────────────
    function attachListItemClick(item) {
        var id = parseInt(item.getAttribute('data-meeting-id'));
        item.addEventListener('click', function () {
            var meeting = meetings.find(function (m) { return m.id === id; });
            if (!meeting) return;
            if (meeting.lat && meeting.lng) {
                map.setView([meeting.lat, meeting.lng], 16);
            }
            showInfoPanel(meeting);
            maybeAutoNavigate(meeting);
        });
    }

    document.querySelectorAll('.meeting-card').forEach(attachListItemClick);

    // ─── Search ──────────────────────────────────────────────────────────
    document.getElementById('search-input').addEventListener('input', function (e) {
        var words = e.target.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
        var filtered = meetings.filter(function (m) {
            var typeWords = m.type === 'OnlineMeeting' ? 'online' : 'in-person in person';
            var haystack = [
                m.title, m.description, m.location || '', m.link || '',
                m.creator_username || '', m.time || '', typeWords
            ].join(' ').toLowerCase();
            return words.every(function (w) { return haystack.includes(w); });
        });

        markers.forEach(function (marker) {
            var show = filtered.some(function (m) { return m.id === marker.meeting.id; });
            if (show && !map.hasLayer(marker)) map.addLayer(marker);
            if (!show && map.hasLayer(marker)) map.removeLayer(marker);
        });

        document.querySelectorAll('.meeting-card').forEach(function (item) {
            var id = parseInt(item.getAttribute('data-meeting-id'));
            item.style.display = filtered.some(function (m) { return m.id === id; }) ? 'flex' : 'none';
        });

        var list = document.getElementById('meetings-list');
        var emptyMsg = document.getElementById('search-empty-msg');
        if (!filtered.length && meetings.length && words.length) {
            if (!emptyMsg) {
                emptyMsg = document.createElement('div');
                emptyMsg.id = 'search-empty-msg';
                emptyMsg.className = 'no-meetings-empty';
                emptyMsg.innerHTML = '<div class="no-meetings-icon">🔍</div><h3>No matches found</h3><p>Try a different search term.</p>';
                list.appendChild(emptyMsg);
            }
        } else if (emptyMsg) {
            emptyMsg.remove();
        }
    });

    // ─── Geolocation + distance sort ─────────────────────────────────────
    var userMarker = null;
    var userLatLng = null;

    function renderSortedList(sortedMeetings) {
        var list = document.getElementById('meetings-list');
        list.innerHTML = '';
        var ACCENTS = ['accent-0','accent-1','accent-2','accent-3','accent-4'];
        sortedMeetings.forEach(function (meeting, i) {
            var isOnline = meeting.type === 'OnlineMeeting';
            var badge = isOnline ? '🌐 Online' : '📍 In-Person';
            var badgeClass = isOnline ? 'badge-type-online' : 'badge-type-inperson';
            var addressText = meeting.location ? '📍 ' + (meeting.short_location || meeting.location)
                        : meeting.link    ? '🔗 Online' : '';

            var mediaHtml = '<div class="meeting-card-accent ' + ACCENTS[i % 5] + '"></div>';

            var creatorHtml = meeting.creator_username
                ? '<span class="meeting-card-creator">👤 ' + meeting.creator_username + '</span>'
                : '';

            var joined = (meeting.joined_uids || []).indexOf(CURRENT_UID) !== -1;

            var canDelete = CURRENT_IS_ADMIN || meeting.creator_uid === CURRENT_UID;
            var deleteHtml = canDelete
                ? '<button class="delete-btn" title="Delete meeting" onclick="event.stopPropagation(); deleteMeeting(' + meeting.id + ', this.closest(\'.meeting-card\'))">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
                + '</button>'
                : '';

            var card = document.createElement('div');
            card.className = 'meeting-card';
            card.setAttribute('data-meeting-id', meeting.id);
            card.innerHTML =
                mediaHtml
              + '<div class="meeting-card-body">'
              +   '<div class="meeting-card-top">'
              +     '<span class="meeting-card-type-badge ' + badgeClass + '">' + badge + '</span>'
              +     '<span class="meeting-card-time" title="' + meeting.time + '">' + formatTimeUntil(meeting.time) + '</span>'
              +   '</div>'
              +   '<div class="meeting-card-title-row">'
              +     '<h4 class="meeting-card-title">' + meeting.title + '</h4>'
              +     (addressText ? '<span class="meeting-card-address">' + addressText + '</span>' : '')
              +   '</div>'
              +   '<p class="meeting-card-desc">' + meeting.description + '</p>'
              +   '<div class="meeting-card-footer">'
              +     creatorHtml
              +     buildJoinedAvatarsHtml(meeting)
              +     '<button class="join-btn' + (joined ? ' joined' : '') + '" data-meeting-id="' + meeting.id + '" onclick="event.stopPropagation(); toggleJoin(this, ' + meeting.id + ')">'
              +       '<span class="join-btn-text">' + (joined ? 'Joined' : 'Join') + '</span>'
              +     '</button>'
              +     deleteHtml
              +   '</div>'
              + '</div>'
              + '<div class="meeting-card-chevron">›</div>';

            attachListItemClick(card);
            list.appendChild(card);
        });
    }

    function locateUser() { map.locate({ setView: true, maxZoom: 16 }); }

    // ─── Custom "Me" marker (pulsing pfp circle) ───────────────────────────
    var meAvatarHtml;
    if (CURRENT_USER_AVATAR && CURRENT_USER_AVATAR.profile_picture) {
        meAvatarHtml = '<div class="me-marker-avatar"><img src="' + CURRENT_USER_AVATAR.profile_picture + '" alt=""></div>';
    } else if (CURRENT_USER_AVATAR) {
        meAvatarHtml = '<div class="me-marker-avatar" style="background: ' + CURRENT_USER_AVATAR.color + ';"><span>' + CURRENT_USER_AVATAR.initial + '</span></div>';
    } else {
        meAvatarHtml = '<div class="me-marker-dot"></div>';
    }

    var meIcon = L.divIcon({
        className: 'me-marker',
        html: '<div class="me-marker-pulse"></div>' + meAvatarHtml,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    map.on('locationfound', function (e) {
        userLatLng = e.latlng;
        if (userMarker) userMarker.setLatLng(e.latlng);
        else userMarker = L.marker(e.latlng, { icon: meIcon, zIndexOffset: 1000 }).addTo(map).bindPopup(
            '<div class="user-location-popup">Me</div>'
        ).openPopup();
        map.setView(e.latlng, 16);
        renderSortedList(sortMeetingsByDistance(meetings, e.latlng.lat, e.latlng.lng));
    });

    map.on('locationerror', function () {
        if (!userMarker) {
            userMarker = L.marker([31.7683, 35.2137], { icon: meIcon, zIndexOffset: 1000 }).addTo(map)
                .bindPopup('<div class="user-location-popup">Me (default location)</div>')
                .openPopup();
        }
        if (!userLatLng) userLatLng = L.latLng(31.7683, 35.2137);
        map.setView([31.7683, 35.2137], 13);
    });

    locateUser();
    document.getElementById('locate-btn').addEventListener('click', locateUser);

    document.getElementById('create-meeting-btn').addEventListener('click', function () {
        window.location.href = '/create';
    });
});
