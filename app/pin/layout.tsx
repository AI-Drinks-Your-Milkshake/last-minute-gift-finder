// Bare layout for the /pin/* routes. No marketing nav, no app chrome —
// just a centered backdrop so the 1000×1500 pin canvas is comfortable
// to review in a browser.
//
// When Puppeteer later renders a pin, it targets the [data-pin-root]
// element inside PinTemplate via element-screenshot rather than full-
// page, so the backdrop styling here is reviewer-only and never lands
// in the captured JPEG.

export default function PinLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#1a1a20',
        padding: '40px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {children}
    </div>
  );
}
