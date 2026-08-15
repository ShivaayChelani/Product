# PalSafar Closed Beta — Tester Guide

Welcome to the PalSafar closed beta. You're helping us validate India's canonical tourism platform before public launch.

---

## Getting started

1. Install the beta app (TestFlight / Play Internal Testing link from invite).
2. Create an account with email or continue as guest (limited features).
3. Allow **location** when prompted — needed for map, nearby, and riddles.
4. Allow **notifications** if you want trip and offer alerts.

---

## What to test

### Tourist

- [ ] Register and log in
- [ ] Search for a place (city or landmark)
- [ ] Open map, pan/zoom, tap a marker
- [ ] Open place detail, read description, save place
- [ ] Watch reels feed; like/save a reel
- [ ] Create a trip (manual or AI planner)
- [ ] Check in at a place (if available)
- [ ] View wallet / Pal Points
- [ ] Upgrade to Premium (Razorpay test card if provided)
- [ ] Receive and tap a push notification

### Vendor (if invited)

- [ ] Complete vendor registration
- [ ] Subscribe via Razorpay
- [ ] Create an offer
- [ ] Generate QR for redemption

### Creator (if invited)

- [ ] Creator registration
- [ ] Upload a reel
- [ ] View analytics

---

## Known beta limitations

| Item | Status |
|------|--------|
| Google Sign-In | Coming soon — use email/password |
| Memories | Saved on device only (not synced) |
| Trip map tab | List view works; map tab may show placeholder |
| Creator DMs | Coming soon |
| Dark mode | Coming soon |
| SMS 2FA | Coming soon |

---

## Reporting issues

**In app:** Profile → Settings → **Send Feedback** or **Contact Support**

Include:

- Device (iPhone 14 / Pixel 7, etc.)
- OS version
- Steps to reproduce
- Screenshot or screen recording if possible

**Critical (app crash, payment charged incorrectly):** Email support@palsafar.com with subject `[Beta P0]`.

---

## Deep links (optional test)

If configured on your device:

- `palsafar://place/{placeId}`
- `palsafar://map`
- `palsafar://auth/login`

---

## Privacy

Beta data is real production infrastructure. Do not share account credentials. Report security issues privately to support@palsafar.com.

Thank you for helping build PalSafar.
