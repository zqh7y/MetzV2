(function () {
    var stack = document.getElementById('cards-stack');
    if (!stack) return;

    var buttons = document.querySelector('.swipe-buttons');

    // Show relative "time left" countdowns instead of raw timestamps
    document.querySelectorAll('.card-time[data-time]').forEach(function (el) {
        el.textContent = formatTimeUntil(el.getAttribute('data-time'));
    });

    var cards = Array.from(stack.querySelectorAll('.swipe-card'));
    var currentIndex = 0;
    var THRESHOLD = 90;
    var isDragging = false;
    var startX = 0, startY = 0;

    // ── Show top 3 cards with a stacked depth effect ──────────────────────
    function updateStack() {
        cards.forEach(function (card, i) {
            var offset = i - currentIndex;
            if (offset < 0 || offset > 2) {
                card.style.display = 'none';
                return;
            }
            card.style.display = 'flex';
            card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            card.style.zIndex = 100 - offset;

            if (offset === 0) {
                card.style.transform = 'scale(1) translateY(0px)';
                card.style.opacity = '1';
                card.style.pointerEvents = 'auto';
            } else if (offset === 1) {
                card.style.transform = 'scale(0.94) translateY(18px)';
                card.style.opacity = '0.8';
                card.style.pointerEvents = 'none';
            } else {
                card.style.transform = 'scale(0.88) translateY(36px)';
                card.style.opacity = '0.6';
                card.style.pointerEvents = 'none';
            }
        });

        if (currentIndex >= cards.length) {
            stack.innerHTML = `
                <div class="no-more-cards">
                    <div class="no-more-icon">🎉</div>
                    <h3>You're all caught up!</h3>
                    <p>No more online meetings to discover.</p>
                    <a href="/" class="no-more-btn">Back to Home</a>
                </div>`;
            if (buttons) buttons.style.display = 'none';
        }
    }

    // ── Fly the top card off screen, then call server ──────────────────────
    function swipeOff(card, direction) {
        var xTarget = direction === 'right' ? window.innerWidth + 300 : -(window.innerWidth + 300);
        var rot = direction === 'right' ? 35 : -35;
        card.style.transition = 'transform 0.4s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.4s';
        card.style.transform = 'translate(' + xTarget + 'px, -60px) rotate(' + rot + 'deg)';
        card.style.opacity = '0';

        var meetingId = parseInt(card.getAttribute('data-id'));
        var url = direction === 'right' ? '/join/' + meetingId : '/pass/' + meetingId;
        fetch(url, { method: 'POST' });

        setTimeout(function () {
            currentIndex++;
            updateStack();
        }, 380);
    }

    // ── Drag / touch handlers ─────────────────────────────────────────────
    function getTopCard() {
        return cards[currentIndex] || null;
    }

    function onStart(e) {
        if (e.target.closest('a')) return; // let links work normally
        var card = getTopCard();
        if (!card) return;
        isDragging = true;
        var p = e.touches ? e.touches[0] : e;
        startX = p.clientX;
        startY = p.clientY;
        card.style.transition = 'none';
    }

    function onMove(e) {
        if (!isDragging) return;
        var card = getTopCard();
        if (!card) return;
        var p = e.touches ? e.touches[0] : e;
        var dx = p.clientX - startX;
        var dy = p.clientY - startY;
        var rot = dx * 0.07;
        card.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';

        // Fade in the correct overlay
        var ratio = Math.min(Math.abs(dx) / THRESHOLD, 1);
        card.querySelector('.like-overlay').style.opacity = dx > 0 ? ratio : 0;
        card.querySelector('.pass-overlay').style.opacity = dx < 0 ? ratio : 0;
    }

    function onEnd(e) {
        if (!isDragging) return;
        isDragging = false;
        var card = getTopCard();
        if (!card) return;
        var p = e.changedTouches ? e.changedTouches[0] : e;
        var dx = p.clientX - startX;

        card.querySelector('.like-overlay').style.opacity = 0;
        card.querySelector('.pass-overlay').style.opacity = 0;

        if (Math.abs(dx) > THRESHOLD) {
            swipeOff(card, dx > 0 ? 'right' : 'left');
        } else {
            // Snap back
            card.style.transition = 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)';
            card.style.transform = 'scale(1) translateY(0)';
        }
    }

    document.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);

    // ── Button-triggered swipe ────────────────────────────────────────────
    window.swipeCard = function (direction) {
        var card = getTopCard();
        if (card) swipeOff(card, direction);
    };

    updateStack();
})();
