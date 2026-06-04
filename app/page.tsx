import Link from 'next/link';

/* ──────────────────────────────────────────────────────────────
   LastMinuteGiftFinder — marketing homepage.
   Server component. Reuses the dark theme tokens from globals.css
   so it stays in sync with the rest of the app. All CTAs hand off
   into the wizard at /app.
   ────────────────────────────────────────────────────────────── */

const css = `
.lp{font-family:inherit;color:var(--text-primary);background:var(--bg);}
.lp-ic{width:1em;height:1em;vertical-align:-0.13em;stroke:currentColor;fill:none;
  stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;display:inline-block;}
.lp-wrap{max-width:1080px;margin:0 auto;padding:0 20px;}

.lp-header{position:sticky;top:0;z-index:10;background:rgba(13,13,17,0.82);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid var(--border);}
.lp-nav{display:flex;align-items:center;justify-content:space-between;height:60px;}
.lp-brand{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:16px;letter-spacing:-0.02em;}
.lp-brand .lp-ic{color:var(--accent);font-size:18px;}
.lp-navright{display:flex;align-items:center;gap:14px;}
.lp-signin{font-size:13px;font-weight:500;color:var(--text-secondary);}
.lp-signin:hover{color:var(--text-primary);}
.lp-btn{display:inline-flex;align-items:center;gap:7px;background:var(--accent);color:#fff;
  font-weight:500;border-radius:10px;padding:9px 18px;font-size:14px;transition:background .15s;}
.lp-btn:hover{background:#f0855f;}
.lp-btn-sm{padding:7px 15px;font-size:13px;}

.lp-hero{text-align:center;padding:56px 0 8px;}
.lp-chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#f3ad94;
  background:rgba(232,114,74,0.14);padding:5px 13px;border-radius:9px;margin-bottom:22px;}
.lp-h1{font-size:clamp(30px,7vw,46px);font-weight:500;line-height:1.12;letter-spacing:-0.03em;
  margin:0 auto 16px;max-width:560px;}
.lp-sub{font-size:clamp(15px,2.4vw,17px);color:var(--text-secondary);line-height:1.6;max-width:540px;margin:0 auto;}

.lp-finder{max-width:520px;margin:28px auto 0;background:var(--surface);
  border:1px solid var(--border);border-radius:16px;padding:20px;text-align:left;}
.lp-field{margin-bottom:12px;}
.lp-field label{display:block;font-size:12.5px;color:var(--text-secondary);margin-bottom:5px;}
.lp-val{background:var(--surface-card);border:1px solid var(--border);border-radius:10px;
  padding:11px 13px;font-size:14px;display:flex;align-items:center;justify-content:space-between;color:var(--text-primary);}
.lp-val .lp-ic{color:var(--text-muted);font-size:16px;}
.lp-finder .lp-btn{width:100%;justify-content:center;padding:13px;font-size:15px;margin-top:4px;}
.lp-trust{text-align:center;font-size:12.5px;color:var(--text-muted);margin-top:14px;
  display:flex;gap:14px;justify-content:center;flex-wrap:wrap;}
.lp-trust .lp-ic{font-size:14px;}
.lp-trust .b{color:var(--accent);} .lp-trust .g{color:#50c87a;}

.lp-section{padding:24px 0;}
.lp-eyebrow{text-align:center;font-size:12px;color:var(--text-muted);text-transform:uppercase;
  letter-spacing:.6px;margin-bottom:18px;}
.lp-h2{font-size:clamp(20px,3.4vw,24px);font-weight:500;text-align:center;margin:0 0 22px;}

.lp-grid-products{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));}
.lp-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;}
.lp-thumb{aspect-ratio:1/1;background:var(--surface-card);border-radius:10px;display:flex;
  align-items:center;justify-content:center;margin-bottom:12px;}
.lp-thumb .lp-ic{font-size:42px;color:var(--text-muted);}
.lp-pname{font-size:14px;font-weight:500;margin-bottom:6px;}
.lp-prow{display:flex;align-items:center;gap:8px;margin-bottom:9px;}
.lp-price{font-size:13px;color:var(--text-secondary);}
.lp-tag{font-size:11px;padding:2px 8px;border-radius:10px;}
.lp-tag-mid{color:var(--tier-mid-text);background:var(--tier-mid-bg);}
.lp-tag-bud{color:var(--tier-budget-text);background:var(--tier-budget-bg);}
.lp-tag-spl{color:var(--tier-splurge-text);background:var(--tier-splurge-bg);}
.lp-ship{font-size:11.5px;color:#50c87a;background:rgba(50,190,110,0.12);
  padding:5px 9px;border-radius:9px;display:inline-flex;align-items:center;gap:5px;margin-bottom:12px;}
.lp-ship .lp-ic{font-size:13px;}
.lp-buy{background:var(--accent);color:#fff;font-size:13px;font-weight:500;text-align:center;
  padding:10px;border-radius:9px;display:block;transition:background .15s;}
.lp-buy:hover{background:#f0855f;}

.lp-grid-proof{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));}
.lp-proof{border:1px solid var(--border);border-radius:12px;padding:16px;}
.lp-proof .lp-ic{font-size:22px;color:var(--accent);}
.lp-proof h3{font-size:14.5px;font-weight:500;margin:10px 0 5px;}
.lp-proof p{font-size:13px;color:var(--text-secondary);margin:0;line-height:1.5;}

.lp-cta{background:rgba(232,114,74,0.10);border:1px solid rgba(232,114,74,0.22);
  border-radius:16px;padding:36px 24px;text-align:center;margin:8px 0 40px;}
.lp-cta .lp-h2{margin-bottom:8px;}
.lp-cta p{font-size:14.5px;color:#dcae9d;max-width:440px;margin:0 auto 20px;line-height:1.5;}
.lp-cta .lp-btn{padding:13px 30px;font-size:15px;}

.lp-footer{border-top:1px solid var(--border);padding:28px 0 40px;}
.lp-foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
.lp-foot .lp-brand{font-size:14px;}
.lp-disclosure{font-size:12px;color:var(--text-muted);max-width:520px;line-height:1.5;margin:0;}

@media (max-width:540px){
  .lp-hero{padding:40px 0 4px;}
  .lp-finder{padding:16px;}
  .lp-nav{height:54px;}
  .lp-signin{display:none;}
}
`;

const GiftIcon = () => (
  <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12v9H4v-9" /><path d="M2 7h20v5H2z" /><path d="M12 21V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
);

const TruckIcon = () => (
  <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v8H3z" /><path d="M14 10h4l3 3v2h-7z" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /></svg>
);

const ArrowIcon = () => (
  <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
);

export default function HomePage() {
  return (
    <div className="lp">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <header className="lp-header">
        <div className="lp-wrap lp-nav">
          <span className="lp-brand"><GiftIcon /> LastMinuteGiftFinder</span>
          <span className="lp-navright">
            <Link className="lp-signin" href="/app/login">Sign in</Link>
            <Link className="lp-btn lp-btn-sm" href="/app">Find a gift</Link>
          </span>
        </div>
      </header>

      <main className="lp-wrap">

        <section className="lp-hero">
          <span className="lp-chip">
            <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            For anyone too busy to shop &mdash; it&apos;s okay, that&apos;s what we&apos;re for
          </span>
          <h1 className="lp-h1">Last-minute gift, found fast.</h1>
          <p className="lp-sub">
            You know the person. You just need the present. Tell us what it&apos;s for, what they&apos;re into,
            and their vibe &mdash; get specific, thoughtful ideas you can buy right now and have delivered in time.
          </p>

          <div className="lp-finder">
            <div className="lp-field">
              <label>What is it for?</label>
              <div className="lp-val">my brother&apos;s 30th birthday</div>
            </div>
            <div className="lp-field">
              <label>What are they into?</label>
              <div className="lp-val">gaming, gadgets, cycling</div>
            </div>
            <div className="lp-field">
              <label>What&apos;s their vibe?</label>
              <div className="lp-val">
                techy &amp; minimalist
                <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 4.3L18 9l-4.1 1.7L12 15l-1.9-4.3L6 9l4.1-1.7z" /></svg>
              </div>
            </div>
            <Link className="lp-btn" href="/app">Find the gift <ArrowIcon /></Link>
            <div className="lp-trust">
              <span><svg className="lp-ic b" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h7l-1 8 10-12h-7z" /></svg> A great idea in 30 seconds</span>
              <span><TruckIcon /> Picks that arrive in time</span>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-eyebrow">what you get back</div>
          <div className="lp-grid-products">

            <div className="lp-card">
              <div className="lp-thumb"><svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><path d="M4 14a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" /><path d="M20 14a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2 1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1z" /></svg></div>
              <div className="lp-pname">Anker Soundcore Q45</div>
              <div className="lp-prow"><span className="lp-price">$99&ndash;$129</span><span className="lp-tag lp-tag-mid">Mid-range</span></div>
              <div className="lp-ship"><TruckIcon /> Arrives by tomorrow</div>
              <Link className="lp-buy" href="/app">Buy on Amazon &#8599;</Link>
            </div>

            <div className="lp-card">
              <div className="lp-thumb"><svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 11h4M8 9v4" /><circle cx="15.5" cy="11" r="1" /><circle cx="17.5" cy="13" r="1" /><path d="M7 7h10a4 4 0 0 1 4 4l-1 5a2.5 2.5 0 0 1-4.3 1.3L13 16h-2l-2.7 2.3A2.5 2.5 0 0 1 4 17l-1-6a4 4 0 0 1 4-4z" /></svg></div>
              <div className="lp-pname">PS5 Controller &mdash; Galactic Purple</div>
              <div className="lp-prow"><span className="lp-price">$74&ndash;$84</span><span className="lp-tag lp-tag-bud">Budget pick</span></div>
              <div className="lp-ship"><TruckIcon /> Arrives by tomorrow</div>
              <Link className="lp-buy" href="/app">Buy on Amazon &#8599;</Link>
            </div>

            <div className="lp-card">
              <div className="lp-thumb"><svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M6 17l4-9h5l3 9M10 8l2 5h6" /></svg></div>
              <div className="lp-pname">Lezyne Mega XL GPS Computer</div>
              <div className="lp-prow"><span className="lp-price">$199&ndash;$229</span><span className="lp-tag lp-tag-spl">Splurge</span></div>
              <div className="lp-ship"><TruckIcon /> Arrives by tomorrow</div>
              <Link className="lp-buy" href="/app">Buy on Amazon &#8599;</Link>
            </div>

          </div>
        </section>

        <section className="lp-section">
          <h2 className="lp-h2">Everything that gets you to the gift, faster</h2>
          <div className="lp-grid-proof">
            <div className="lp-proof">
              <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="13" cy="18" r="2" /></svg>
              <h3>Personalized to them</h3>
              <p>Gift ideas tailored by interest, occasion, and vibe &mdash; not a generic top-10.</p>
            </div>
            <div className="lp-proof">
              <TruckIcon />
              <h3>On Amazon, ships fast</h3>
              <p>Every pick is available on Amazon and filtered for fast delivery.</p>
            </div>
            <div className="lp-proof">
              <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5a3 3 0 0 1 0 6M21 20a6 6 0 0 0-5-5.9" /></svg>
              <h3>Saved recipient profiles</h3>
              <p>Save who you buy for, and every next search is even faster.</p>
            </div>
            <div className="lp-proof">
              <svg className="lp-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1.6" /></svg>
              <h3>Year-round reminders</h3>
              <p>Curated gift lists sent ahead of every special occasion, all year.</p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-cta">
            <h2 className="lp-h2">Find their gift in under a minute</h2>
            <p>Six quick taps &mdash; who it&apos;s for, what they&apos;re into, their vibe &mdash; and you&apos;ve got specific ideas ready to buy.</p>
            <Link className="lp-btn" href="/app">Get started <ArrowIcon /></Link>
          </div>
        </section>

      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-foot">
          <span className="lp-brand"><GiftIcon /> LastMinuteGiftFinder</span>
          <p className="lp-disclosure">
            As an Amazon Associate we earn from qualifying purchases. Prices and availability are accurate
            as of the time shown and subject to change.
          </p>
        </div>
      </footer>
    </div>
  );
}
