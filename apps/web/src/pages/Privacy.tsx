export default function Privacy() {
  return (
    <main className="main prose" style={{ margin: '0 auto' }}>
      <h1>Privacy Policy</h1>
      <p className="subtitle">Last updated: July 2026</p>

      <p>
        This policy describes how the Social Media Scheduler ("the Service") collects, uses,
        and protects information when you connect your social media and advertising accounts.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details you provide: name, email, business name.</li>
        <li>
          OAuth tokens for the platforms you choose to connect (Facebook, Instagram, TikTok,
          Pinterest, WhatsApp Business, Google Ads). Tokens are encrypted at rest and are used
          solely to publish content you schedule and to retrieve performance metrics for your
          own posts.
        </li>
        <li>The content you compose: captions, media, schedules, and publishing results.</li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We never post without an explicit schedule or action from you.</li>
        <li>We never sell or share your data or your audience's data with third parties.</li>
        <li>We never read private messages or content beyond what publishing requires.</li>
      </ul>

      <h2>Data deletion</h2>
      <p>
        Disconnecting a platform immediately deletes its stored tokens. You may request full
        deletion of your account and all associated data at any time by contacting us, and we
        honour platform-initiated deletion callbacks (e.g. Meta's data deletion requests).
      </p>

      <h2>Contact</h2>
      <p>Questions about this policy: iivii.malotana@gmail.com</p>
    </main>
  )
}
