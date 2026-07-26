// ─── HTML escaping ───────────────────────────────────────────────────────────
// Cards and the info panel are built with innerHTML, so every value that came
// from a user has to be escaped on the way in. Titles and descriptions are
// already escaped server-side, but locations, links and usernames are not —
// a meeting whose location is "<img src=x onerror=...>" would otherwise run.
function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ─── Joined avatars stack ────────────────────────────────────────────────────
function buildJoinedAvatarsHtml(meeting) {
    var preview = meeting.joined_preview || [];
    var count = meeting.joined_count || 0;
    if (count === 0) return '';
    var html = '<div class="joined-avatars">';
    preview.forEach(function (u) {
        var style = !u.profile_picture ? ' style="background: ' + esc(u.color) + ';"' : '';
        var inner = u.profile_picture ? '<img src="' + esc(u.profile_picture) + '" alt="">' : '<span>' + esc(u.initial) + '</span>';
        html += '<div class="joined-avatar"' + style + ' title="' + esc(u.uid) + '">' + inner + '</div>';
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
    document.querySelectorAll('.meeting-card-time[data-time], .foryou-card-time[data-time]').forEach(function (el) {
        el.title = el.getAttribute('data-time');
        el.textContent = formatTimeUntil(el.getAttribute('data-time'));
    });
    // ─── Map (MapLibre GL + CARTO vector tiles) ───────────────────────────
    // The basemap follows the system theme alongside the rest of the UI: a
    // light map inside a dark app looks like a bug.
    var STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
    var STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function prefersDark() {
        var forced = document.documentElement.getAttribute('data-theme');
        if (forced === 'dark') return true;
        if (forced === 'light') return false;
        return darkQuery.matches;
    }

    function basemapUrl() { return prefersDark() ? STYLE_DARK : STYLE_LIGHT; }

    /** The map can't use CSS variables, so read the active accent out of them. */
    function cssVar(name, fallback) {
        var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }

    function accentColors() {
        return {
            base: cssVar('--accent', '#0d9c8a'),
            strong: cssVar('--accent-strong', '#0a7d6e'),
            deep: cssVar('--accent-deep', '#075f55')
        };
    }

    var DEFAULT_CENTER = [35.2137, 31.7683];   // [lng, lat] — MapLibre order
    // Reuse a fontstack the basemap style already ships glyphs for, otherwise
    // labels silently fail to render.
    var LABEL_FONT = ['Montserrat Medium', 'Open Sans Bold', 'Noto Sans Regular',
                      'HanWangHeiLight Regular', 'NanumBarunGothic Regular'];

    var map = new maplibregl.Map({
        container: 'map',
        style: basemapUrl(),
        center: DEFAULT_CENTER,
        zoom: 12.4,
        attributionControl: false,
        dragRotate: true,
        maxPitch: 60
    });

    window._map = map;   // handy for debugging from the console
    map.on('error', function (e) {
        console.error('[map]', (e && e.error && e.error.message) || e);
    });

    // The basemap style already carries its own OSM/CARTO attribution — adding
    // customAttribution here would just print it twice.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-left');
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    var markerById = {};   // meeting id -> {lat, lng}, for flying to a card's pin
    var selectedId = null;

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
    var EMPTY_FC = { type: 'FeatureCollection', features: [] };

    function setRouteData(data) {
        var src = map.getSource('route');
        if (src) src.setData(data);
    }

    function clearRoute() {
        setRouteData(EMPTY_FC);
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
                // OSRM already returns GeoJSON [lng, lat] pairs — feed them straight in.
                setRouteData({ type: 'Feature', properties: {}, geometry: route.geometry });

                var bounds = new maplibregl.LngLatBounds();
                route.geometry.coordinates.forEach(function (c) { bounds.extend(c); });
                map.fitBounds(bounds, { padding: 60, duration: 900 });

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
            extraRow = '<div class="info-detail-row"><span class="info-detail-icon">📍</span><span>' + esc(meeting.location) + '</span></div>';
        } else if (meeting.link) {
            extraRow = '<div class="info-detail-row"><span class="info-detail-icon">🔗</span>'
                     + '<a href="' + esc(meeting.link) + '" target="_blank" rel="noopener noreferrer" class="info-join-link">Join meeting →</a></div>';
        }

        clearRoute();

        var trustBadgeHtml = meeting.creator_is_trusted ? '<span class="trust-badge" title="Trusted creator">★</span>' : '';
        var creatorHtml = meeting.creator_username
            ? '<div class="info-detail-row"><span class="info-detail-icon">👤</span><span>' + esc(meeting.creator_username) + trustBadgeHtml + '</span></div>'
            : '';

        var tagsHtml = (meeting.tags && meeting.tags.length)
            ? '<div class="meeting-card-tags">' + meeting.tags.map(function (t) {
                return '<span class="meeting-card-tag">' + esc(t) + '</span>';
              }).join('') + '</div>'
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
            '<div class="info-sticky-title"><span>' + esc(meeting.title) + '</span></div>'
            + '<div class="info-hero">'
            +   '<span class="info-badge ' + badgeClass + '">' + badge + '</span>'
            +   '<h3 class="info-hero-title">' + esc(meeting.title) + '</h3>'
            + '</div>'
            + '<div class="info-body">'
            +   tagsHtml
            +   '<p class="info-desc">' + esc(meeting.description) + '</p>'
            +   '<div class="info-details">'
            +     '<div class="info-detail-row"><span class="info-detail-icon">🕐</span><span title="' + esc(meeting.time) + '">' + esc(formatTimeUntil(meeting.time)) + '</span></div>'
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

        // Highlight the pin and lean the camera in on it. Map padding (set by
        // the sheet) keeps the pin in the part of the map still visible.
        setSelectedPin(meeting.id);
        if (meeting.lat && meeting.lng) {
            map.easeTo({
                center: [meeting.lng, meeting.lat],
                zoom: Math.max(map.getZoom(), 15),
                pitch: 45,
                duration: 700
            });
        }
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
        setSelectedPin(null);
        map.easeTo({ pitch: 0, duration: 500 });
    }

    document.getElementById('info-panel-close').addEventListener('click', hideInfoPanel);

    // ─── Meeting pins ─────────────────────────────────────────────────────
    // Meetings live in one clustered GeoJSON source; filtering just swaps the
    // data, and MapLibre re-clusters and re-renders on the GPU.
    function meetingsToGeoJSON(list) {
        return {
            type: 'FeatureCollection',
            features: list.filter(function (m) { return m.lat && m.lng; }).map(function (m) {
                return {
                    type: 'Feature',
                    properties: {
                        id: m.id,
                        title: m.title,
                        kind: m.type === 'OnlineMeeting' ? 'online' : 'inperson'
                    },
                    geometry: { type: 'Point', coordinates: [m.lng, m.lat] }
                };
            })
        };
    }

    meetings.forEach(function (m) {
        if (m.lat && m.lng) markerById[m.id] = { lat: m.lat, lng: m.lng };
    });

    /** Draw a teardrop pin as an SVG data URI so it can be used as a map icon. */
    function pinImage(from, to, cb) {
        var svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="66" height="86" viewBox="0 0 33 43">'
          +   '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
          +     '<stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to + '"/>'
          +   '</linearGradient></defs>'
          +   '<ellipse cx="16.5" cy="40" rx="5.5" ry="2" fill="rgba(20,25,50,0.22)"/>'
          +   '<path d="M16.5 1.5C9.6 1.5 4 7.1 4 14c0 8.8 11 22.5 12 23.6.3.3.8.3 1.1 0C18 36.5 29 22.8 29 14c0-6.9-5.6-12.5-12.5-12.5z" '
          +         'fill="url(#g)" stroke="#ffffff" stroke-width="2.4"/>'
          +   '<circle cx="16.5" cy="14" r="5" fill="#ffffff"/>'
          + '</svg>';
        var img = new Image(66, 86);
        img.onload = function () { cb(img); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function setSelectedPin(id) {
        selectedId = id;
        if (map.getLayer('meeting-pin-halo')) {
            map.setFilter('meeting-pin-halo', ['==', ['get', 'id'], id === null ? -1 : id]);
        }
    }

    // Sources, layers and pin images. Kept in its own function because
    // setStyle() (used when the system flips light/dark) throws all of them
    // away and they have to be reinstalled on the new style.
    // 'styledata' fires repeatedly while a style loads, so installing on the
    // first one can drop everything when the swap completes. These helpers
    // make installation idempotent and it runs on 'style.load' instead.
    function ensureSource(id, spec) {
        if (!map.getSource(id)) map.addSource(id, spec);
    }

    function ensureLayer(spec) {
        if (!map.getLayer(spec.id)) map.addLayer(spec);
    }

    function installMapLayers(replacePins) {
        var AC = accentColors();
        ensureSource('meetings', {
            type: 'geojson',
            data: meetingsToGeoJSON(meetings),
            cluster: true,
            clusterRadius: 55,
            clusterMaxZoom: 14
        });

        ensureSource('route', { type: 'geojson', data: EMPTY_FC });

        // Route: a soft wide glow under a solid line reads better over busy tiles
        ensureLayer({
            id: 'route-glow', type: 'line', source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': AC.base, 'line-width': 14, 'line-opacity': 0.22, 'line-blur': 6 }
        });
        ensureLayer({
            id: 'route-line', type: 'line', source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': AC.strong, 'line-width': 4.5, 'line-opacity': 0.95 }
        });

        // Clusters: size and colour both step up with the number of meetings
        ensureLayer({
            id: 'cluster-glow', type: 'circle', source: 'meetings',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], AC.base, 10, AC.strong, 30, AC.deep],
                'circle-radius': ['step', ['get', 'point_count'], 26, 10, 32, 30, 38],
                'circle-opacity': 0.25,
                'circle-blur': 0.6
            }
        });
        ensureLayer({
            id: 'clusters', type: 'circle', source: 'meetings',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], AC.base, 10, AC.strong, 30, AC.deep],
                'circle-radius': ['step', ['get', 'point_count'], 18, 10, 23, 30, 28],
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff'
            }
        });
        ensureLayer({
            id: 'cluster-count', type: 'symbol', source: 'meetings',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': LABEL_FONT,
                'text-size': 13
            },
            paint: { 'text-color': '#ffffff' }
        });

        // Halo behind the pin the user currently has open
        ensureLayer({
            id: 'meeting-pin-halo', type: 'circle', source: 'meetings',
            filter: ['==', ['get', 'id'], -1],
            paint: {
                'circle-color': AC.base,
                'circle-radius': 22,
                'circle-opacity': 0.28,
                'circle-blur': 0.5
            }
        });

        var pending = 2;
        function ready() {
            if (--pending) return;
            ensureLayer({
                id: 'meeting-pins', type: 'symbol', source: 'meetings',
                filter: ['!', ['has', 'point_count']],
                layout: {
                    'icon-image': ['case', ['==', ['get', 'kind'], 'online'], 'pin-online', 'pin-inperson'],
                    'icon-size': 0.5,
                    'icon-anchor': 'bottom',
                    'icon-allow-overlap': true,
                    'text-field': ['get', 'title'],
                    'text-font': LABEL_FONT,
                    'text-size': 11.5,
                    'text-anchor': 'top',
                    'text-offset': [0, 0.4],
                    'text-max-width': 9,
                    'text-optional': true
                },
                paint: {
                    'text-color': '#3c4663',
                    'text-halo-color': 'rgba(255,255,255,0.92)',
                    'text-halo-width': 1.6
                }
            });
        }
        // Images outlive setStyle(), so re-adding them after a theme swap throws
        function addPin(name, from, to, replace) {
            if (map.hasImage(name) && !replace) { ready(); return; }
            pinImage(from, to, function (img) {
                if (map.hasImage(name)) map.removeImage(name);
                map.addImage(name, img);
                ready();
            });
        }
        addPin('pin-inperson', AC.base, AC.strong, replacePins);
        addPin('pin-online', '#4facfe', '#2b6ef5', replacePins);
    }

    // setStyle() throws away our sources and layers, and MapLibre gives no
    // usable "new style is ready" event: there is no style.load, and at every
    // styledata isStyleLoaded() is still false. 'idle' is the first point the
    // new style is genuinely live, so reinstall from there. The getSource
    // check makes this a no-op on all the other idles.
    map.on('idle', function () {
        if (map.getSource('meetings')) return;
        installMapLayers(true);
        applyFilters();
        setSelectedPin(selectedId);
    });

    map.on('load', function () {
        installMapLayers();

        // Tapping a pin opens its details; tapping a cluster zooms into it
        map.on('click', 'meeting-pins', function (e) {
            var id = e.features[0].properties.id;
            var meeting = meetings.find(function (m) { return m.id === id; });
            if (!meeting) return;
            showInfoPanel(meeting);
            maybeAutoNavigate(meeting);
        });

        map.on('click', 'clusters', function (e) {
            var clusterId = e.features[0].properties.cluster_id;
            map.getSource('meetings').getClusterExpansionZoom(clusterId).then(function (zoom) {
                map.easeTo({ center: e.features[0].geometry.coordinates, zoom: zoom + 0.2 });
            });
        });

        // A tap on empty map (no pin, no cluster) closes the details panel
        map.on('click', function (e) {
            var layers = ['meeting-pins', 'clusters'].filter(function (l) { return map.getLayer(l); });
            if (!map.queryRenderedFeatures(e.point, { layers: layers }).length) hideInfoPanel();
        });

        ['meeting-pins', 'clusters'].forEach(function (layer) {
            map.on('mouseenter', layer, function () { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', layer, function () { map.getCanvas().style.cursor = ''; });
        });

        applyFilters();
        locateUser();
    });

    // ─── Follow the system light/dark switch, live ────────────────────────
    function swapBasemap() {
        map.setStyle(basemapUrl());
        // The card thumbnails are cheap to rebuild: drop them and let the
        // observer remount them against the new style as they come into view.
        Array.from(liveMinis.keys()).forEach(unmountMini);
    }

    if (darkQuery.addEventListener) darkQuery.addEventListener('change', swapBasemap);
    else if (darkQuery.addListener) darkQuery.addListener(swapBasemap);
    window.swapBasemap = swapBasemap;   // used when a theme override is applied

    // Called by setPref() when the accent colour changes
    window.refreshMapAccent = function () {
        if (!map.isStyleLoaded()) return;
        var AC = accentColors();
        var ramp = ['step', ['get', 'point_count'], AC.base, 10, AC.strong, 30, AC.deep];
        if (map.getLayer('clusters')) map.setPaintProperty('clusters', 'circle-color', ramp);
        if (map.getLayer('cluster-glow')) map.setPaintProperty('cluster-glow', 'circle-color', ramp);
        if (map.getLayer('meeting-pin-halo')) map.setPaintProperty('meeting-pin-halo', 'circle-color', AC.base);
        if (map.getLayer('route-glow')) map.setPaintProperty('route-glow', 'line-color', AC.base);
        if (map.getLayer('route-line')) map.setPaintProperty('route-line', 'line-color', AC.strong);
        pinImage(AC.base, AC.strong, function (img) {
            if (map.hasImage('pin-inperson')) map.removeImage('pin-inperson');
            map.addImage('pin-inperson', img);
        });
        // Mini maps draw their pin in CSS, so they update on their own.
    };

    // ─── Meeting list item clicks ─────────────────────────────────────────
    function attachListItemClick(item) {
        var id = parseInt(item.getAttribute('data-meeting-id'));
        item.addEventListener('click', function () {
            var meeting = meetings.find(function (m) { return m.id === id; });
            if (!meeting) return;
            if (meeting.lat && meeting.lng) {
                // Drop the sheet to peek first, otherwise it covers the pin
                setSheetState('peek');
                map.flyTo({ center: [meeting.lng, meeting.lat], zoom: 16, duration: 900 });
            }
            showInfoPanel(meeting);
            maybeAutoNavigate(meeting);
        });
    }

    document.querySelectorAll('.meeting-card').forEach(attachListItemClick);

    // ─── Search + type/tag filters ─────────────────────────────────────────
    var activeTypeFilter = 'all';
    var activeTagFilters = [];

    // Advanced filters, mirrored by the panel in home.html
    var FILTER_DEFAULTS = { sort: 'soonest', when: 'any', distance: 'any', show: 'all' };
    var advanced = Object.assign({}, FILTER_DEFAULTS);

    function parseMeetingTime(value) {
        if (!value) return null;
        var d = new Date(String(value).replace(' ', 'T'));
        return isNaN(d.getTime()) ? null : d;
    }

    function matchesWhen(meeting) {
        if (advanced.when === 'any') return true;
        var when = parseMeetingTime(meeting.time);
        if (!when) return false;
        var now = new Date();

        if (advanced.when === 'upcoming') return when >= now;
        if (advanced.when === 'today') return when.toDateString() === now.toDateString();
        if (advanced.when === 'week') {
            var weekAhead = new Date(now.getTime() + 7 * 86400000);
            return when >= now && when <= weekAhead;
        }
        if (advanced.when === 'weekend') {
            var day = when.getDay();   // 0 Sun, 6 Sat
            return when >= now && (day === 0 || day === 6);
        }
        return true;
    }

    function matchesDistance(meeting) {
        if (advanced.distance === 'any') return true;
        if (!userLatLng || !meeting.lat || !meeting.lng) return false;
        var km = haversineDistance(userLatLng.lat, userLatLng.lng, meeting.lat, meeting.lng);
        return km <= parseFloat(advanced.distance);
    }

    function matchesShow(meeting) {
        var joined = (meeting.joined_uids || []).indexOf(CURRENT_UID) !== -1;
        if (advanced.show === 'joined') return joined;
        if (advanced.show === 'mine') return meeting.creator_uid === CURRENT_UID;
        if (advanced.show === 'unseen') return FOR_YOU_IDS.indexOf(meeting.id) !== -1;
        return true;
    }

    function sortMeetings(list) {
        var sorted = list.slice();
        if (advanced.sort === 'soonest') {
            sorted.sort(function (a, b) {
                var ta = parseMeetingTime(a.time), tb = parseMeetingTime(b.time);
                return (ta ? ta.getTime() : Infinity) - (tb ? tb.getTime() : Infinity);
            });
        } else if (advanced.sort === 'popular') {
            sorted.sort(function (a, b) {
                return (b.joined_uids || []).length - (a.joined_uids || []).length;
            });
        } else if (advanced.sort === 'newest') {
            sorted.sort(function (a, b) { return b.id - a.id; });
        } else if (advanced.sort === 'nearest' && userLatLng) {
            sorted = sortMeetingsByDistance(sorted, userLatLng.lat, userLatLng.lng);
        }
        return sorted;
    }

    function activeFilterCount() {
        var n = Object.keys(FILTER_DEFAULTS).filter(function (k) {
            return advanced[k] !== FILTER_DEFAULTS[k];
        }).length;
        return n + activeTagFilters.length + (activeTypeFilter !== 'all' ? 1 : 0);
    }

    function syncFilterPanel() {
        Object.keys(advanced).forEach(function (group) {
            var wrap = document.querySelector('.filter-group[data-group="' + group + '"]');
            if (!wrap) return;
            wrap.querySelectorAll('.filter-opt').forEach(function (btn) {
                btn.classList.toggle('active', btn.dataset.value === advanced[group]);
            });
        });

        var count = activeFilterCount();
        var badge = document.getElementById('filter-count');
        if (badge) {
            badge.hidden = count === 0;
            badge.textContent = count;
        }
        var moreBtn = document.getElementById('filter-more-btn');
        if (moreBtn) moreBtn.classList.toggle('has-filters', count > 0);

        var note = document.getElementById('distance-note');
        if (note) note.hidden = !(advanced.distance !== 'any' && !userLatLng);
    }

    window.toggleFilterPanel = function () {
        var panel = document.getElementById('filter-panel');
        panel.hidden = !panel.hidden;
        document.getElementById('filter-more-btn').classList.toggle('open', !panel.hidden);
    };

    window.setFilterOption = function (group, value) {
        advanced[group] = value;
        syncFilterPanel();
        applyFilters();
    };

    window.resetFilters = function () {
        advanced = Object.assign({}, FILTER_DEFAULTS);
        activeTypeFilter = 'all';
        activeTagFilters = [];
        document.querySelectorAll('.filter-chip').forEach(function (b) {
            b.classList.toggle('active', b.dataset.filterType === 'all');
        });
        document.getElementById('search-input').value = '';
        syncFilterPanel();
        applyFilters();
    };

    window.setTypeFilter = function (btn, type) {
        activeTypeFilter = type;
        document.querySelectorAll('.filter-chip[data-filter-type]').forEach(function (b) {
            b.classList.remove('active');
        });
        btn.classList.add('active');
        applyFilters();
    };

    window.toggleTagFilter = function (btn, tag) {
        var idx = activeTagFilters.indexOf(tag);
        if (idx === -1) {
            activeTagFilters.push(tag);
            btn.classList.add('active');
        } else {
            activeTagFilters.splice(idx, 1);
            btn.classList.remove('active');
        }
        applyFilters();
    };

    function getFilteredMeetings() {
        var words = document.getElementById('search-input').value.toLowerCase().trim().split(/\s+/).filter(Boolean);
        return meetings.filter(function (m) {
            if (activeTypeFilter === 'online' && m.type !== 'OnlineMeeting') return false;
            if (activeTypeFilter === 'inperson' && m.type === 'OnlineMeeting') return false;
            if (activeTagFilters.length) {
                var tags = m.tags || [];
                var hasAll = activeTagFilters.every(function (t) { return tags.indexOf(t) !== -1; });
                if (!hasAll) return false;
            }
            var typeWords = m.type === 'OnlineMeeting' ? 'online' : 'in-person in person';
            if (!matchesWhen(m) || !matchesDistance(m) || !matchesShow(m)) return false;
            var haystack = [
                m.title, m.description, m.location || '', m.link || '',
                m.creator_username || '', m.time || '', typeWords, (m.tags || []).join(' ')
            ].join(' ').toLowerCase();
            return words.every(function (w) { return haystack.includes(w); });
        });
    }

    function applyFilters() {
        var filtered = sortMeetings(getFilteredMeetings());

        var src = map.getSource('meetings');
        if (src) src.setData(meetingsToGeoJSON(filtered));

        renderSortedList(filtered);

        var countEl = document.getElementById('filter-result-count');
        if (countEl) {
            countEl.textContent = filtered.length + ' of ' + meetings.length + ' meetings';
        }
        syncFilterPanel();

        var list = document.getElementById('meetings-list');
        var emptyMsg = document.getElementById('search-empty-msg');
        if (!filtered.length && meetings.length) {
            if (!emptyMsg) {
                emptyMsg = document.createElement('div');
                emptyMsg.id = 'search-empty-msg';
                emptyMsg.className = 'no-meetings-empty';
                emptyMsg.innerHTML = '<div class="no-meetings-icon">🔍</div><h3>No matches found</h3><p>Try a different search term or filter.</p>';
                list.appendChild(emptyMsg);
            }
        } else if (emptyMsg) {
            emptyMsg.remove();
        }
    }

    document.getElementById('search-input').addEventListener('input', applyFilters);

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
            var addressText = meeting.location ? '📍 ' + esc(meeting.short_location || meeting.location)
                        : meeting.link    ? '🔗 Online' : '';

            var tagsHtml = (meeting.tags && meeting.tags.length)
                ? '<div class="meeting-card-tags">' + meeting.tags.map(function (t) {
                    return '<span class="meeting-card-tag">' + esc(t) + '</span>';
                  }).join('') + '</div>'
                : '';

            var mediaHtml = '<div class="meeting-card-accent ' + ACCENTS[i % 5] + '"></div>';


            var trustBadgeHtml = meeting.creator_is_trusted ? '<span class="trust-badge" title="Trusted creator">★</span>' : '';
            var creatorHtml = meeting.creator_username
                ? '<span class="meeting-card-creator">👤 ' + esc(meeting.creator_username) + trustBadgeHtml + '</span>'
                : '';

            var joined = (meeting.joined_uids || []).indexOf(CURRENT_UID) !== -1;

            var canDelete = CURRENT_IS_ADMIN || meeting.creator_uid === CURRENT_UID;
            var deleteHtml = canDelete
                ? '<button class="delete-btn" title="Delete meeting" onclick="event.stopPropagation(); deleteMeeting(' + meeting.id + ', this.closest(\'.meeting-card\'))">'
                + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
                + '</button>'
                : '';

            var card = document.createElement('div');
            card.className = 'meeting-card' + (isOnline ? ' is-online' : '');
            card.setAttribute('data-meeting-id', meeting.id);
            card.innerHTML =
                '<div class="card-main">'
              + mediaHtml
              + '<div class="meeting-card-body">'
              +   '<div class="meeting-card-top">'
              +     '<span class="meeting-card-type-badge ' + badgeClass + '">' + badge + '</span>'
              +     '<span class="meeting-card-time" title="' + esc(meeting.time) + '">' + esc(formatTimeUntil(meeting.time)) + '</span>'
              +   '</div>'
              +   '<div class="meeting-card-title-row">'
              +     '<h4 class="meeting-card-title">' + esc(meeting.title) + '</h4>'
              +     (addressText ? '<span class="meeting-card-address">' + addressText + '</span>' : '')
              +   '</div>'
              +   tagsHtml
              +   '<p class="meeting-card-desc">' + esc(meeting.description) + '</p>'
              +   '<div class="meeting-card-footer">'
              +     creatorHtml
              +     buildJoinedAvatarsHtml(meeting)
              +     '<button class="join-btn' + (joined ? ' joined' : '') + '" data-meeting-id="' + meeting.id + '" onclick="event.stopPropagation(); toggleJoin(this, ' + meeting.id + ')">'
              +       '<span class="join-btn-text">' + (joined ? 'Joined' : 'Join') + '</span>'
              +     '</button>'
              +     deleteHtml
              +   '</div>'
              + '</div>'
              + '<div class="meeting-card-chevron">›</div>'
              + '</div>';

            attachListItemClick(card);
            list.appendChild(card);
        });
    }

    function locateUser() {
        if (!navigator.geolocation) { onLocationError(); return; }
        navigator.geolocation.getCurrentPosition(function (pos) {
            onLocationFound(pos.coords.latitude, pos.coords.longitude);
        }, onLocationError, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    }

    // ─── Custom "Me" marker (pulsing pfp circle) ───────────────────────────
    var meAvatarHtml;
    if (CURRENT_USER_AVATAR && CURRENT_USER_AVATAR.profile_picture) {
        meAvatarHtml = '<div class="me-marker-avatar"><img src="' + CURRENT_USER_AVATAR.profile_picture + '" alt=""></div>';
    } else if (CURRENT_USER_AVATAR) {
        meAvatarHtml = '<div class="me-marker-avatar" style="background: ' + CURRENT_USER_AVATAR.color + ';"><span>' + CURRENT_USER_AVATAR.initial + '</span></div>';
    } else {
        meAvatarHtml = '<div class="me-marker-dot"></div>';
    }

    function placeMeMarker(lat, lng) {
        if (userMarker) {
            userMarker.setLngLat([lng, lat]);
            return;
        }
        var el = document.createElement('div');
        el.className = 'me-marker';
        el.innerHTML = '<div class="me-marker-pulse"></div>' + meAvatarHtml;
        userMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    }

    function onLocationFound(lat, lng) {
        userLatLng = { lat: lat, lng: lng };
        placeMeMarker(lat, lng);
        map.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });
        renderSortedList(sortMeetingsByDistance(getFilteredMeetings(), lat, lng));
    }

    function onLocationError() {
        if (!userLatLng) userLatLng = { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] };
        placeMeMarker(userLatLng.lat, userLatLng.lng);
    }

    document.getElementById('locate-btn').addEventListener('click', locateUser);

    document.getElementById('create-meeting-btn').addEventListener('click', function () {
        window.location.href = '/create';
    });

    // ─── Live mini maps on the meeting cards ──────────────────────────────
    // Each in-person card shows a real MapLibre map centred on its meeting.
    // A browser only grants ~16 WebGL contexts per page, so instead of one
    // map per card we keep at most MINI_LIMIT alive and recycle them as the
    // list scrolls: mount on approach, evict whatever is furthest away.
    var MINI_LIMIT = 8;
    var liveMinis = new Map();   // container element -> maplibregl.Map
    var miniObserver = null;

    function distanceFromViewport(el) {
        var r = el.getBoundingClientRect();
        var mid = r.top + r.height / 2;
        return Math.abs(mid - window.innerHeight / 2);
    }

    function unmountMini(el) {
        var m = liveMinis.get(el);
        if (!m) return;
        m.remove();
        liveMinis.delete(el);
        el.classList.remove('is-live');
    }

    function evictFurthestMini(except) {
        var worst = null, worstDist = -1;
        liveMinis.forEach(function (_, el) {
            if (el === except) return;
            var d = distanceFromViewport(el);
            if (d > worstDist) { worstDist = d; worst = el; }
        });
        if (worst) unmountMini(worst);
    }

    function miniMapsEnabled() {
        return document.documentElement.getAttribute('data-minimaps') !== 'off';
    }

    function mountMini(el) {
        if (liveMinis.has(el) || !miniMapsEnabled()) return;
        var lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
        if (!lat || !lng) return;
        while (liveMinis.size >= MINI_LIMIT) evictFurthestMini(el);

        var mini = new maplibregl.Map({
            container: el,
            style: basemapUrl(),
            center: [lng, lat],
            zoom: 14.2,
            // Non-interactive: a pannable map inside a scrolling list would
            // swallow the scroll gesture and make the list feel broken.
            interactive: false,
            attributionControl: false
        });

        var pin = document.createElement('div');
        pin.className = 'mini-pin';
        new maplibregl.Marker({ element: pin }).setLngLat([lng, lat]).addTo(mini);

        mini.on('load', function () { el.classList.add('is-live'); });
        liveMinis.set(el, mini);
    }

    function observeCardMaps() {
        if (!miniObserver) {
            // Root is the shelf row itself: it scrolls sideways, so a card's
            // horizontal position is what decides whether it's worth mounting.
            miniObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) mountMini(entry.target);
                });
            }, { root: document.getElementById('foryou-row'), rootMargin: '0px 250px' });
        }
        document.querySelectorAll('.card-map:not([data-observed])').forEach(function (el) {
            el.setAttribute('data-observed', '1');
            miniObserver.observe(el);
        });
    }

    observeCardMaps();

    // Called by setPref() when the mini-map preference changes
    window.refreshMiniMaps = function () {
        if (miniMapsEnabled()) {
            observeCardMaps();
            document.querySelectorAll('.card-map').forEach(function (el) {
                var r = el.getBoundingClientRect();
                if (r.top < window.innerHeight + 250 && r.bottom > -250) mountMini(el);
            });
        } else {
            Array.from(liveMinis.keys()).forEach(unmountMini);
        }
    };

    // ─── Bottom sheet ─────────────────────────────────────────────────────
    // Three snap points. The map keeps its full height behind the sheet and is
    // told, via padding, which slice of itself is actually visible — so
    // flyTo/fitBounds centre things in the gap above the sheet, not behind it.
    var sheet = document.getElementById('sheet');
    var grabber = document.getElementById('sheet-grabber');
    var STATE_ORDER = ['peek', 'half', 'full'];
    var savedSheet = document.documentElement.getAttribute('data-sheet');
    var sheetState = STATE_ORDER.indexOf(savedSheet) !== -1 ? savedSheet : 'peek';
    // Tall enough to clear the floating HOME/CREATE/PROFILE bar and still show
    // a usable strip of the sheet above it.
    var PEEK_VISIBLE = 200;

    /** How far down the sheet sits, in px, for a given state. "peek" is the
     *  default so the map keeps most of the screen. */
    function sheetTop(state) {
        var h = window.innerHeight;
        if (state === 'peek') return Math.max(h * 0.5, h - PEEK_VISIBLE);
        if (state === 'half') return h * 0.42;
        return h * 0.06;
    }

    function syncMapPadding() {
        var visible = window.innerHeight - sheetTop(sheetState);
        map.setPadding({ top: 20, right: 20, left: 20, bottom: Math.min(visible, window.innerHeight * 0.6) });
    }

    function setSheetState(state) {
        sheetState = state;
        sheet.dataset.state = state;
        sheet.style.transition = 'transform 0.46s cubic-bezier(0.34, 1.32, 0.5, 1)';
        sheet.style.transform = 'translateY(' + sheetTop(state) + 'px)';
        syncMapPadding();
    }
    window.setSheetState = setSheetState;

    var dragStartY = null;
    var dragStartTop = 0;

    grabber.addEventListener('pointerdown', function (e) {
        dragStartY = e.clientY;
        dragStartTop = sheetTop(sheetState);
        sheet.style.transition = 'none';
        grabber.setPointerCapture(e.pointerId);
    });

    grabber.addEventListener('pointermove', function (e) {
        if (dragStartY === null) return;
        var top = dragStartTop + (e.clientY - dragStartY);
        top = Math.max(sheetTop('full'), Math.min(sheetTop('peek'), top));
        sheet.style.transform = 'translateY(' + top + 'px)';
    });

    grabber.addEventListener('pointerup', function (e) {
        if (dragStartY === null) return;
        var moved = e.clientY - dragStartY;
        var top = dragStartTop + moved;
        if (Math.abs(moved) < 6) {
            // Treat it as a tap: step to the next size up, wrapping at the top
            var i = STATE_ORDER.indexOf(sheetState);
            setSheetState(STATE_ORDER[(i + 1) % STATE_ORDER.length]);
        } else {
            // Snap to whichever state the sheet was dragged closest to
            var nearest = STATE_ORDER.reduce(function (best, s) {
                return Math.abs(sheetTop(s) - top) < Math.abs(sheetTop(best) - top) ? s : best;
            }, sheetState);
            setSheetState(nearest);
        }
        dragStartY = null;
    });

    window.addEventListener('resize', function () {
        setSheetState(sheetState);
        map.resize();
    });

    setSheetState(sheetState);
});
