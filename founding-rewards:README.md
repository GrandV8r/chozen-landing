# Chozen Solutions Founding Rewards

A lightweight rewards and testimonial tracking system for Chozen Solutions. Works for Shopify customers and custom-order customers alike, one system, one ledger, no cash register required.

---

## What this is

One central place to:
- Track customer rewards points
- Record purchases, whether they came through Shopify or a custom order by phone/text/email/invoice
- Record testimonial and photo submissions, with usage permissions
- Track referrals and whether they turned into paid customers
- Keep one official rewards ledger that never gets edited after the fact, only added to

**A customer's points balance is never stored as its own number.** It's always calculated live from the ledger. This means the ledger is the one source of truth, exactly per the rule this system was built around: every points balance must have one official source of truth.

---

## Getting started

1. Open `index.html` in any modern browser (Chrome, Safari, Edge, Firefox). No installation, no server, no build step.
2. That's it. The app runs entirely in your browser.

**Where your data lives:** in this browser's local storage, on this device, under the key `csfr_data`. It is not synced anywhere, not backed up automatically, and not shared between devices or browsers. If you clear your browser data, switch computers, or use a different browser, you will not see your records unless you've exported and re-imported a backup.

**This is why the Settings page has an Export Full Backup button. Use it regularly.**

---

## Hosting on GitHub Pages

1. Create a new folder in your existing Chozen Solutions repository called `founding-rewards`. **Do not overwrite any existing files.**
2. Copy these five files into that folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
   - `sample-data.json`
3. Commit and push.
4. In your repo settings, under Pages, make sure GitHub Pages is enabled for the branch/folder you pushed to.
5. Your app will be reachable at something like:
   `https://[your-username].github.io/[your-repo]/founding-rewards/`

No build tools, no npm install, no framework. It's plain HTML, CSS, and JavaScript, so it will run the same way on GitHub Pages as it does locally.

---

## Data structure

Everything lives in one JSON object with five top-level sections:

### `customers`
One record per person or business in the program. Fields: `id`, `fullName`, `email` (the unique identifier, no two customers can share one), `phone`, `business`, `customerType` (website / custom / partner / referral), `dateJoined`, `notes`, `active`.

### `ledger`
Every transaction that ever happened, purchases, rewards, redemptions, reversals. Fields: `id`, `customerEmail`, `customerName`, `date`, `activityType`, `points` (positive for earned, negative for redeemed/reversed), `dollarAmount`, `orderRef`, `source` (Shopify / Custom Order / Manual / Testimonial / Referral), `status` (Pending / Approved / Rejected / Reversed), `notes`, `approvedBy`.

**Nothing in the ledger is ever deleted.** Reversing an entry marks the original as "Reversed" and adds a new offsetting entry. The full history stays intact.

### `testimonials`
Every written, photo, or video submission. Fields: `id`, `customerEmail`, `customerName`, `dateSubmitted`, `testimonialText`, `photoRef`, `videoUrl`, `permWebsite`/`permSocial`/`permAdvertising` (usage permissions), `approvalStatus`, `pointsAwarded`, `featured`, `notes`.

### `referrals`
Every referral, whether it converted or not. Fields: `id`, `referringEmail`, `referringName`, `referredName`, `referredContact`, `dateReferred`, `status` (New / Contacted / Quoted / Paid Customer / Closed), `orderValue`, `rewardIssued`, `notes`.

### `settings`
The editable reward values and program terms. See "Changing reward values" below.

---

## Changing reward values

Go to **Settings** in the app. You can edit, without touching any code:

- Points per $1 spent
- Written testimonial reward
- Customer photo reward
- Photo + testimonial reward
- Approved video testimonial reward
- Referral → paid customer reward
- Minimum redemption amount
- Program name
- Terms and conditions text

Changes apply immediately to new entries. They do not retroactively change points already issued under the old values, that would break the ledger's integrity.

---

## Backing up and restoring data

**To back up:** Settings → Export Full Backup (JSON). This downloads everything, customers, ledger, testimonials, referrals, and settings, as one file. Do this regularly, and always before clearing browser data or switching devices.

**To restore:** Settings → Import from JSON Backup, then select a previously exported file. **This replaces all current data with what's in the file**, so make sure you're importing the right one. You'll get a confirmation prompt before anything is overwritten.

**CSV exports** (Customers, Ledger) are for viewing in Excel/Sheets or sharing with someone who doesn't need the full app, they are not meant for re-importing back into this tool.

---

## Test checklist

Before trusting this for real customer data, or after making any code changes, walk through:

- [ ] Create a new customer with a valid email
- [ ] Try to create a second customer with the same email, confirm it's blocked
- [ ] Add a purchase, confirm points calculate correctly at the current points-per-dollar rate
- [ ] Add a reward activity (testimonial, photo, etc.), confirm the point value matches Settings
- [ ] Submit a testimonial, approve it, confirm points land in the ledger automatically
- [ ] Add a referral, mark it "Paid Customer," confirm the referral reward posts automatically
- [ ] Redeem points, confirm the balance decreases and can't go negative
- [ ] Make a manual adjustment (both positive and negative)
- [ ] Reverse a ledger entry, confirm the original stays marked "Reversed" rather than disappearing, and an offsetting entry appears
- [ ] Export customers to CSV, open it in a spreadsheet, confirm the numbers match what's in the app
- [ ] Export a full JSON backup
- [ ] Clear all data, then import that JSON backup, confirm everything comes back exactly as it was
- [ ] Resize the browser window down to a phone width, confirm the sidebar collapses into the menu button and everything stays usable

---

## What this is not, yet

These are intentionally left as extension points, not built:

- Shopify customer sync
- Shopify order sync
- Customer login / self-service portal
- Automatic reward emails
- Redemption codes
- Reward tiers
- Cloud backend (Supabase, Firebase, Airtable, or similar)
- Direct image uploads (right now you record a filename or URL, not the actual file)
- Admin authentication (this app has no login, anyone with the URL and no password can use it, keep that in mind for where you host it)

The data structure was built with these in mind, each customer, ledger entry, and testimonial already has the fields a future sync or backend would need, but none of it is faked or partially wired. If it's not built, it's listed on the Settings page under "Coming Later" and nowhere else.

---

## Future improvements worth considering

- Move from localStorage to a real backend once more than one person needs to see the same data at the same time (localStorage is single-browser, single-device only)
- Add authentication before this touches real customer PII beyond what's already low-risk
- Shopify webhook integration so purchases log automatically instead of manual entry
- Bulk CSV import for onboarding existing customers instead of one-by-one entry
- Photo upload instead of filename/URL reference
- Automated redemption reminders when a customer crosses the minimum threshold
