export const metadata = { title: 'Privacy policy · SolarKal Rooftop Leads' }

export default function Privacy() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px', lineHeight: 1.6 }}>
      <h1>Privacy policy</h1>
      <p className="muted">SolarKal Rooftop Leads · last updated November 3, 2026</p>

      <h2>What this app is</h2>
      <p>
        SolarKal Rooftop Leads is an internal tool used by SolarKal staff to rank commercial properties and the companies
        that own them. It is available only to people with a SolarKal (@solarkal.com) Google account.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Sign-in information.</strong> When you sign in with Google we receive your name and email address. We use them
          only to confirm that you belong to SolarKal and to set your access level (viewer or approver). We do not request access
          to your Gmail, Drive, calendar or contacts.
        </li>
        <li>
          <strong>Business data.</strong> The app stores information about commercial properties and about companies and their
          business contacts (name, job title, work email and phone) taken from SolarKal&apos;s own CRM and from public sources. It is
          used for SolarKal&apos;s sales and marketing outreach.
        </li>
      </ul>

      <h2>How we use and share it</h2>
      <p>
        Data is used only to run this tool and for SolarKal&apos;s own business. We do not sell it or use it for advertising.
        The app is hosted on Vercel and its database runs on Supabase, which process the data on our behalf.
      </p>

      <h2>Keeping and removing data</h2>
      <p>
        Sign-in records stay while you have access. If you are a business contact listed in the app and want your details corrected
        or removed, or if you are a staff member who wants your access removed, contact us at the address below.
      </p>

      <h2>Contact</h2>
      <p>sri.krishna.poduri@solarkal.com</p>
    </main>
  )
}
