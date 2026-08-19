import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import GoogleLogin from "@/components/GoogleLogin";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

export default async function Home() {
  const cookieStore = await cookies();
  const user = verifySessionToken(cookieStore.get(COOKIE_NAME)?.value);
  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-hero">
          <span className="eyebrow">Internal recruitment system</span>
          <h1>Start every hire with the right role.</h1>
          <p>Create a staff addition or replacement request, align the job requirements with HR, and move it through management approval before recruitment begins.</p>
          <div className="steps-preview">
            <div><span className="step-dot">1</span> HR or management submits a request</div>
            <div><span className="step-dot">2</span> HR confirms role requirements</div>
            <div><span className="step-dot">3</span> Management approves before posting</div>
          </div>
        </div>
        <div className="login-panel">
          <h2>Welcome</h2>
          <p>Sign in using your McLink Group Google Workspace account to create and monitor role requests.</p>
          <GoogleLogin />
          <div className="notice"><strong>Company access only.</strong><br />The backend verifies the Google token and only accepts accounts managed under <strong>mclinkgroup.com</strong>.</div>
        </div>
      </section>
    </main>
  );
}
